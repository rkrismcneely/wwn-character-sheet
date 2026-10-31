import { canManageCampaignContent } from "./authorization.ts";
import {completedRecapDriveFile,completedRecapDriveFileQuery} from "./recap-drive-recovery.ts";
import {issueDriveUploadTicket,verifyDriveUploadTicket,parseDriveRelayRange} from "./recap-drive-upload-relay.ts";
import { validateAudioUploadDraft, validateDriveSessionUrl, type UploadDraft } from "./recap-drive-upload.ts";
import { getGmDriveAccessToken } from "./recap-drive-token.ts";
import { ensureRecapDriveFolder } from "./recap-drive-folder.ts";
import { getCampaignSessionRecap } from "./session-recaps.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";
import type { DriveSettings } from "../account/recap-google-drive-oauth.ts";
import { GEMINI_BACKGROUND_MAX_CLIP_BYTES,GEMINI_BACKGROUND_MAX_CLIP_MS } from "./recap-gemini-background.ts";

type StartInput = {
  recapId?:unknown; connectionId?:unknown;
  filename?:unknown;mimeType?:unknown;byteSize?:unknown;durationMs?:unknown;processingJobId?:unknown;
};
type FinishInput = { assetId?:unknown;remoteFileId?:unknown };
type AssetRow = {
  id:string;connectionId:string;storageOwnerUserId:string;remoteFileId:string|null;
  byteSize:number;mimeType:string;status:string;recapId:string;processingJobId:string|null;
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

async function requireGm(db:D1Database,actor:CampaignActor|null,campaignId:string) {
  if(!actor) throw new CampaignServiceError("Sign in required.",401);
  const data=await loadCampaignAccess(db,actor,campaignId);
  requireActiveCampaign(data.campaign);
  if(!canManageCampaignContent(actor,data.campaign,data.membership)) {
    throw new CampaignServiceError("Only campaign GMs can attach session recordings.",403);
  }
  return data.campaign;
}
function draftUpload(input:StartInput): UploadDraft {
  try {return validateAudioUploadDraft(input);}
  catch(e) {throw new CampaignServiceError(e instanceof Error?e.message:"Invalid audio recording.",422);}
}
export async function beginGmDriveAudioUpload(
  db:D1Database,actor:CampaignActor|null,campaignId:string,input:StartInput,settings:DriveSettings,
):Promise<{assetId:string;uploadSessionUrl:string;uploadTicket:string;uploadIssuedAt:number;chunkBytes:number}> {
  const campaign=await requireGm(db,actor,campaignId);
  const recap=await getCampaignSessionRecap(db,actor,campaignId,input.recapId);
  if(typeof input.connectionId!=="string" || !UUID_PATTERN.test(input.connectionId)) {
    throw new CampaignServiceError("Select your own Drive connection.",422);
  }
  const draft=draftUpload(input);
  // Hidden processing clips use the *same* GM's Drive, never site-owner R2.
  let processingJobId:string|null=null;
  if(input.processingJobId!==undefined&&input.processingJobId!==null){
    if(typeof input.processingJobId!=="string"||!UUID_PATTERN.test(input.processingJobId)||
      draft.mimeType!=="audio/wav"||draft.byteSize>GEMINI_BACKGROUND_MAX_CLIP_BYTES||
      (draft.durationMs??0)>GEMINI_BACKGROUND_MAX_CLIP_MS||!draft.durationMs){
      throw new CampaignServiceError("Choose a bounded PCM WAV processing clip.",422);
    }
    const job=await db.prepare("SELECT id FROM campaign_recap_processing_jobs "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
      "AND provider='gemini' AND status='awaiting_source' AND paused_at IS NULL "+
      "AND cancelled_at IS NULL")
      .bind(input.processingJobId,campaign.id,recap.id,actor!.userId).first<{id:string}>();
    if(!job)throw new CampaignServiceError("Your Gemini job is no longer accepting audio.",409);
    processingJobId=job.id;
  }
  const outstanding=await db.prepare(
    "SELECT COUNT(*) AS count FROM campaign_recap_audio_assets WHERE storage_owner_user_id=? AND status='preparing'",
  ).bind(actor!.userId).first<{count:number}>();
  if(Number(outstanding?.count??0)>=10){
    throw new CampaignServiceError("Too many unfinished recording uploads. Finish or clean up existing uploads.",409);
  }
  const accessToken=await getGmDriveAccessToken(db,settings,actor!.userId,input.connectionId);
  const assetId=crypto.randomUUID();
  const folderId=processingJobId?null:await ensureRecapDriveFolder(accessToken);
  // The appProperties marker is verified *server-side* when upload completes.
  const metadata={
    name:draft.filename,mimeType:draft.mimeType,
    ...(folderId?{parents:[folderId]}:{}),
    appProperties:{tweAudioAssetId:assetId,tweCampaignId:campaign.id},
  };
  const response=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,appProperties",{
    method:"POST",redirect:"manual",
    headers:{
      authorization:"Bearer "+accessToken,
      "content-type":"application/json; charset=UTF-8",
      "x-upload-content-type":draft.mimeType,
      "x-upload-content-length":String(draft.byteSize),
    },
    body:JSON.stringify(metadata),signal:AbortSignal.timeout(15000),
  });
  const location=response.headers.get("Location");
  if(!response.ok || !location) throw new CampaignServiceError("Google Drive could not prepare the recording upload.",409);
  let uploadSessionUrl:string;
  try{uploadSessionUrl=validateDriveSessionUrl(location);}
  catch{throw new CampaignServiceError("Google Drive returned an invalid upload session.",409);}
  const now=new Date().toISOString();
  await db.prepare(
    "INSERT INTO campaign_recap_audio_assets "+
    "(id,campaign_id,recap_id,connection_id,storage_owner_user_id,label,mime_type,byte_size,duration_ms,track_index,offset_ms,primary_audio,status,created_at,updated_at,processing_job_id) "+
    "VALUES (?,?,?,?,?,?,?,?,?,0,0,0,'preparing',?,?,?)",
  ).bind(assetId,campaign.id,recap.id,input.connectionId,actor!.userId,draft.filename,
    draft.mimeType,draft.byteSize,draft.durationMs,now,now,processingJobId).run();
  // This URL grants upload permission only. It must never be shown to players
  // or included in persistent logs / normal player asset responses.
  const uploadIssuedAt=Date.now();
  const uploadTicket=await issueDriveUploadTicket(settings,{
    userId:actor!.userId,campaignId:campaign.id,assetId,uploadSessionUrl,issuedAt:uploadIssuedAt,
  });
  return {assetId,uploadSessionUrl,uploadTicket,uploadIssuedAt,chunkBytes:8*1024*1024};
}

