import { RECAP_ONLY_MAX_AUDIO_BYTES,RECAP_ONLY_MODEL } from "./recap-only-runner.ts";
type Eligible={
  enabled:number;approved:number;consentAt:string|null;detail:"brief"|"standard"|"detailed";
};
/** Auto-create at most one provider job for a verified GM-owned recording.
 * Only account-level explicit opt-in + connected Gemini may enqueue inference.
 */
export async function enqueueConsentedRecapAudio(
  db:D1Database,input:{
    campaignId:string;recapId:string;audioAssetId:string;userId:string;byteSize:number;
  },
):Promise<boolean>{
  const [preferences,provider,recap]=await Promise.all([
    db.prepare("SELECT auto_enabled AS enabled,billing_approved AS approved,"+
      "consent_at AS consentAt,detail FROM user_recap_auto_preferences WHERE user_id=?")
      .bind(input.userId).first<Eligible>(),
    db.prepare("SELECT 1 AS ok FROM user_recap_ai_connections WHERE user_id=? "+
      "AND provider='gemini' AND status='connected' AND key_ciphertext IS NOT NULL")
      .bind(input.userId).first(),
    db.prepare("SELECT is_published AS published FROM campaign_session_recaps "+
      "WHERE id=? AND campaign_id=?")
      .bind(input.recapId,input.campaignId).first<{published:number}>(),
  ]);
  if(preferences?.enabled!==1||preferences.approved!==1||!preferences.consentAt||
    !provider||recap?.published!==0)return false;
  const oversize=input.byteSize>RECAP_ONLY_MAX_AUDIO_BYTES;
  const now=new Date().toISOString();
  const result=await db.prepare("INSERT OR IGNORE INTO campaign_recap_audio_summary_jobs "+
    "(id,campaign_id,recap_id,audio_asset_id,requested_by,status,detail,model,error_code,created_at,updated_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),input.campaignId,input.recapId,input.audioAssetId,input.userId,
      oversize?"needs_attention":"pending_upload",preferences.detail,RECAP_ONLY_MODEL,
      oversize?"audio_exceeds_2gb":null,now,now).run();
  return result.meta.changes===1;
}
