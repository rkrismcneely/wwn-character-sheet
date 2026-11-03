import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {CANONICAL_ORIGIN} from "@/lib/auth-constants";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {CampaignServiceError,getCampaignD1,loadCampaignAccess,
  requireActiveCampaign} from "@/lib/campaigns/service";
import {getGmDriveAccessToken} from "@/lib/campaigns/recap-drive-token";
import {planM4aPilotExcerpt,M4A_PILOT_MAX_BYTES} from "@/lib/campaigns/recap-m4a-remux";
import {mintPilotCapability} from "@/lib/campaigns/recap-v2-pilot-capability";
import {decryptGroqUserKey,type RecapAIEncryptionSettings}
  from "@/lib/account/recap-groq-key";
import {normalizeGroqAudioSegments} from "@/lib/campaigns/recap-groq-audio";
import type {DriveSettings} from "@/lib/account/recap-google-drive-oauth";

type Context={params:Promise<{id:string}>};
type Asset={
  id:string;remoteFileId:string;connectionId:string;byteSize:number;
  durationMs:number|null;mimeType:string;
};
type GroqConnection={id:string;ciphertext:string;nonce:string;version:number};
type PilotRow={status:string;model:string;excerptEndMs:number;
  excerptBytes:number;errorCode:string|null;transcriptKey:string|null;updatedAt:string};
type Settings=DriveSettings&RecapAIEncryptionSettings&{
  BUCKET:R2Bucket;TWE_RECAP_V2_PILOT_ENABLED?:string;
};
const noStore={"cache-control":"private, no-store"};
const fail=(message:string,status:number)=>Response.json({error:message},{status,headers:noStore});
const config=()=>env as unknown as Settings;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DRIVE=/^[A-Za-z0-9_-]{5,256}$/u;
const MODEL="whisper-large-v3";
const API="https://api.groq.com/openai/v1/audio/transcriptions";
const MAX_PROVIDER_JSON=250_000;

async function authorize(request:Request,ctx:Context,recapId:unknown,assetId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await ctx.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only the GM can test recording transcription.",403);
  requireActiveCampaign(access.campaign);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  if(typeof assetId!=="string"||!UUID.test(assetId))
    throw new CampaignServiceError("Choose an existing recording.",422);
  const source=await db.prepare("SELECT a.id,a.remote_file_id AS remoteFileId,"+
    "a.connection_id AS connectionId,a.byte_size AS byteSize,"+
    "a.duration_ms AS durationMs,a.mime_type AS mimeType "+
    "FROM campaign_recap_audio_assets a "+
    "JOIN user_recap_storage_connections s ON s.id=a.connection_id "+
    "AND s.user_id=a.storage_owner_user_id "+
    "WHERE a.id=? AND a.campaign_id=? AND a.recap_id=? "+
    "AND a.storage_owner_user_id=? AND a.processing_job_id IS NULL "+
    "AND a.status='ready' AND s.status='connected' AND s.provider='google-drive'")
    .bind(assetId,access.campaign.id,recap.id,actor.userId).first<Asset>();
  if(!source||source.mimeType!=="audio/mp4"||
    !DRIVE.test(source.remoteFileId)||!Number.isSafeInteger(source.byteSize)||
    source.byteSize<128||source.byteSize>2*1024*1024*1024)
    throw new CampaignServiceError("Pilot currently supports existing M4A Drive audio only.",422);
  return {db,actor,access,recap,source};
}
async function plan(db:D1Database,owner:string,source:Asset){
  const token=await getGmDriveAccessToken(db,config(),owner,source.connectionId);
  const read=async(start:number,length:number):Promise<Uint8Array>=>{
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||
      start<0||length<=0||length>6*1024*1024||
      start+length>source.byteSize)throw Error("Invalid bounded M4A metadata read.");
    const response=await fetch("https://www.googleapis.com/drive/v3/files/"+
      encodeURIComponent(source.remoteFileId)+"?alt=media",{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(25_000),
      headers:{"authorization":"Bearer "+token,"accept-encoding":"identity",
        "range":"bytes="+start+"-"+(start+length-1)},
    });
    if(response.status!==206||response.redirected||
      response.headers.get("content-range")!==
      "bytes "+start+"-"+(start+length-1)+"/"+source.byteSize)
      throw Error("Drive file metadata did not match its saved audio asset.");
    const result=new Uint8Array(await response.arrayBuffer());
    if(result.length!==length)throw Error("Drive metadata is incomplete.");
    return result;
  };
  const clip=await planM4aPilotExcerpt(source,read);
  const bytes=Math.ceil(clip.prefixBase64.length*3/4)+clip.sourceEnd-clip.sourceStart;
  if(bytes>M4A_PILOT_MAX_BYTES||clip.endMs<20_000)
    throw Error("Pilot clip does not fit safely in free-tier upload limits.");
  return {clip,bytes};
}
async function groqConnection(db:D1Database,owner:string):Promise<GroqConnection|null>{
  return db.prepare("SELECT id,key_ciphertext AS ciphertext,key_nonce AS nonce,"+
    "key_version AS version FROM user_recap_groq_connections "+
    "WHERE user_id=? AND status='connected' AND key_ciphertext IS NOT NULL")
    .bind(owner).first<GroqConnection>();
}
async function stored(db:D1Database,campaign:string,recap:string,asset:string,owner:string){
  return db.prepare("SELECT status,model,excerpt_end_ms AS excerptEndMs,"+
    "excerpt_bytes AS excerptBytes,error_code AS errorCode,"+
    "transcript_key AS transcriptKey,updated_at AS updatedAt "+
    "FROM campaign_recap_v2_pilots WHERE campaign_id=? AND recap_id=? "+
    "AND audio_asset_id=? AND requested_by=?")
    .bind(campaign,recap,asset,owner).first<PilotRow>();
}
const transcriptKey=(campaign:string,recap:string,asset:string)=>
  "recap-v2-pilot/"+campaign+"/"+recap+"/"+asset+".json";
