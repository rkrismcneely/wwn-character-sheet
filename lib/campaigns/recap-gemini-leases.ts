/**
 * Atomic D1 leasing for staged, consented Gemini recap chunks.
 * Caller MUST verify quota, GM account, source integrity and site-owner limits
 * before entering this file; functions here never contact external providers.
 */
import { canDispatchGeminiJob,type GeminiJobState,type GeminiQuotaMode,
  GEMINI_BACKGROUND_MAX_CLIP_BYTES,GEMINI_BACKGROUND_MAX_CLIP_MS,
} from "./recap-gemini-background.ts";
type Candidate={
  jobId:string;recapId:string;requestedBy:string;campaignId:string;
  status:GeminiJobState;quotaMode:GeminiQuotaMode;maxCostMicrousd:number;
  pausedAt:string|null;nextEligibleAt:string|null;
  connectionStatus:string|null;audioKey:string;audioBytes:number;
  sourceDigest:string;mimeType:string;trackIndex:number;chunkIndex:number;
  startMs:number;endMs:number;
};
export type GeminiLeasedClip=Pick<Candidate,"jobId"|"recapId"|"requestedBy"|"campaignId"|
  "audioKey"|"audioBytes"|"sourceDigest"|"mimeType"|"trackIndex"|"chunkIndex"|"startMs"|"endMs"> & {
  leaseToken:string;
};
export const GEMINI_CHUNK_LEASE_MS=5*60*1000;
export const GEMINI_LIMIT_RETRY_MS=24*60*60*1000;
const query="SELECT j.id AS jobId,j.recap_id AS recapId,j.requested_by AS requestedBy,"+
  "j.campaign_id AS campaignId,j.status,j.quota_mode AS quotaMode,"+
  "j.max_cost_microusd AS maxCostMicrousd,j.paused_at AS pausedAt,"+
  "j.next_eligible_at AS nextEligibleAt,a.status AS connectionStatus,"+
  "c.audio_key AS audioKey,c.audio_bytes AS audioBytes,c.source_digest AS sourceDigest,"+
  "c.audio_mime_type AS mimeType,c.track_index AS trackIndex,c.chunk_index AS chunkIndex,"+
  "c.start_ms AS startMs,c.end_ms AS endMs "+
  "FROM campaign_recap_processing_chunks c "+
  "JOIN campaign_recap_processing_jobs j ON j.id=c.job_id "+
  "LEFT JOIN user_recap_ai_connections a ON a.id=j.provider_connection_id "+
  "AND a.user_id=j.requested_by AND a.provider='gemini' "+
  "WHERE j.provider='gemini' AND j.status='queued' AND j.paused_at IS NULL "+
  "AND (j.next_eligible_at IS NULL OR j.next_eligible_at<=?) "+
  "AND c.status='pending' AND (c.next_eligible_at IS NULL OR c.next_eligible_at<=?) "+
  "AND c.audio_key IS NOT NULL AND c.audio_bytes BETWEEN 128 AND ? "+
  "AND c.source_digest IS NOT NULL AND c.audio_mime_type IS NOT NULL "+
  "ORDER BY j.created_at,c.track_index,c.chunk_index LIMIT 4";
