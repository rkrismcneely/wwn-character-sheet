import {canManageCampaignContent} from "./authorization.ts";
import {validateAudioUploadDraft} from "./recap-drive-upload.ts";
import {getGmDropboxAccessToken} from "./recap-dropbox-token.ts";
import {getCampaignSessionRecap} from "./session-recaps.ts";
import {CampaignServiceError,loadCampaignAccess,requireActiveCampaign,type CampaignServiceStatus} from "./service.ts";
import type {CampaignActor} from "./types.ts";
import type {DropboxSettings} from "../account/recap-dropbox-oauth.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SESSION=/^[\w:.-]{8,1024}$/u;
export const DROPBOX_UPLOAD_CHUNK=8*1024*1024;
type DraftInput={recapId?:unknown;connectionId?:unknown;filename?:unknown;
  mimeType?:unknown;byteSize?:unknown;durationMs?:unknown};
type Asset={id:string;connectionId:string;recapId:string;status:string;
  label:string;mimeType:string;byteSize:number;remoteFileId:string|null};
type FileMeta={id?:unknown;name?:unknown;size?:unknown;path_lower?:unknown;".tag"?:unknown};
const error=(msg:string,status:CampaignServiceStatus=409)=>new CampaignServiceError(msg,status);

async function requireGm(db:D1Database,actor:CampaignActor|null,campaignId:string){
  if(!actor)throw error("Sign in required.",401);
  const context=await loadCampaignAccess(db,actor,campaignId);
  requireActiveCampaign(context.campaign);
  if(!canManageCampaignContent(actor,context.campaign,context.membership))
    throw error("Only campaign GMs can attach session audio.",403);
  return context.campaign;
}
function filePath(asset:Pick<Asset,"id"|"label">){
  const safe=asset.label.replace(/[^a-zA-Z0-9 ._()-]/gu,"_").replace(/^\.+/u,"_").slice(0,100)||"session.m4a";
  return "/Tales Without End/Session Audio/"+asset.id+"-"+safe;
}
function validMetadata(value:unknown,asset:Asset):value is FileMeta&{id:string;size:number}{
  const f=value as FileMeta|null;
  return Boolean(f&&typeof f.id==="string"&&/^id:[A-Za-z0-9_-]{10,256}$/u.test(f.id)&&
    f[".tag"]==="file"&&typeof f.size==="number"&&f.size===asset.byteSize&&
    typeof f.path_lower==="string"&&f.path_lower===filePath(asset).toLowerCase());
}
async function metadata(token:string,path:string):Promise<unknown|null>{
  let resp:Response;
  try{
    resp=await fetch("https://api.dropboxapi.com/2/files/get_metadata",{
      method:"POST",redirect:"manual",headers:{authorization:"Bearer "+token,
        "content-type":"application/json"},
      body:JSON.stringify({path}),signal:AbortSignal.timeout(15000)});
  }catch{throw error("Dropbox could not verify the saved recording.",503);}
  if(resp.status===409)return null;
  if(!resp.ok)throw error("Dropbox metadata verification is unavailable.",503);
  return resp.json();
}
async function ensureDropboxFolders(token:string){
  for(const path of ["/Tales Without End","/Tales Without End/Session Audio"]){
    let response:Response;
    try{response=await fetch("https://api.dropboxapi.com/2/files/create_folder_v2",{
      method:"POST",redirect:"manual",
      headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({path,autorename:false}),signal:AbortSignal.timeout(15000)});
    }catch{throw error("Dropbox could not create the recording folder.",503);}
    if(response.ok)continue;
    if(response.status===409){
      // A pre-existing folder is fine, but a conflicting file is not.
      const existing=await metadata(token,path);
      if(existing&&typeof existing==="object"&&".tag" in existing&&
        (existing as {".tag":unknown})[".tag"]==="folder")continue;
    }
    throw error("Dropbox could not create the Tales Without End recording folder.",409);
  }
}
async function assetFor(db:D1Database,actor:CampaignActor,campaignId:string,assetId:string){
  const campaign=await requireGm(db,actor,campaignId);
  if(!UUID.test(assetId))throw error("Invalid audio upload.",422);
  const asset=await db.prepare("SELECT id,connection_id AS connectionId,recap_id AS recapId,"+
    "status,label,mime_type AS mimeType,byte_size AS byteSize,remote_file_id AS remoteFileId "+
    "FROM campaign_recap_audio_assets WHERE id=? AND campaign_id=? AND storage_owner_user_id=? "+
    "AND processing_job_id IS NULL")
    .bind(assetId,campaign.id,actor.userId).first<Asset>();
  if(!asset)throw error("Recording upload was not found.",404);
  await getCampaignSessionRecap(db,actor,campaignId,asset.recapId);
  return {asset,campaign};
}
async function markReady(db:D1Database,asset:Asset,campaignId:string,user:string,id:string){
  const result=await db.prepare("UPDATE campaign_recap_audio_assets "+
    "SET remote_file_id=?,status='ready',updated_at=? "+
    "WHERE id=? AND campaign_id=? AND storage_owner_user_id=? AND status='preparing'")
    .bind(id,new Date().toISOString(),asset.id,campaignId,user).run();
  if(result.meta.changes!==1)throw error("Recording was updated elsewhere. Refresh saved recordings.",409);
}

