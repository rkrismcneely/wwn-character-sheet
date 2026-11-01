import type {RecapAIEncryptionSettings} from "../account/recap-gemini-key.ts";
import {decryptGeminiUserKey} from "../account/recap-gemini-key.ts";
import {CampaignServiceError} from "./service.ts";

type Env=RecapAIEncryptionSettings&{DB:D1Database};
type Input={jobId:string;campaignId:string;recapId:string;userId:string};
type Job={id:string;audioAssetId:string;status:string;errorCode:string|null;processingMode:string};
type Section={id:string;status:string;interactionId:string|null;fileUri:string|null;
  fileName:string|null;errorCode:string|null};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const PROVIDER_ID=/^[A-Za-z0-9_-]{6,240}$/u;
const FILE_ID=/^files\/[A-Za-z0-9_-]{2,240}$/u;
const API="https://generativelanguage.googleapis.com/v1beta/";

async function safeRead(response:Response,max:number):Promise<Record<string,unknown>>{
  if(!response.ok||response.redirected||Number(response.headers.get("content-length")||0)>max)
    throw new CampaignServiceError("Could not verify the saved Gemini interaction. No repeat request was made.",503);
  const raw=await response.text();
  if(raw.length>max)throw new CampaignServiceError("Gemini verification response exceeded the safe size limit.",503);
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{
    throw new CampaignServiceError("Gemini returned invalid verification details.",503);
  }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
    throw new CampaignServiceError("Gemini verification could not be completed.",503);
  return parsed as Record<string,unknown>;
}

/** Explicit, GM-confirmed, AT MOST ONCE retry of a terminal failed section.
 * Read-only Google GETs verify the terminal state and temporary file first.
 * The only new Gemini model POST happens in a later cron tick after this CAS.
 * The other sections, their notes, original Drive recording, and published
 * recap are immutable.
 */