export async function leaseOnePreparedGeminiChunk(db:D1Database,config:{
  enabled:boolean;freeQuotaVerified:boolean;now:string;verifySource:(key:string,size:number)=>Promise<boolean>;
}):Promise<GeminiLeasedClip|null>{
  if(!config.enabled)return null;
  const eligible=await db.prepare(query)
    .bind(config.now,config.now,GEMINI_BACKGROUND_MAX_CLIP_BYTES).all<Candidate>();
  for(const item of eligible.results){
    if(!item.recapId||!item.requestedBy||!item.audioKey||!item.sourceDigest||
      !/^[0-9a-f]{64}$/u.test(item.sourceDigest)||!item.mimeType||
      item.endMs-item.startMs>GEMINI_BACKGROUND_MAX_CLIP_MS||
      !canDispatchGeminiJob({
        enabled:config.enabled,accountConnected:item.connectionStatus==="connected",
        audioReady:true,humanApproved:true,userNotPaused:item.pausedAt===null,
        status:item.status,nextEligibleAt:item.nextEligibleAt,now:config.now,
        freeQuotaVerified:config.freeQuotaVerified,quotaMode:item.quotaMode,
        maxCostMicrousd:item.maxCostMicrousd,
      }))continue;
    if(!await config.verifySource(item.audioKey,item.audioBytes))continue;
    const leaseToken=crypto.randomUUID();
    const expires=new Date(Date.parse(config.now)+GEMINI_CHUNK_LEASE_MS).toISOString();
    const applied=await db.prepare(
      "UPDATE campaign_recap_processing_chunks SET status='leased',lease_token=?,"+
      "lease_expires_at=?,attempts=attempts+1,updated_at=? "+
      "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='pending' "+
      "AND attempts<25 AND audio_key=? "+
      "AND EXISTS(SELECT 1 FROM campaign_recap_processing_jobs j "+
      "WHERE j.id=? AND j.status='queued' AND j.paused_at IS NULL "+
      "AND EXISTS(SELECT 1 FROM user_recap_ai_connections a "+
      "WHERE a.id=j.provider_connection_id AND a.user_id=j.requested_by "+
      "AND a.provider='gemini' AND a.status='connected' AND a.key_ciphertext IS NOT NULL))")
      .bind(leaseToken,expires,config.now,item.jobId,item.trackIndex,
        item.chunkIndex,item.audioKey,item.jobId).run();
    if(applied.meta.changes!==1)continue;
    return {...item,leaseToken};
  }
  return null;
}
export async function finishGeminiChunk(db:D1Database,clip:GeminiLeasedClip,
  transcriptKey:string,now:string):Promise<boolean>{
  if(!/^recap-transcript-chunks\//u.test(transcriptKey))throw new Error("Invalid transcript fragment key.");
  const result=await db.prepare("UPDATE campaign_recap_processing_chunks SET "+
    "status='completed',transcript_key=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? "+
    "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='leased' AND lease_token=? "+
    "AND EXISTS(SELECT 1 FROM campaign_recap_processing_jobs j "+
    "WHERE j.id=? AND j.status NOT IN ('cancelled','completed') AND j.paused_at IS NULL)")
    .bind(transcriptKey,now,clip.jobId,clip.trackIndex,clip.chunkIndex,
      clip.leaseToken,clip.jobId).run();
  if(result.meta.changes!==1)return false;
  await db.prepare("UPDATE campaign_recap_processing_jobs SET "+
    "completed_chunks=(SELECT COUNT(*) FROM campaign_recap_processing_chunks "+
    "WHERE job_id=? AND status='completed'),updated_at=? WHERE id=? AND status!='cancelled'")
    .bind(clip.jobId,now,clip.jobId).run();
  return true;
}
export async function holdGeminiChunk(db:D1Database,clip:GeminiLeasedClip,
  reason:"quota"|"provider_unavailable"|"needs_attention"|"uncertain_result",
  now:string):Promise<boolean>{
  const isAmbiguous=reason==="uncertain_result";
  const eligible=new Date(Date.parse(now)+GEMINI_LIMIT_RETRY_MS).toISOString();
  const result=await db.prepare("UPDATE campaign_recap_processing_chunks SET "+
    "status=?,error_code=?,next_eligible_at=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? "+
    "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='leased' AND lease_token=?")
    .bind(isAmbiguous?"failed":"pending",reason,isAmbiguous?null:eligible,now,
      clip.jobId,clip.trackIndex,clip.chunkIndex,clip.leaseToken).run();
  if(result.meta.changes!==1)return false;
  await db.prepare("UPDATE campaign_recap_processing_jobs SET "+
    "next_eligible_at=?,failure_code=?,updated_at=? WHERE id=? AND status!='cancelled'")
    .bind(isAmbiguous?null:eligible,reason,now,clip.jobId).run();
  return true;
}

/** On crashed/expired leases we do NOT automatically submit the clip twice.
 * A completed provider call with a lost response could incur a second charge.
 * Explicit GM review is required before requeue.
 */
export async function quarantineExpiredGeminiLeases(db:D1Database,now:string):Promise<number>{
  const pending=await db.prepare("SELECT job_id AS jobId,track_index AS trackIndex,"+
    "chunk_index AS chunkIndex FROM campaign_recap_processing_chunks "+
    "WHERE status='leased' AND lease_expires_at<=? LIMIT 4")
    .bind(now).all<{jobId:string;trackIndex:number;chunkIndex:number}>();
  let quarantined=0;
  for(const item of pending.results){
    const updated=await db.prepare("UPDATE campaign_recap_processing_chunks SET "+
      "status='failed',error_code='uncertain_result',lease_token=NULL,"+
      "lease_expires_at=NULL,updated_at=? WHERE job_id=? AND track_index=? "+
      "AND chunk_index=? AND status='leased' AND lease_expires_at<=?")
      .bind(now,item.jobId,item.trackIndex,item.chunkIndex,now).run();
    if(updated.meta.changes!==1)continue;
    quarantined++;
    await db.prepare("UPDATE campaign_recap_processing_jobs SET "+
      "failure_code='uncertain_result',paused_at=?,updated_at=? "+
      "WHERE id=? AND status NOT IN ('completed','cancelled')")
      .bind(now,now,item.jobId).run();
  }
  return quarantined;
}
