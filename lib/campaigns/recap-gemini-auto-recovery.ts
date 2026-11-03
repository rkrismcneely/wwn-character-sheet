import {decryptGeminiUserKey,type RecapAIEncryptionSettings} from "../account/recap-gemini-key.ts";
import {AUTO_RETRY_MARKER,confirmedTransientGeminiError,recoveryDueAt}
  from "./recap-gemini-auto-retry-policy.ts";

type Env=RecapAIEncryptionSettings&{DB:D1Database};
type Candidate={
  jobId:string;partId:string;interactionId:string;userId:string;
  campaignId:string;recapId:string;audioAssetId:string;errorCode:string|null;
  fileName:string|null;fileUri:string|null;
};
type Secret={id:string;ciphertext:string;nonce:string;version:number};
const API="https://generativelanguage.googleapis.com/v1beta/";
const ID=/^[a-zA-Z0-9_-]{6,240}$/u;
const FILE=/^files\/[a-zA-Z0-9_-]{2,240}$/u;

async function readObject(response:Response,limit:number):Promise<Record<string,unknown>|null>{
  if(!response.ok||response.redirected||
    Number(response.headers.get("content-length")??0)>limit)return null;
  try{
    const value=await response.text();
    if(value.length>limit)return null;
    const json:unknown=JSON.parse(value);
    return json&&typeof json==="object"&&!Array.isArray(json)?
      json as Record<string,unknown>:null;
  }catch{return null;}
}

/** Best-effort single recovery per scheduled tick. No Gemini POST occurs here.
 * We verify the old interaction with a read-only GET and only then queue ONE
 * delayed, bounded resubmission. Uncertain or running interactions are never
 * changed. Existing ready audio sections remain immutable.
 */
export async function runVerifiedGeminiRecapRecoveryTick(env:Env):Promise<void>{
  const db=env.DB;
  const matches=await db.prepare("SELECT j.id AS jobId,j.requested_by AS userId,"+
    "j.campaign_id AS campaignId,j.recap_id AS recapId,j.audio_asset_id AS audioAssetId,"+
    "s.id AS partId,s.interaction_id AS interactionId,s.error_code AS errorCode,"+
    "s.file_name AS fileName,s.file_uri AS fileUri "+
    "FROM campaign_recap_audio_summary_jobs j "+
    "JOIN campaign_recap_audio_summary_segments s ON s.job_id=j.id "+
    "WHERE j.status='needs_attention' AND j.error_code='segment_interaction_failed' "+
    "AND j.processing_mode='segmented' AND j.confirmed_at IS NOT NULL "+
    "AND s.status='submitted' AND s.interaction_id IS NOT NULL "+
    "AND (s.error_code IS NULL OR s.error_code=?) "+
    "ORDER BY j.updated_at DESC LIMIT 6").bind(AUTO_RETRY_MARKER).all<Candidate>();
  for(const part of matches.results){
    if(!ID.test(part.interactionId))continue;
    if(part.errorCode===AUTO_RETRY_MARKER){
      // The only automatic attempt also failed. Keep the job stopped and
      // allow the existing explicit M4A rebuild path, not another replay.
      await db.prepare("UPDATE campaign_recap_audio_summary_segments "+
        "SET error_code='manual_retry_after_confirmed_failure' "+
        "WHERE id=? AND job_id=? AND status='submitted' AND interaction_id=? "+
        "AND error_code=? AND EXISTS(SELECT 1 FROM campaign_recap_audio_summary_jobs j "+
        "WHERE j.id=? AND j.status='needs_attention' "+
        "AND j.error_code='segment_interaction_failed')")
        .bind(part.partId,part.jobId,part.interactionId,AUTO_RETRY_MARKER,part.jobId).run();
      continue;
    }
    if(!part.fileName||!FILE.test(part.fileName)||!part.fileUri)continue;
    const asset=await db.prepare("SELECT 1 AS ok FROM campaign_recap_audio_assets "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND storage_owner_user_id=? "+
      "AND status='ready' AND remote_file_id IS NOT NULL")
      .bind(part.audioAssetId,part.campaignId,part.recapId,part.userId).first();
    if(!asset)continue;
    const connection=await db.prepare("SELECT id,key_ciphertext AS ciphertext,"+
      "key_nonce AS nonce,key_version AS version FROM user_recap_ai_connections "+
      "WHERE user_id=? AND provider='gemini' AND status='connected' "+
      "AND key_ciphertext IS NOT NULL").bind(part.userId).first<Secret>();
    if(!connection||connection.version!==1)continue;
    let key:string;
    try{
      key=await decryptGeminiUserKey(env,part.userId,connection.id,{
        ciphertext:connection.ciphertext,nonce:connection.nonce,version:1});
    }catch{continue;}
    let confirmed:Record<string,unknown>|null;
    try{
      confirmed=await readObject(await fetch(API+"interactions/"+
        encodeURIComponent(part.interactionId),{
        method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
        headers:{"x-goog-api-key":key,"Api-Revision":"2026-05-20"},
      }),350_000);
    }catch{continue;}
    if(!confirmedTransientGeminiError(confirmed))continue;

    // A temporary Files upload may have expired. We must determine whether
    // just this one section should be re-staged from the GM's original Drive.
    let restage=false;
    try{
      const result=await fetch(API+part.fileName,{
        method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
        headers:{"x-goog-api-key":key},
      });
      if(result.status===404||result.status===410)restage=true;
      else {
        const metadata=await readObject(result,100_000);
        if(!metadata)continue;
        if(metadata.state==="FAILED")restage=true;
        else if(metadata.state!=="ACTIVE"&&metadata.state!=="PROCESSING")continue;
      }
    }catch{continue;}
    const stamp=new Date().toISOString();
    const wake=recoveryDueAt(stamp);
    const updated=await db.batch([
      db.prepare("UPDATE campaign_recap_audio_summary_segments SET "+
        "status=?,interaction_id=NULL,error_code=?,"+
        "file_uri=CASE WHEN ? THEN NULL ELSE file_uri END,"+
        "file_name=CASE WHEN ? THEN NULL ELSE file_name END,"+
        "stage_url_ciphertext=CASE WHEN ? THEN NULL ELSE stage_url_ciphertext END,"+
        "stage_url_nonce=CASE WHEN ? THEN NULL ELSE stage_url_nonce END,"+
        "stage_url_version=CASE WHEN ? THEN NULL ELSE stage_url_version END,"+
        "stage_offset=CASE WHEN ? THEN 0 ELSE stage_offset END,updated_at=? "+
        "WHERE id=? AND job_id=? AND status='submitted' AND interaction_id=? "+
        "AND error_code IS NULL")
        .bind(restage?"pending_upload":"uploaded",AUTO_RETRY_MARKER,
          restage?1:0,restage?1:0,restage?1:0,restage?1:0,restage?1:0,
          restage?1:0,stamp,part.partId,part.jobId,part.interactionId),
      // A future lease is intentional: the existing scheduler already skips
      // transferring jobs until 90 seconds AFTER claimed_at. This supplies
      // backoff without adding a schema migration or polling the client.
      db.prepare("UPDATE campaign_recap_audio_summary_jobs SET "+
        "status='transferring',error_code=NULL,claimed_at=?,updated_at=? "+
        "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
        "AND status='needs_attention' AND error_code='segment_interaction_failed' "+
        "AND processing_mode='segmented'")
        .bind(wake,stamp,part.jobId,part.campaignId,part.recapId,part.userId),
    ]);
    if(updated.length===2&&updated[0].meta.changes===1&&updated[1].meta.changes===1)
      return;
  }
}
