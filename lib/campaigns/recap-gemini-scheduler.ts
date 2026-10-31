import { decryptGeminiUserKey,type RecapAIEncryptionSettings } from "../account/recap-gemini-key.ts";
import type { DriveSettings } from "../account/recap-google-drive-oauth.ts";
import { readVerifiedGmGeminiClip } from "./recap-gemini-drive-source.ts";
import { leaseOnePreparedGeminiChunk,finishGeminiChunk,holdGeminiChunk,
  quarantineExpiredGeminiLeases,type GeminiLeasedClip } from "./recap-gemini-leases.ts";
import { GEMINI_BACKGROUND_MAX_CLIP_BYTES } from "./recap-gemini-background.ts";
import { submitVerifiedGeminiAudio,pollGeminiInteraction,GeminiAmbiguousResult,
  type GeminiProviderOutcome } from "./recap-gemini-provider-runner.ts";
import type { CaptionCue } from "./recap-full-transcript.ts";

export type GeminiCronEnvironment=DriveSettings&RecapAIEncryptionSettings&{
  DB:D1Database;BUCKET:R2Bucket;RECAP_GEMINI_BACKGROUND_ENABLED?:string;

};
const FRAGMENT="recap-transcript-chunks/";
const POLL_MS=15*60*1000;
const VALID_ID=/^[A-Za-z0-9_-]{6,240}$/u;
type Pending={
  jobId:string;recapId:string;campaignId:string;requestedBy:string;
  trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
  interactionId:string;nextPoll:string|null;
};
type Secret={id:string;ciphertext:string;nonce:string;version:number};
type Speaker={index:number;discordName:string;displayName:string};
const time=(ms:number)=>new Date(ms).toISOString();
function fragmentKey(clip:Pick<GeminiLeasedClip,"campaignId"|"jobId"|"trackIndex"|"chunkIndex">){
  return FRAGMENT+clip.campaignId+"/"+clip.jobId+"/"+clip.trackIndex+"-"+clip.chunkIndex+".json";
}
async function ownKey(env:GeminiCronEnvironment,userId:string,jobId:string):Promise<string>{
  const result=await env.DB.prepare("SELECT a.id,a.key_ciphertext AS ciphertext,"+
    "a.key_nonce AS nonce,a.key_version AS version FROM user_recap_ai_connections a "+
    "JOIN campaign_recap_processing_jobs j ON j.provider_connection_id=a.id "+
    "WHERE j.id=? AND j.requested_by=? AND a.user_id=? AND a.provider='gemini' "+
    "AND a.status='connected' AND a.key_ciphertext IS NOT NULL")
    .bind(jobId,userId,userId).first<Secret>();
  if(!result||result.version!==1)throw new Error("GM Gemini account is disconnected.");
  return decryptGeminiUserKey(env,userId,result.id,
    {ciphertext:result.ciphertext,nonce:result.nonce,version:1});
}
async function speakerFor(env:GeminiCronEnvironment,clip:{
  campaignId:string;jobId:string;trackIndex:number;
}):Promise<Speaker>{
  const row=await env.DB.prepare("SELECT import_id AS importId "+
    "FROM campaign_recap_processing_jobs WHERE id=? AND campaign_id=?")
    .bind(clip.jobId,clip.campaignId).first<{importId:string}>();
  if(!row)throw new Error("The scheduled job no longer exists.");
  const obj=await env.BUCKET.get("recap-track-speakers/"+clip.campaignId+"/"+row.importId);
  if(!obj)throw new Error("Craig speaker confirmation was lost.");
  const data=await obj.json<{version?:number;assignments?:Speaker[]}>();
  const speaker=data.version===1?data.assignments?.find(x=>x.index===clip.trackIndex):null;
  if(!speaker||!speaker.displayName||!speaker.discordName)
    throw new Error("The recording track is not associated with a confirmed GM speaker.");
  return speaker;
}
async function saveFragment(env:GeminiCronEnvironment,
  clip:Pick<GeminiLeasedClip,"campaignId"|"jobId"|"recapId"|"trackIndex"|"chunkIndex"|"startMs"|"endMs">,
  cues:CaptionCue[],now:string):Promise<string>{
  if(cues.length>1500)throw new Error("A provider fragment exceeded its cue budget.");
  const speaker=await speakerFor(env,clip);
  const stamped=cues.map(c=>({...c,rawSpeaker:speaker.discordName}));
  const text=JSON.stringify({version:1,provider:"gemini",jobId:clip.jobId,
    recapId:clip.recapId,trackIndex:clip.trackIndex,chunkIndex:clip.chunkIndex,
    startMs:clip.startMs,endMs:clip.endMs,speaker,createdAt:now,cues:stamped});
  if(text.length>160_000)throw new Error("Gemini fragment is too large.");
  const key=fragmentKey(clip);
  // Immutable per-chunk result: a later retry must not silently overwrite.
  const written=await env.BUCKET.put(key,text,{onlyIf:new Headers({"If-None-Match":"*"}),
    httpMetadata:{contentType:"application/json"}});
  if(!written){
    const prior=await env.BUCKET.get(key);
    if(!prior||await prior.text()!==text)throw new Error("Transcript fragment changed unexpectedly.");
  }
  return key;
}
async function finish(env:GeminiCronEnvironment,clip:GeminiLeasedClip,
  cues:CaptionCue[],now:string){
  const key=await saveFragment(env,clip,cues,now);
  if(!await finishGeminiChunk(env.DB,clip,key,now))
    throw new Error("Gemini lease was revoked before saving its fragment.");
  // No player-visible transcript is published automatically.
  const updated=await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
    "SET status='awaiting_review',updated_at=? WHERE id=? AND status='queued' "+
    "AND paused_at IS NULL AND total_chunks>0 AND "+
    "completed_chunks=(SELECT COUNT(*) FROM campaign_recap_processing_chunks "+
    "WHERE job_id=? AND status='completed') AND "+
    "total_chunks=(SELECT COUNT(*) FROM campaign_recap_processing_chunks WHERE job_id=?)")
    .bind(now,clip.jobId,clip.jobId,clip.jobId).run();
  return updated.meta.changes===1;
}
async function pollOne(env:GeminiCronEnvironment,now:string){
  const current=await env.DB.prepare("SELECT c.job_id AS jobId,j.recap_id AS recapId,"+
    "j.campaign_id AS campaignId,j.requested_by AS requestedBy,"+
    "c.track_index AS trackIndex,c.chunk_index AS chunkIndex,"+
    "c.start_ms AS startMs,c.end_ms AS endMs,"+
    "c.provider_interaction_id AS interactionId,c.provider_poll_after AS nextPoll "+
    "FROM campaign_recap_processing_chunks c JOIN campaign_recap_processing_jobs j "+
    "ON j.id=c.job_id WHERE j.provider='gemini' AND j.status='queued' "+
    "AND j.paused_at IS NULL AND c.status='submitted' "+
    "AND c.provider_interaction_id IS NOT NULL "+
    "AND (c.provider_poll_after IS NULL OR c.provider_poll_after<=?) "+
    "ORDER BY c.provider_poll_after LIMIT 1").bind(now).first<Pending>();
  if(!current||!VALID_ID.test(current.interactionId))return false;
  // Reserve a polling interval to avoid two simultaneous Cron invocations.
  const later=time(Date.parse(now)+POLL_MS);
  const claimed=await env.DB.prepare("UPDATE campaign_recap_processing_chunks "+
    "SET provider_poll_after=? WHERE job_id=? AND track_index=? AND chunk_index=? "+
    "AND status='submitted' AND provider_interaction_id=? "+
    "AND (provider_poll_after IS NULL OR provider_poll_after<=?)")
    .bind(later,current.jobId,current.trackIndex,current.chunkIndex,current.interactionId,now).run();
  if(claimed.meta.changes!==1)return false;
  const key=await ownKey(env,current.requestedBy,current.jobId);
  let outcome:GeminiProviderOutcome;
  try{
    outcome=await pollGeminiInteraction({key,id:current.interactionId,
      startMs:current.startMs,durationMs:current.endMs-current.startMs});
  }catch{
    // Keep interaction ID; a read-only GET can be retried safely next tick.
    return true;
  }
  if(outcome.kind==="pending"||outcome.kind==="quota")return true;
  if(outcome.kind==="rejected"){
    await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET paused_at=?,failure_code='provider_result_failed',updated_at=? "+
      "WHERE id=? AND status='queued'").bind(now,now,current.jobId).run();
    return true;
  }
  const fragmentClip={...current};
  const saved=await saveFragment(env,fragmentClip,outcome.cues,now);
  const completed=await env.DB.prepare("UPDATE campaign_recap_processing_chunks "+
    "SET status='completed',transcript_key=?,provider_poll_after=NULL,updated_at=? "+
    "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='submitted' "+
    "AND provider_interaction_id=? "+
    "AND EXISTS(SELECT 1 FROM campaign_recap_processing_jobs j "+
    "WHERE j.id=? AND j.status='queued' AND j.paused_at IS NULL)")
    .bind(saved,now,current.jobId,current.trackIndex,current.chunkIndex,current.interactionId,current.jobId).run();
  if(completed.meta.changes===1){
    await env.DB.prepare("UPDATE campaign_recap_processing_jobs SET "+
      "completed_chunks=(SELECT COUNT(*) FROM campaign_recap_processing_chunks "+
      "WHERE job_id=? AND status='completed'),updated_at=? WHERE id=?")
      .bind(current.jobId,now,current.jobId).run();
    // Completion is assembled for private GM review in the next phase.
    await env.DB.prepare("UPDATE campaign_recap_processing_jobs SET "+
      "status='awaiting_review',updated_at=? WHERE id=? AND status='queued' "+
      "AND completed_chunks=total_chunks AND total_chunks>0")
      .bind(now,current.jobId).run();
  }
  return true;
}
async function submitOne(env:GeminiCronEnvironment,now:string){
  const leased=await leaseOnePreparedGeminiChunk(env.DB,{
    enabled:true,freeQuotaVerified:false,
    now,verifySource:async(key,size)=>{
      return /^drive-asset\/[0-9a-f-]{36}$/iu.test(key)&&
        Number.isSafeInteger(size)&&size>=128&&size<=GEMINI_BACKGROUND_MAX_CLIP_BYTES;
    },
  });
  if(!leased)return false;
  try{
    // Must verify remote audio on EVERY submitted chunk, not just the sample button.
    const audio=await readVerifiedGmGeminiClip(env.DB,env,leased);
    const key=await ownKey(env,leased.requestedBy,leased.jobId);
    // Recheck cancellation and ownership after audio download, before provider call.
    const permitted=await env.DB.prepare("SELECT 1 AS allowed FROM "+
      "campaign_recap_processing_chunks c JOIN campaign_recap_processing_jobs j "+
      "ON j.id=c.job_id JOIN user_recap_ai_connections a "+
      "ON a.id=j.provider_connection_id AND a.user_id=j.requested_by "+
      "WHERE j.id=? AND j.status='queued' AND j.paused_at IS NULL "+
      "AND j.requested_by=? AND a.status='connected' AND "+
      "c.track_index=? AND c.chunk_index=? AND c.status='leased' AND c.lease_token=?")
      .bind(leased.jobId,leased.requestedBy,leased.trackIndex,leased.chunkIndex,leased.leaseToken)
      .first<{allowed:number}>();
    if(!permitted)return false;
    // Reserve a conservative upper cost estimate before any potentially
    // billable request. A failed/unknown result keeps this reservation:
    // never permit an accidental retry to exceed the GM's chosen ceiling.
    const budget=await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET spent_cost_microusd=spent_cost_microusd+?,updated_at=? "+
      "WHERE id=? AND requested_by=? AND status='queued' AND paused_at IS NULL "+
      "AND quota_mode='gm-owned-paid-allowed' AND max_cost_microusd>0 "+
      "AND spent_cost_microusd+?<=max_cost_microusd")
      .bind(Math.ceil((leased.endMs-leased.startMs)/60000)*10000,now,
        leased.jobId,leased.requestedBy,
        Math.ceil((leased.endMs-leased.startMs)/60000)*10000).run();
    // Free-tier jobs only run behind separate project-specific verification;
    // no global flag should ever classify an arbitrary paid GM project as free.
    if(leased.quotaMode!=="gm-owned-paid-allowed"||budget.meta.changes!==1){
      await holdGeminiChunk(env.DB,leased,"needs_attention",now);
      return true;
    }
    let outcome:GeminiProviderOutcome;
    try{
      outcome=await submitVerifiedGeminiAudio({key,bytes:audio.bytes,
        startMs:leased.startMs,durationMs:leased.endMs-leased.startMs});
    }catch(e){
      await holdGeminiChunk(env.DB,leased,e instanceof GeminiAmbiguousResult?
        "uncertain_result":"provider_unavailable",now);
      return true;
    }
    if(outcome.kind==="quota"){
      await holdGeminiChunk(env.DB,leased,"quota",now);return true;
    }
    if(outcome.kind==="rejected"){
      await holdGeminiChunk(env.DB,leased,"needs_attention",now);return true;
    }
    if(outcome.kind==="pending"){
      await env.DB.prepare("UPDATE campaign_recap_processing_chunks "+
        "SET status='submitted',provider_interaction_id=?,provider_submitted_at=?,"+
        "provider_poll_after=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? "+
        "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='leased' AND lease_token=?")
        .bind(outcome.id,now,time(Date.parse(now)+POLL_MS),now,
          leased.jobId,leased.trackIndex,leased.chunkIndex,leased.leaseToken).run();
      return true;
    }
    await finish(env,leased,outcome.cues,now);
  }catch{
    // A verified request may already have reached Google; quarantine unknown
    // rather than risk repeating a paid provider submission.
    await holdGeminiChunk(env.DB,leased,"uncertain_result",now);
  }
  return true;
}
/** One bounded unit of I/O per Cron invocation. Explicitly disabled by default. */
export async function runGeminiScheduledTick(env:GeminiCronEnvironment):Promise<void>{
  if(env.RECAP_GEMINI_BACKGROUND_ENABLED!=="true")return;
  const now=new Date().toISOString();
  await quarantineExpiredGeminiLeases(env.DB,now);
  // Poll recorded provider IDs first: read-only retrieval cannot incur a
  // second transcription charge.
  if(await pollOne(env,now))return;
  await submitOne(env,now);
}
