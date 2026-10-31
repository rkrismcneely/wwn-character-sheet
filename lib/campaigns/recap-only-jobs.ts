import { RECAP_ONLY_MAX_AUDIO_BYTES, RECAP_ONLY_MODEL } from "./recap-only-runner.ts";
import { CampaignServiceError } from "./service.ts";
import {safeRecapRetryTarget,type RecapRetryRecord} from "./recap-only-recovery.ts";

type Preferences={detail:"brief"|"standard"|"detailed"};
/**
 * Only an explicit, individually confirmed GM action may create a provider job.
 * Recording uploads, verification retries, and account setup never enqueue work.
 * Unique audio_asset_id ensures a second POST cannot create a second billable job.
 */
export async function enqueueConfirmedRecapAudio(
  db:D1Database,input:{
    campaignId:string;recapId:string;audioAssetId:string;userId:string;byteSize:number;
    confirmed:boolean;privacyApproved:boolean;billingApproved:boolean;
  },
):Promise<{created:boolean;alreadyQueued:boolean}>{
  if(input.confirmed!==true||input.privacyApproved!==true||input.billingApproved!==true)
    throw new CampaignServiceError(
      "Confirm that Gemini may receive your recording and campaign context and that your Gemini project may incur charges.",422);
  const [preferences,provider,recap]=await Promise.all([
    db.prepare("SELECT detail FROM user_recap_auto_preferences WHERE user_id=?")
      .bind(input.userId).first<Preferences>(),
    db.prepare("SELECT 1 AS ok FROM user_recap_ai_connections WHERE user_id=? "+
      "AND provider='gemini' AND status='connected' AND key_ciphertext IS NOT NULL")
      .bind(input.userId).first(),
    db.prepare("SELECT is_published AS published FROM campaign_session_recaps "+
      "WHERE id=? AND campaign_id=?")
      .bind(input.recapId,input.campaignId).first<{published:number}>(),
  ]);
  if(!provider)throw new CampaignServiceError("Connect your own Gemini API key in Account first.",409);
  if(recap?.published!==0)
    throw new CampaignServiceError("Auto Summarize requires a private session recap draft.",409);
  if(!Number.isSafeInteger(input.byteSize)||input.byteSize<=0||input.byteSize>RECAP_ONLY_MAX_AUDIO_BYTES)
    throw new CampaignServiceError("This recording exceeds Gemini's 2 GB per-file limit. The original remains in Drive.",422);
  const detail=preferences?.detail??"detailed";
  const now=new Date().toISOString();
  const result=await db.prepare("INSERT OR IGNORE INTO campaign_recap_audio_summary_jobs "+
    "(id,campaign_id,recap_id,audio_asset_id,requested_by,status,detail,model,error_code,confirmed_at,created_at,updated_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),input.campaignId,input.recapId,input.audioAssetId,input.userId,
      "pending_upload",detail,RECAP_ONLY_MODEL,null,now,now,now).run();
  if(result.meta.changes!==1){
    const old=await db.prepare("SELECT confirmed_at AS confirmedAt FROM campaign_recap_audio_summary_jobs "+
      "WHERE audio_asset_id=? AND recap_id=? AND requested_by=?")
      .bind(input.audioAssetId,input.recapId,input.userId).first<{confirmedAt:string|null}>();
    if(!old?.confirmedAt)throw new CampaignServiceError(
      "A previous automatic job exists for this recording. It was not approved under the new confirmation process; no new AI request was made.",409);
  }
  return {created:result.meta.changes===1,alreadyQueued:result.meta.changes!==1};
}

/** Explicit GM retry of a safely pre-submission failed step. Never creates a
 * second job, never resumes an uncertain/possibly billable submission, and
 * requires the same original GM, recap, saved recording, and connected key.
 */
export async function retrySafeRecapPreparation(
  db:D1Database,input:{jobId:string;campaignId:string;recapId:string;userId:string},
):Promise<{resumed:true;status:"pending_upload"|"uploaded"}>{
  if(!/^[0-9a-f-]{36}$/iu.test(input.jobId))
    throw new CampaignServiceError("Choose a valid AI recap job.",422);
  const job=await db.prepare("SELECT id,status,error_code AS errorCode,"+
    "file_uri AS fileUri,file_name AS fileName,interaction_id AS interactionId,"+
    "stage_error_code AS stageErrorCode "+
    "FROM campaign_recap_audio_summary_jobs WHERE id=? AND campaign_id=? "+
    "AND recap_id=? AND requested_by=? AND confirmed_at IS NOT NULL")
    .bind(input.jobId,input.campaignId,input.recapId,input.userId)
    .first<RecapRetryRecord&{id:string;stageErrorCode:string|null}>();
  if(!job)throw new CampaignServiceError("AI recap job not found.",404);
  const target=safeRecapRetryTarget(job);
  if(!target)throw new CampaignServiceError(
    "This AI job cannot safely be resubmitted. Gemini may already have received it. Check your provider usage.",409);
  const [source,account,recap]=await Promise.all([
    db.prepare("SELECT 1 AS ok FROM campaign_recap_audio_assets a "+
      "JOIN campaign_recap_audio_summary_jobs j ON j.audio_asset_id=a.id "+
      "WHERE j.id=? AND a.campaign_id=? AND a.recap_id=? "+
      "AND a.storage_owner_user_id=? AND a.status='ready' AND a.remote_file_id IS NOT NULL")
      .bind(input.jobId,input.campaignId,input.recapId,input.userId).first(),
    db.prepare("SELECT 1 AS ok FROM user_recap_ai_connections WHERE user_id=? "+
      "AND provider='gemini' AND status='connected' AND key_ciphertext IS NOT NULL")
      .bind(input.userId).first(),
    db.prepare("SELECT is_published AS published FROM campaign_session_recaps "+
      "WHERE id=? AND campaign_id=?").bind(input.recapId,input.campaignId)
      .first<{published:number}>(),
  ]);
  if(!source)throw new CampaignServiceError("The original Drive audio must be available before retrying.",409);
  if(!account)throw new CampaignServiceError("Test or reconnect your Gemini API key in Account before retrying.",409);
  if(recap?.published!==0)throw new CampaignServiceError("Only private recap drafts can be resumed.",409);
  // An expired Gemini staging session must be replaced on retry. Other
  // errors preserve the encrypted resumable session and accepted byte offset.
  const reset=job.stageErrorCode==="gemini_upload_session_expired";
  const updated=await db.prepare("UPDATE campaign_recap_audio_summary_jobs "+
    "SET status=?,error_code=NULL,stage_error_code=NULL,claimed_at=NULL,updated_at=?,"+
    "stage_url_ciphertext=CASE WHEN ? THEN NULL ELSE stage_url_ciphertext END,"+
    "stage_url_nonce=CASE WHEN ? THEN NULL ELSE stage_url_nonce END,"+
    "stage_url_version=CASE WHEN ? THEN NULL ELSE stage_url_version END,"+
    "stage_offset=CASE WHEN ? THEN 0 ELSE stage_offset END "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
    "AND status='needs_attention' AND error_code=? AND interaction_id IS NULL "+
    "AND confirmed_at IS NOT NULL")
    .bind(target,new Date().toISOString(),reset?1:0,reset?1:0,reset?1:0,reset?1:0,
      input.jobId,input.campaignId,input.recapId,input.userId,job.errorCode).run();
  if(updated.meta.changes!==1)throw new CampaignServiceError(
    "This AI job changed while you were reviewing it. Refresh the status before retrying.",409);
  return {resumed:true,status:target};
}