export async function finishGmDriveAudioUpload(
  db:D1Database,actor:CampaignActor|null,campaignId:string,input:FinishInput,settings:DriveSettings,
):Promise<{assetId:string;ready:true}> {
  const campaign=await requireGm(db,actor,campaignId);
  if(typeof input.assetId!=="string"||!UUID_PATTERN.test(input.assetId)||
    typeof input.remoteFileId!=="string" || !/^[a-zA-Z0-9_-]{5,256}$/u.test(input.remoteFileId)){
    throw new CampaignServiceError("Select a completed audio upload.",422);
  }
  const asset=await db.prepare(
    "SELECT id,connection_id AS connectionId,storage_owner_user_id AS storageOwnerUserId,"+
    "remote_file_id AS remoteFileId,byte_size AS byteSize,mime_type AS mimeType,status,"+
    "recap_id AS recapId,processing_job_id AS processingJobId "+
    "FROM campaign_recap_audio_assets WHERE id=? AND campaign_id=? AND storage_owner_user_id=?",
  ).bind(input.assetId,campaign.id,actor!.userId).first<AssetRow>();
  if(!asset)throw new CampaignServiceError("This audio upload could not be found.",404);
  if(asset.status==="ready" && asset.remoteFileId===input.remoteFileId){
    return {assetId:asset.id,ready:true};
  }
  if(asset.status!=="preparing") throw new CampaignServiceError("This audio upload is not awaiting completion.",409);
  const accessToken=await getGmDriveAccessToken(db,settings,actor!.userId,asset.connectionId);
  const url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(input.remoteFileId)+
    "?fields=id,size,mimeType,appProperties,trashed";
  const response=await fetch(url,{
    redirect:"manual",headers:{authorization:"Bearer "+accessToken},
    signal:AbortSignal.timeout(15000),
  });
  if(!response.ok) throw new CampaignServiceError("Google Drive could not verify the uploaded recording.",409);
  const file=await response.json() as {
    id?:unknown;size?:unknown;mimeType?:unknown;
    appProperties?:Record<string,unknown>;trashed?:unknown;
  };
  if(file.id!==input.remoteFileId || file.trashed===true ||
    file.size!==String(asset.byteSize) || file.mimeType!==asset.mimeType ||
    file.appProperties?.tweAudioAssetId!==asset.id ||
    file.appProperties?.tweCampaignId!==campaign.id){
    throw new CampaignServiceError("Drive recording does not match this GM's upload.",422);
  }
  const result=await db.prepare(
    "UPDATE campaign_recap_audio_assets SET remote_file_id=?,status='ready',updated_at=? "+
    "WHERE id=? AND campaign_id=? AND storage_owner_user_id=? AND status='preparing'",
  ).bind(input.remoteFileId,new Date().toISOString(),asset.id,campaign.id,actor!.userId).run();
  if(result.meta.changes!==1)throw new CampaignServiceError("Recording upload was changed elsewhere.",409);
  return {assetId:asset.id,ready:true};
}

