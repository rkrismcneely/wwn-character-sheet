import {decryptGeminiUserKey,type RecapAIEncryptionSettings} from "../account/recap-gemini-key.ts";
import {geminiAudioMime} from "./recap-gemini-audio-mime.ts";
import {confirmedTransientGeminiError,recoveryDueAt} from "./recap-gemini-auto-retry-policy.ts";

type Env=RecapAIEncryptionSettings&{DB:D1Database};
type FailedSingle={
  id:string;campaignId:string;recapId:string;userId:string;audioAssetId:string;
  interactionId:string;fileName:string|null;fileUri:string|null;
};
type AudioAsset={byteSize:number;mimeType:string};
type Credential={id:string;ciphertext:string;nonce:string;version:number};
const API="https://generativelanguage.googleapis.com/v1beta/";
const INTERACTION=/^[a-zA-Z0-9_-]{6,240}$/u;
const FILE=/^files\/[a-zA-Z0-9_-]{6,240}$/u;
const FALLBACK_MODEL="gemini-3.6-flash";
const MAX_JSON=350_000;

async function readJson(response:Response,limit=MAX_JSON):Promise<Record<string,unknown>|null>{
  if(!response.ok||response.redirected||
    Number(response.headers.get("content-length")??0)>limit)return null;
  try{
    const raw=await response.text();
    if(raw.length>limit)return null;
    const parsed:unknown=JSON.parse(raw);
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?
      parsed as Record<string,unknown>:null;
  }catch{return null;}
}

/** Recovery is deliberately GET-only until an atomic database checkpoint.
 * No provider POST here. A completed, terminal 5xx is NOT an uncertain request.
 * Each new GM-consented job may receive ONE delayed fallback audio interaction
 * using its existing Gemini upload and original Google Drive recording.
 * Older jobs without opt-in and exhausted retries never enter this path.
 */
export async function runVerifiedSingleAudioRecoveryTick(env:Env):Promise<void>{
  const db=env.DB;
  const schema=await db.prepare("PRAGMA table_info(campaign_recap_audio_summary_jobs)")
    .all<{name:string}>();
  if(!["auto_retry_opt_in","single_audio_retry_count","audio_analysis_model",
    "audio_retry_not_before"].every(key=>schema.results.some(c=>c.name===key)))return;

  const jobs=await db.prepare("SELECT id,campaign_id AS campaignId,recap_id AS recapId,"+
    "requested_by AS userId,audio_asset_id AS audioAssetId,"+
    "interaction_id AS interactionId,file_name AS fileName,file_uri AS fileUri "+
    "FROM campaign_recap_audio_summary_jobs "+
    "WHERE status='needs_attention' AND error_code='interaction_failed' "+
    "AND processing_mode='single' AND auto_retry_opt_in=1 "+
    "AND single_audio_retry_count=0 AND confirmed_at IS NOT NULL "+
    "AND interaction_id IS NOT NULL AND audio_notes IS NULL "+
    "ORDER BY updated_at ASC LIMIT 4").all<FailedSingle>();
  for(const job of jobs.results){
    if(!INTERACTION.test(job.interactionId)||!job.fileName||
      !FILE.test(job.fileName)||
      job.fileUri!==API+job.fileName)continue;
    const asset=await db.prepare("SELECT byte_size AS byteSize,mime_type AS mimeType "+
      "FROM campaign_recap_audio_assets "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND storage_owner_user_id=? "+
      "AND processing_job_id IS NULL AND status='ready' AND remote_file_id IS NOT NULL")
      .bind(job.audioAssetId,job.campaignId,job.recapId,job.userId).first<AudioAsset>();
    if(!asset||asset.byteSize<=0)continue;
    const connection=await db.prepare("SELECT id,key_ciphertext AS ciphertext,"+
      "key_nonce AS nonce,key_version AS version FROM user_recap_ai_connections "+
      "WHERE user_id=? AND provider='gemini' AND status='connected' "+
      "AND key_ciphertext IS NOT NULL")
      .bind(job.userId).first<Credential>();
    if(!connection||connection.version!==1)continue;
    let key:string;
    try{key=await decryptGeminiUserKey(env,job.userId,connection.id,{
      ciphertext:connection.ciphertext,nonce:connection.nonce,version:1});
    }catch{continue;}

    let old:Record<string,unknown>|null=null;
    try{old=await readJson(await fetch(API+"interactions/"+
      encodeURIComponent(job.interactionId),{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
      headers:{"x-goog-api-key":key,"Api-Revision":"2026-05-20"},
    }));}catch{continue;}
    if(!confirmedTransientGeminiError(old))continue;

    // The already uploaded file must belong to this request and be ACTIVE.
    // If its temporary Gemini storage expired, restage the SAME original
    // Drive recording; never reupload from the GM's device.
    let restage=false;
    try{
      const response=await fetch(API+job.fileName,{
        method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
        headers:{"x-goog-api-key":key},
      });
      if(response.status===404||response.status===410)restage=true;
      else {
        const file=await readJson(response,100_000);
        if(!file)continue;
        if(file.state==="FAILED")restage=true;
        else if(file.state!=="ACTIVE"||file.name!==job.fileName||
          file.uri!==job.fileUri||String(file.sizeBytes)!==String(asset.byteSize)||
          file.mimeType!==geminiAudioMime(asset.mimeType))continue;
      }
    }catch{continue;}

    const stamp=new Date().toISOString(),wake=recoveryDueAt(stamp);
    const result=await db.prepare("UPDATE campaign_recap_audio_summary_jobs SET "+
      "status=?,error_code=NULL,interaction_id=NULL,claimed_at=NULL,"+
      "audio_analysis_model=?,single_audio_retry_count=1,audio_retry_not_before=?,"+
      "file_uri=CASE WHEN ? THEN NULL ELSE file_uri END,"+
      "file_name=CASE WHEN ? THEN NULL ELSE file_name END,"+
      "stage_url_ciphertext=CASE WHEN ? THEN NULL ELSE stage_url_ciphertext END,"+
      "stage_url_nonce=CASE WHEN ? THEN NULL ELSE stage_url_nonce END,"+
      "stage_url_version=CASE WHEN ? THEN NULL ELSE stage_url_version END,"+
      "stage_offset=CASE WHEN ? THEN 0 ELSE stage_offset END,updated_at=? "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
      "AND audio_asset_id=? AND status='needs_attention' "+
      "AND error_code='interaction_failed' AND interaction_id=? "+
      "AND processing_mode='single' AND auto_retry_opt_in=1 "+
      "AND single_audio_retry_count=0 AND confirmed_at IS NOT NULL "+
      "AND audio_notes IS NULL")
      .bind(restage?"pending_upload":"uploaded",FALLBACK_MODEL,wake,
        restage?1:0,restage?1:0,restage?1:0,restage?1:0,restage?1:0,
        restage?1:0,stamp,job.id,job.campaignId,job.recapId,job.userId,
        job.audioAssetId,job.interactionId).run();
    if(result.meta.changes===1)return;
  }
}
