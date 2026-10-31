/** Durable Gemini recap job lifecycle. No provider calls occur in this module. */
export const GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM=2;
export const GEMINI_BACKGROUND_MAX_TRACKS=16;
export const GEMINI_BACKGROUND_MAX_CLIP_MS=30*60*1000;
export const GEMINI_BACKGROUND_MAX_CLIP_BYTES=12*1024*1024;
export const GEMINI_BACKGROUND_MAX_CLIPS_PER_JOB=512;
export type GeminiJobState="awaiting_source"|"queued"|"preparing"|"transcribing"|
  "assembling"|"awaiting_review"|"completed"|"failed"|"cancelled";
export type GeminiQuotaMode="provider-free-only"|"gm-owned-paid-allowed";
export type GeminiJobSummary={
  id:string;recapId:string;status:GeminiJobState;quotaMode:GeminiQuotaMode;
  completedChunks:number;totalChunks:number;failedChunks:number;
  speakerTracks:number;nextEligibleAt:string|null;pausedAt:string|null;
  failureCode:string|null;createdAt:string;updatedAt:string;
};
/** A job is eligible only after every preflight condition is verified. */
export function canDispatchGeminiJob(input:{
  enabled:boolean;accountConnected:boolean;audioReady:boolean;
  humanApproved:boolean;userNotPaused:boolean;status:GeminiJobState;
  nextEligibleAt:string|null;now:string;freeQuotaVerified:boolean;
  quotaMode:GeminiQuotaMode;maxCostMicrousd:number;
}):boolean{
  if(!input.enabled||!input.accountConnected||!input.audioReady||
    !input.humanApproved||!input.userNotPaused||input.status!=="queued")return false;
  if(input.nextEligibleAt&&input.nextEligibleAt>input.now)return false;
  if(input.quotaMode==="provider-free-only"&&!input.freeQuotaVerified)return false;
  if(input.quotaMode==="gm-owned-paid-allowed"&&input.maxCostMicrousd<=0)return false;
  return true;
}
export function validateGeminiQuotaMode(value:unknown):GeminiQuotaMode{
  if(value!=="provider-free-only"&&value!=="gm-owned-paid-allowed")
    throw new Error("Choose a valid GM-owned transcription quota preference.");
  return value;
}
export function validateGeminiJobTransition(status:GeminiJobState,action:unknown){
  if(action==="pause"){
    if(status==="cancelled"||status==="completed")throw new Error("This job cannot be paused.");
    return "pause" as const;
  }
  if(action==="resume"){
    if(status==="cancelled"||status==="completed"||status==="failed")
      throw new Error("This job cannot be resumed.");
    return "resume" as const;
  }
  if(action==="cancel"){
    if(status==="cancelled"||status==="completed")throw new Error("This job has ended.");
    return "cancel" as const;
  }
  throw new Error("Choose pause, resume, or cancel.");
}
export function safeGeminiJobSummary(row:GeminiJobSummary):GeminiJobSummary{
  return {
    id:row.id,recapId:row.recapId,status:row.status,quotaMode:row.quotaMode,
    completedChunks:row.completedChunks,totalChunks:row.totalChunks,
    failedChunks:row.failedChunks,speakerTracks:row.speakerTracks,
    nextEligibleAt:row.nextEligibleAt,pausedAt:row.pausedAt,
    failureCode:row.failureCode,createdAt:row.createdAt,updatedAt:row.updatedAt,
  };
}

/** Metadata-only chunk plan. Each audio segment MUST be separately encoded as a
 * genuine playable file before any R2/Drive staging or Gemini requests.
 * Never split compressed FLAC/AAC by bytes.
 */
export function planGeminiAudioChunks(tracks:readonly {
  trackIndex:number;startMs:number;durationMs:number;
}[],chunkMs=20*60*1000):{
  trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
}[]{
  if(!Array.isArray(tracks)||tracks.length<1||tracks.length>GEMINI_BACKGROUND_MAX_TRACKS||
    !Number.isSafeInteger(chunkMs)||chunkMs<60_000||chunkMs>GEMINI_BACKGROUND_MAX_CLIP_MS)
    throw new Error("Choose 1–16 tracks and a valid segment duration.");
  const chunks:{trackIndex:number;chunkIndex:number;startMs:number;endMs:number}[]=[];
  const used=new Set<number>();
  for(const track of tracks){
    if(!Number.isSafeInteger(track.trackIndex)||track.trackIndex<0||track.trackIndex>127||
      used.has(track.trackIndex)||!Number.isSafeInteger(track.startMs)||track.startMs<0||
      !Number.isSafeInteger(track.durationMs)||track.durationMs<1000||
      track.startMs+track.durationMs>8*60*60*1000)
      throw new Error("Invalid or overlapping Craig source timeline metadata.");
    used.add(track.trackIndex);
    for(let from=0,index=0;from<track.durationMs;from+=chunkMs,index++){
      chunks.push({trackIndex:track.trackIndex,chunkIndex:index,
        startMs:track.startMs+from,endMs:track.startMs+Math.min(track.durationMs,from+chunkMs)});
    }
  }
  if(chunks.length>GEMINI_BACKGROUND_MAX_CLIPS_PER_JOB)
    throw new Error("Recording exceeds the bounded Gemini job chunk budget.");
  return chunks.sort((a,b)=>a.startMs-b.startMs||a.trackIndex-b.trackIndex);
}