export async function retryFailedRecapSection(
  env:Env,input:Input,
):Promise<{resumed:true;status:"uploaded"|"pending_upload"}>{
  if(!UUID.test(input.jobId))
    throw new CampaignServiceError("Choose a valid AI recap job.",422);
  const db=env.DB;
  const job=await db.prepare("SELECT id,audio_asset_id AS audioAssetId,status,"+
    "error_code AS errorCode,processing_mode AS processingMode "+
    "FROM campaign_recap_audio_summary_jobs "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? AND confirmed_at IS NOT NULL")
    .bind(input.jobId,input.campaignId,input.recapId,input.userId).first<Job>();
  if(!job||job.status!=="needs_attention"||
    job.errorCode!=="segment_interaction_failed"||job.processingMode!=="segmented")
    throw new CampaignServiceError("This recap has no confirmed failed section eligible for retry.",409);
  const source=await db.prepare("SELECT 1 AS ok FROM campaign_recap_audio_assets "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND storage_owner_user_id=? "+
    "AND processing_job_id IS NULL AND status='ready' AND remote_file_id IS NOT NULL")
    .bind(job.audioAssetId,input.campaignId,input.recapId,input.userId).first();
  if(!source)throw new CampaignServiceError("The original Drive recording is unavailable.",409);
  const parts=await db.prepare("SELECT id,status,interaction_id AS interactionId,"+
    "file_uri AS fileUri,file_name AS fileName,error_code AS errorCode "+
    "FROM campaign_recap_audio_summary_segments "+
    "WHERE job_id=? AND status='submitted' AND interaction_id IS NOT NULL "+
    "ORDER BY segment_index ASC LIMIT 2").bind(job.id).all<Section>();
  if(parts.results.length!==1)
    throw new CampaignServiceError("Could not identify a single failed audio section.",409);
  const part=parts.results[0];
  if(part.errorCode||!part.interactionId||!PROVIDER_ID.test(part.interactionId)||
    !part.fileUri||!part.fileName||!FILE_ID.test(part.fileName))
    throw new CampaignServiceError("This audio section is not safely retryable.",409);
  const connection=await db.prepare(
    "SELECT id,key_ciphertext AS ciphertext,key_nonce AS nonce,key_version AS version "+
    "FROM user_recap_ai_connections WHERE user_id=? AND provider='gemini' "+
    "AND status='connected' AND key_ciphertext IS NOT NULL")
    .bind(input.userId).first<{id:string;ciphertext:string;nonce:string;version:number}>();
  if(!connection||connection.version!==1)
    throw new CampaignServiceError("Reconnect your Gemini API key before retrying.",409);
  const secret=await decryptGeminiUserKey(env,input.userId,connection.id,{
    ciphertext:connection.ciphertext,nonce:connection.nonce,version:1,
  });
  let old:Response;
  try{
    old=await fetch(API+"interactions/"+encodeURIComponent(part.interactionId),{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
      headers:{"x-goog-api-key":secret,"Api-Revision":"2026-05-20"},
    });
  }catch{
    throw new CampaignServiceError("Gemini could not verify the failed section. No retry was started.",503);
  }
  if(old.status===404||old.status===410)
    throw new CampaignServiceError(
      "Gemini no longer retains the failed interaction, so a safe targeted retry cannot be verified. No AI request was made.",410);
  const original=await safeRead(old,350_000);
  if(original.status!=="failed")
    throw new CampaignServiceError(
      "Gemini no longer reports a terminal failed interaction. No duplicate AI request was made.",409);
  // Verify whether the uploaded audio section is still present. If not,
  // TWE re-stages only that portion of the GM's original Drive asset.
  let file:Response;
  try{
    file=await fetch(API+part.fileName,{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
      headers:{"x-goog-api-key":secret},
    });
  }catch{
    throw new CampaignServiceError("Gemini temporary audio could not be checked. No retry was started.",503);
  }
  let needsUpload=false;
  if(file.status===404||file.status===410)needsUpload=true;
  else {
    const result=await safeRead(file,100_000);
    if(result.state==="FAILED")needsUpload=true;
    else if(result.state!=="ACTIVE"&&result.state!=="PROCESSING")
      throw new CampaignServiceError("Gemini could not verify this section's temporary audio file.",409);
  }
  const target=needsUpload?"pending_upload":"uploaded";
  const at=new Date().toISOString();
  const results=await db.batch([
    db.prepare("UPDATE campaign_recap_audio_summary_segments "+
      "SET status=?,interaction_id=NULL,error_code='manual_retry_after_confirmed_failure',"+
      "file_uri=CASE WHEN ? THEN NULL ELSE file_uri END,"+
      "file_name=CASE WHEN ? THEN NULL ELSE file_name END,"+
      "stage_url_ciphertext=CASE WHEN ? THEN NULL ELSE stage_url_ciphertext END,"+
      "stage_url_nonce=CASE WHEN ? THEN NULL ELSE stage_url_nonce END,"+
      "stage_url_version=CASE WHEN ? THEN NULL ELSE stage_url_version END,"+
      "stage_offset=CASE WHEN ? THEN 0 ELSE stage_offset END,"+
      "updated_at=? WHERE id=? AND job_id=? AND status='submitted' "+
      "AND interaction_id=? AND error_code IS NULL")
      .bind(target,needsUpload?1:0,needsUpload?1:0,needsUpload?1:0,
        needsUpload?1:0,needsUpload?1:0,needsUpload?1:0,
        at,part.id,job.id,part.interactionId),
    db.prepare("UPDATE campaign_recap_audio_summary_jobs "+
      "SET status='transferring',error_code=NULL,claimed_at=NULL,updated_at=? "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
      "AND status='needs_attention' AND error_code='segment_interaction_failed' "+
      "AND interaction_id IS NULL AND confirmed_at IS NOT NULL")
      .bind(at,job.id,input.campaignId,input.recapId,input.userId),
  ]);
  if(results.length!==2||results[0].meta.changes!==1||results[1].meta.changes!==1)
    throw new CampaignServiceError("The recap changed while verifying it. Refresh before retrying.",409);
  return {resumed:true,status:target};
}