export async function beginDropboxAudio(db:D1Database,actor:CampaignActor|null,
  campaignId:string,input:DraftInput,settings:DropboxSettings){
  const campaign=await requireGm(db,actor,campaignId);
  const recap=await getCampaignSessionRecap(db,actor,campaignId,input.recapId);
  if(typeof input.connectionId!=="string"||!UUID.test(input.connectionId))
    throw error("Choose a connected Dropbox account.",422);
  let draft:ReturnType<typeof validateAudioUploadDraft>;
  try{draft=validateAudioUploadDraft(input);}
  catch(e){throw error(e instanceof Error?e.message:"Invalid audio recording.",422);}
  const outstanding=await db.prepare("SELECT COUNT(*) AS count FROM campaign_recap_audio_assets "+
    "WHERE storage_owner_user_id=? AND status='preparing'")
    .bind(actor!.userId).first<{count:number}>();
  if(Number(outstanding?.count??0)>=10)throw error("Too many unfinished uploads. Recover or finish one first.",409);
  const token=await getGmDropboxAccessToken(db,settings,actor!.userId,input.connectionId);
  await ensureDropboxFolders(token);
  let response:Response;
  try{
    response=await fetch("https://content.dropboxapi.com/2/files/upload_session/start",{
      method:"POST",redirect:"manual",headers:{authorization:"Bearer "+token,
        "content-type":"application/octet-stream","Dropbox-API-Arg":JSON.stringify({close:false})},
      body:new Uint8Array(0),signal:AbortSignal.timeout(15000)});
  }catch{throw error("Dropbox could not begin the audio upload.",503);}
  if(!response.ok)throw error("Dropbox declined to begin the audio upload.",409);
  const result=await response.json() as {session_id?:unknown};
  if(typeof result.session_id!=="string"||!SESSION.test(result.session_id))
    throw error("Dropbox returned an invalid upload session.",502);
  const assetId=crypto.randomUUID(),now=new Date().toISOString();
  await db.prepare("INSERT INTO campaign_recap_audio_assets "+
    "(id,campaign_id,recap_id,connection_id,storage_owner_user_id,label,mime_type,byte_size,duration_ms,"+
    "track_index,offset_ms,primary_audio,status,created_at,updated_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?,0,0,0,'preparing',?,?)")
    .bind(assetId,campaign.id,recap.id,input.connectionId,actor!.userId,draft.filename,
      draft.mimeType,draft.byteSize,draft.durationMs,now,now).run();
  return {assetId,sessionId:result.session_id,chunkBytes:DROPBOX_UPLOAD_CHUNK};
}