function publicState(p:PilotRow|null){
  return p?{status:p.status,model:p.model,excerptEndMs:p.excerptEndMs,
    excerptBytes:p.excerptBytes,errorCode:p.errorCode,updatedAt:p.updatedAt}:null;
}
/** Read-only readiness check, no AI request, no provider-signed URL exposed. */
export async function GET(request:Request,ctx:Context):Promise<Response>{
  try{
    if(config().TWE_RECAP_V2_PILOT_ENABLED!=="true")return fail("Pilot disabled.",404);
    const url=new URL(request.url);
    const info=await authorize(request,ctx,url.searchParams.get("recapId"),
      url.searchParams.get("assetId"));
    const current=await stored(info.db,info.access.campaign.id,info.recap.id,
      info.source.id,info.actor.userId);
    if(current){
      let transcript:unknown=null;
      if(current.status==="complete"&&current.transcriptKey){
        const obj=await config().BUCKET.get(current.transcriptKey);
        if(obj&&obj.size<=MAX_PROVIDER_JSON)transcript=await obj.json();
      }
      return Response.json({pilot:publicState(current),transcript},{headers:noStore});
    }
    const connected=Boolean(await groqConnection(info.db,info.actor.userId));
    const sample=await plan(info.db,info.actor.userId,info.source);
    return Response.json({ready:connected,requiresApproval:true,
      model:MODEL,excerptEndMs:sample.clip.endMs,excerptBytes:sample.bytes,
      originalByteSize:info.source.byteSize,
      notice:connected?"Ready for an explicitly approved single 2-minute Groq test.":
        "Connect your own Groq account before a pilot test. No inference has started."},
      {headers:noStore});
  }catch(e){return campaignErrorResponse(e,"Could not prepare private V2 transcription pilot.");}
}
/** Explicitly approved, once-only transcript test. No Gemini or recap writing. */
export async function POST(request:Request,ctx:Context):Promise<Response>{
  if(config().TWE_RECAP_V2_PILOT_ENABLED!=="true")return fail("Pilot disabled.",404);
  if(request.headers.get("origin")!==CANONICAL_ORIGIN||
    request.headers.get("sec-fetch-site")==="cross-site")
    return fail("Start the private pilot from TWE.",403);
  try{
    const body=await readBoundedJson(request,2048) as {
      recapId?:unknown;assetId?:unknown;approvedShare?:unknown;approvedQuota?:unknown;
    };
    if(body.approvedShare!==true||body.approvedQuota!==true)
      return fail("Approve Groq audio sharing and possible personal provider quota use.",422);
    const info=await authorize(request,ctx,body.recapId,body.assetId);
    const prior=await stored(info.db,info.access.campaign.id,info.recap.id,
      info.source.id,info.actor.userId);
    if(prior)return Response.json({alreadySubmitted:true,pilot:publicState(prior)},{status:409,headers:noStore});
    const row=await groqConnection(info.db,info.actor.userId);
    if(!row||row.version!==1)return fail("Connect and verify your own Groq API key first.",409);
    let groqKey:string;
    try{groqKey=await decryptGroqUserKey(config(),info.actor.userId,row.id,{
      ciphertext:row.ciphertext,nonce:row.nonce,version:1});}
    catch{return fail("Groq connection needs to be reconnected.",409);}
    const {clip,bytes}=await plan(info.db,info.actor.userId,info.source);
    const capability=await mintPilotCapability(config(),{
      campaignId:info.access.campaign.id,recapId:info.recap.id,
      assetId:info.source.id,ownerId:info.actor.userId,
    });
    const url=new URL("/api/recap-v2/pilot-source/"+info.source.id+".m4a",
      CANONICAL_ORIGIN);
    url.searchParams.set("campaignId",info.access.campaign.id);
    url.searchParams.set("recapId",info.recap.id);
    url.searchParams.set("exp",String(capability.expires));
    url.searchParams.set("nonce",capability.nonce);
    url.searchParams.set("sig",capability.signature);
    const id=crypto.randomUUID(),stamp=new Date().toISOString();
    const inserted=await info.db.prepare("INSERT OR IGNORE INTO campaign_recap_v2_pilots "+
      "(id,campaign_id,recap_id,audio_asset_id,requested_by,status,model,"+
      "excerpt_end_ms,excerpt_bytes,submitted_at,updated_at) "+
      "VALUES (?,?,?,?,?,'submitting',?,?,?, ?,?)")
      .bind(id,info.access.campaign.id,info.recap.id,info.source.id,
        info.actor.userId,MODEL,clip.endMs,bytes,stamp,stamp).run();
    if(inserted.meta.changes!==1)
      return fail("This recording already has a Groq pilot attempt. It will not be resubmitted.",409);

    // One provider POST per asset. If the response is lost, keep an uncertain
    // checkpoint and NEVER automatically repeat a potentially billed request.
    const form=new FormData();
    form.set("model",MODEL);
    form.set("url",url.toString());
    form.set("response_format","verbose_json");
    form.set("language","en");
    form.append("timestamp_granularities[]","segment");
    let response:Response;
    try{
      response=await fetch(API,{method:"POST",redirect:"manual",
        headers:{"authorization":"Bearer "+groqKey},
        body:form,signal:AbortSignal.timeout(45_000)});
    }catch{
      await info.db.prepare("UPDATE campaign_recap_v2_pilots SET "+
        "status='uncertain',error_code='provider_response_unknown',updated_at=? "+
        "WHERE id=? AND status='submitting'")
        .bind(new Date().toISOString(),id).run();
      return fail("Groq submission outcome is uncertain. No automatic retry will occur.",503);
    }
    if(!response.ok||response.redirected){
      const code=response.status===429?"rate_limited":
        [401,403].includes(response.status)?"groq_authorization":
          response.status===413?"audio_too_large":"provider_rejected";
      await info.db.prepare("UPDATE campaign_recap_v2_pilots SET "+
        "status='provider_error',error_code=?,updated_at=? "+
        "WHERE id=? AND status='submitting'")
        .bind(code,new Date().toISOString(),id).run();
      return fail("Groq could not transcribe the pilot excerpt ("+code+"). No retry was made.",502);
    }
    let cues:{startMs:number;endMs:number;text:string}[];
    try{
      if(Number(response.headers.get("content-length")??0)>MAX_PROVIDER_JSON)
        throw Error("Response too large.");
      const raw=await response.text();
      if(raw.length>MAX_PROVIDER_JSON)throw Error("Response too large.");
      const parsed=JSON.parse(raw) as {segments?:unknown};
      cues=normalizeGroqAudioSegments(parsed.segments,0,clip.endMs)
        .map(({startMs,endMs,text})=>({startMs,endMs,text}));
    }catch{
      await info.db.prepare("UPDATE campaign_recap_v2_pilots SET "+
        "status='invalid_output',error_code='timestamps_invalid',updated_at=? "+
        "WHERE id=? AND status='submitting'")
        .bind(new Date().toISOString(),id).run();
      return fail("Groq returned output without valid segment timestamps.",502);
    }
    const key=transcriptKey(info.access.campaign.id,info.recap.id,info.source.id);
    const transcript={version:1,model:MODEL,excerptEndMs:clip.endMs,cues,
      source:"gm_drive_m4a_excerpt",createdAt:new Date().toISOString()};
    // Idempotent R2 save retries do not repeat the chargeable provider POST.
    let saved=false;
    for(let attempt=0;attempt<3&&!saved;attempt++){
      try{await config().BUCKET.put(key,JSON.stringify(transcript));saved=true;}catch{/* try R2 only */}
    }
    if(!saved)return fail("Groq succeeded but saving the pilot transcript was interrupted. No repeat transcription was submitted.",503);
    for(let attempt=0;attempt<3;attempt++){
      try{
        const savedRow=await info.db.prepare("UPDATE campaign_recap_v2_pilots "+
          "SET status='complete',transcript_key=?,error_code=NULL,updated_at=? "+
          "WHERE id=? AND status='submitting'").bind(key,new Date().toISOString(),id).run();
        if(savedRow.meta.changes===1)break;
      }catch{/* DB-only retry */}
    }
    return Response.json({success:true,status:"complete",model:MODEL,
      excerptEndMs:clip.endMs,segmentCount:cues.length,
      notice:"Private timestamped pilot transcript saved. Existing recaps were not changed."},
      {headers:noStore});
  }catch(e){
    if(e instanceof RequestBodyError)return fail(e.message,e.status);
    return campaignErrorResponse(e,"Could not run private Groq transcription pilot.");
  }
}