/** Relay only authenticated GM-owned, still-preparing uploads to their original
 * signed Google session URL. This is a bounded streaming transfer; no audio
 * bytes are buffered in memory, placed in R2 or persisted in D1.
 */
export async function relayGmDriveAudioUpload(db:D1Database,actor:CampaignActor|null,
  campaignId:string,request:Request,settings:DriveSettings):Promise<Response>{
  const campaign=await requireGm(db,actor,campaignId);
  const inputUrl=new URL(request.url);
  const assetId=inputUrl.searchParams.get("assetId");
  if(!assetId||!UUID_PATTERN.test(assetId))
    throw new CampaignServiceError("Choose a valid recording upload.",422);
  const asset=await db.prepare("SELECT id,byte_size AS byteSize,recap_id AS recapId "+
    "FROM campaign_recap_audio_assets WHERE id=? AND campaign_id=? "+
    "AND storage_owner_user_id=? AND status='preparing' LIMIT 1")
    .bind(assetId,campaign.id,actor!.userId).first<{id:string;byteSize:number;recapId:string}>();
  if(!asset)throw new CampaignServiceError("This recording upload is no longer available.",404);
  // Check the recap remains visible/manageable by the requesting GM.
  await getCampaignSessionRecap(db,actor,campaignId,asset.recapId);
  const url=request.headers.get("x-twe-drive-upload-session")??"";
  const issuedAt=Number(request.headers.get("x-twe-drive-upload-issued-at")??"");
  const ticket=request.headers.get("x-twe-drive-upload-ticket")??"";
  const authorized=await verifyDriveUploadTicket(settings,{
    userId:actor!.userId,campaignId:campaign.id,assetId,uploadSessionUrl:url,issuedAt,
  },ticket);
  if(!authorized)throw new CampaignServiceError("Upload authorization expired. Start the upload again.",403);
  const range=request.headers.get("content-range");
  const parsed=parseDriveRelayRange(range,asset.byteSize);
  if(!parsed)throw new CampaignServiceError("Invalid recording chunk or upload offset.",422);
  const body=request.body;
  const declaredSize=request.headers.get("content-length");
  if((parsed.kind==="chunk"&&!body)||(parsed.kind==="probe"&&body)||
      (declaredSize!==null&&Number(declaredSize)!==parsed.length)){
    throw new CampaignServiceError("Upload chunk size does not match the recording.",422);
  }
  let response:Response;
  try{
    response=await fetch(validateDriveSessionUrl(url),{
      method:"PUT",redirect:"manual",headers:{"content-range":range!},
      ...(body?{body}:{}),
      signal:AbortSignal.timeout(60_000),
    });
  }catch{
    throw new CampaignServiceError("Could not reach Google Drive for this chunk. Retry the recording upload.",503);
  }
  const headers=new Headers({"cache-control":"private, no-store","referrer-policy":"no-referrer"});
  if(response.status===308){
    // Only the acknowledged offset is returned, not Google's upload URL or OAuth credentials.
    const acknowledged=response.headers.get("range");
    if(acknowledged&&/^bytes=0-\d+$/u.test(acknowledged))headers.set("range",acknowledged);
    return new Response(null,{status:308,headers});
  }
  if(response.status===200||response.status===201){
    let remote:unknown;
    try{remote=await response.json();}
    catch{throw new CampaignServiceError("Google Drive returned an invalid upload receipt.",502);}
    const file=remote as {id?:unknown;name?:unknown;size?:unknown;mimeType?:unknown};
    if(!file||typeof file.id!=="string"||!/^[a-zA-Z0-9_-]{5,256}$/u.test(file.id))
      throw new CampaignServiceError("Google Drive did not confirm the saved recording.",502);
    return Response.json({id:file.id,...(typeof file.name==="string"?{name:file.name}:{}),
      ...(typeof file.size==="string"?{size:file.size}:{}),
      ...(typeof file.mimeType==="string"?{mimeType:file.mimeType}:{})},
      {status:response.status,headers});
  }
  // Google error details may reveal private info; never echo them.
  if(response.status===404||response.status===410)
    throw new CampaignServiceError("Google Drive upload session expired. Restart the upload.",409);
  if(response.status===403)
    throw new CampaignServiceError("Google Drive declined this upload. Reconnect Drive in Account if this continues.",403);
  if(response.status===429||response.status>=500)
    throw new CampaignServiceError("Google Drive is temporarily unable to receive this chunk. Retry the upload.",503);
  throw new CampaignServiceError("Google Drive rejected this recording chunk. Check the file and retry.",409);
}