export async function appendDropboxAudio(db:D1Database,actor:CampaignActor|null,
  campaignId:string,request:Request,settings:DropboxSettings){
  const url=new URL(request.url);
  const assetId=url.searchParams.get("assetId")??"";
  const {asset,campaign}=await assetFor(db,actor!,campaignId,assetId);
  if(asset.status!=="preparing")throw error("This recording is no longer awaiting an upload.",409);
  const sessionId=request.headers.get("x-twe-dropbox-session")??"";
  const offset=Number(request.headers.get("x-twe-dropbox-offset"));
  const length=Number(request.headers.get("x-twe-dropbox-length"));
  if(!SESSION.test(sessionId)||!Number.isSafeInteger(offset)||offset<0||
    !Number.isSafeInteger(length)||length<1||length>DROPBOX_UPLOAD_CHUNK||
    offset+length>asset.byteSize||!request.body)
    throw error("Invalid Dropbox recording chunk.",422);
  const declared=request.headers.get("content-length");
  if(declared!==null&&Number(declared)!==length)
    throw error("Dropbox chunk body length mismatch.",422);
  const final=offset+length===asset.byteSize;
  const token=await getGmDropboxAccessToken(db,settings,actor!.userId,asset.connectionId);
  // Dropbox upload sessions accept bytes through append_v2. The final
  // append must close the session; finish then commits with an EMPTY body.
  const args={cursor:{session_id:sessionId,offset},close:final};
  let appended:Response;
  try{
    appended=await fetch("https://content.dropboxapi.com/2/files/upload_session/append_v2",{
      method:"POST",redirect:"manual",headers:{authorization:"Bearer "+token,
        "content-type":"application/octet-stream","Dropbox-API-Arg":JSON.stringify(args)},
      body:request.body,signal:AbortSignal.timeout(60000)});
  }catch{throw error("Dropbox upload connection interrupted. Check saved progress before retrying.",503);}
  if(!appended.ok){
    if(appended.status===429||appended.status>=500)
      throw error("Dropbox temporarily rejected the chunk. Check the upload status.",503);
    throw error("Dropbox rejected this chunk. Restart the upload if its session is no longer valid.",409);
  }
  if(!final)return {receivedBytes:offset+length,ready:false};
  let resp:Response;
  try{
    resp=await fetch("https://content.dropboxapi.com/2/files/upload_session/finish",{
      method:"POST",redirect:"manual",headers:{authorization:"Bearer "+token,
        "content-type":"application/octet-stream",
        "Dropbox-API-Arg":JSON.stringify({cursor:{session_id:sessionId,offset:asset.byteSize},
          commit:{path:filePath(asset),mode:"add",autorename:false,mute:true,strict_conflict:true}})},
      body:new Uint8Array(0),signal:AbortSignal.timeout(30000)});
  }catch{throw error("Dropbox may have saved the file. Use Find saved recording before uploading again.",503);}
  if(!resp.ok){
    if(resp.status===429||resp.status>=500)
      throw error("Dropbox could not confirm the final file. Use Find saved recording before retrying.",503);
    throw error("Dropbox could not commit the recording. Check the destination folder.",409);
  }
  let data:unknown;
  try{data=await resp.json();}catch{
    throw error("Dropbox saved audio but returned invalid metadata. Try recovery.",503);
  }
  if(!validMetadata(data,asset))throw error("Dropbox file metadata did not match the original audio. Try recovery.",409);
  await markReady(db,asset,campaign.id,actor!.userId,data.id);
  return {receivedBytes:asset.byteSize,assetId,ready:true};
}

export async function recoverDropboxAudio(db:D1Database,actor:CampaignActor|null,
  campaignId:string,input:{assetId?:unknown;recapId?:unknown},settings:DropboxSettings){
  const {asset,campaign}=await assetFor(db,actor!,campaignId,String(input.assetId??""));
  if(asset.recapId!==input.recapId)throw error("Wrong session recap.",403);
  if(asset.status==="ready")return {found:true,ready:true};
  if(asset.status!=="preparing")throw error("Recording cannot be recovered.",409);
  const token=await getGmDropboxAccessToken(db,settings,actor!.userId,asset.connectionId);
  const file=await metadata(token,filePath(asset));
  if(!file)return {found:false,ready:false};
  if(!validMetadata(file,asset))throw error("The Dropbox recording does not match this upload.",409);
  await markReady(db,asset,campaign.id,actor!.userId,file.id);
  return {found:true,ready:true};
}
