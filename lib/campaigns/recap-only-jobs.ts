import { RECAP_ONLY_MAX_AUDIO_BYTES, RECAP_ONLY_MODEL } from "./recap-only-runner.ts";
import { CampaignServiceError } from "./service.ts";

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