/** Recover an audio upload which fully reached Google Drive but whose final
 * browser receipt or TWE completion request was lost. The private Google
 * appProperties marker is assigned by TWE before the upload begins, and
 * the existing finish path independently verifies file size, MIME and both
 * markers before linking the recording. No file data is downloaded here.
 */
export async function recoverGmDriveAudioUpload(
  db:D1Database,actor:CampaignActor|null,campaignId:string,
  input:{assetId?:unknown;recapId?:unknown},settings:DriveSettings,
):Promise<{found:boolean;ready:boolean}>{
  const campaign=await requireGm(db,actor,campaignId);
  const recap=await getCampaignSessionRecap(db,actor,campaignId,input.recapId);
  if(typeof input.assetId!=="string"||!UUID_PATTERN.test(input.assetId))
    throw new CampaignServiceError("Choose a valid recording upload to recover.",422);
  const asset=await db.prepare(
    "SELECT id,connection_id AS connectionId,status,byte_size AS byteSize,mime_type AS mimeType FROM campaign_recap_audio_assets "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND storage_owner_user_id=? "+
    "AND processing_job_id IS NULL LIMIT 1",
  ).bind(input.assetId,campaign.id,recap.id,actor!.userId)
    .first<{id:string;connectionId:string;status:string;byteSize:number;mimeType:string}>();
  if(!asset)throw new CampaignServiceError("This is not one of your recording uploads.",404);
  if(asset.status==="ready")return {found:true,ready:true};
  if(asset.status!=="preparing")
    throw new CampaignServiceError("This recording cannot be recovered from an unfinished upload.",409);
  const token=await getGmDriveAccessToken(db,settings,actor!.userId,asset.connectionId);
  const q=completedRecapDriveFileQuery(asset.id,campaign.id);
  const params=new URLSearchParams({
    q,pageSize:"2",fields:"nextPageToken,incompleteSearch,files(id,size,mimeType,appProperties,trashed)",
    spaces:"drive",
  });
  let response:Response;
  try{
    response=await fetch("https://www.googleapis.com/drive/v3/files?"+params.toString(),{
      redirect:"manual",headers:{authorization:"Bearer "+token},
      signal:AbortSignal.timeout(15000),
    });
  }catch{
    throw new CampaignServiceError("Google Drive search is temporarily unavailable. Retry recovery.",409);
  }
  if(!response.ok||response.redirected)
    throw new CampaignServiceError("Google Drive could not search for your completed recording.",409);
  let results:unknown;
  try{results=await response.json();}
  catch{throw new CampaignServiceError("Google Drive returned an invalid recording search result.",409);}
  let remoteFileId:string|null;
  try{
    remoteFileId=completedRecapDriveFile(results,{
      assetId:asset.id,campaignId:campaign.id,byteSize:asset.byteSize,mimeType:asset.mimeType,
    });
  }catch{
    throw new CampaignServiceError("The saved Drive file did not match this upload. Nothing was attached.",409);
  }
  if(!remoteFileId)return {found:false,ready:false};
  // Reuse the original secured final verification, including matching actual
  // metadata, before changing the TWE asset from preparing to ready.
  await finishGmDriveAudioUpload(db,actor,campaignId,{
    assetId:asset.id,remoteFileId,
  },settings);
  return {found:true,ready:true};
}
