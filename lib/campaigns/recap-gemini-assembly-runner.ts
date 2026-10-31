import { appendGeminiAssemblyDraft,geminiAssemblyObjectKey,
  geminiFragmentObjectKey,GEMINI_ASSEMBLY_BATCH_SIZE,
  type GeminiAssemblyDraft,type GeminiFragmentIdentity,
} from "./recap-gemini-assembly.ts";

type AssemblyEnv={DB:D1Database;BUCKET:R2Bucket};
type Job={id:string;recapId:string;campaignId:string;totalChunks:number;assemblyCursor:number};
type Chunk={trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
  transcriptKey:string|null};
const LEASE_MS=4*60*1000;
/**
 * At most four fragments per Cron tick to bound CPU and memory on Cloudflare.
 * Writes only a GM-private intermediate object; never the published transcript.
 */
export async function assembleOneReadyGeminiJob(env:AssemblyEnv,now:string):Promise<boolean>{
  const job=await env.DB.prepare("SELECT id,recap_id AS recapId,campaign_id AS campaignId,"+
    "total_chunks AS totalChunks,assembly_cursor AS assemblyCursor "+
    "FROM campaign_recap_processing_jobs WHERE provider='gemini' "+
    "AND status='awaiting_review' AND assembled_at IS NULL AND paused_at IS NULL "+
    "AND total_chunks>0 AND completed_chunks=total_chunks "+
    "AND (assembly_lease_expires_at IS NULL OR assembly_lease_expires_at<=?) "+
    "ORDER BY updated_at LIMIT 1").bind(now).first<Job>();
  if(!job||!job.recapId||job.totalChunks>512||job.totalChunks<1)return false;
  const token=crypto.randomUUID();
  const expires=new Date(Date.parse(now)+LEASE_MS).toISOString();
  const locked=await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
    "SET assembly_lease_token=?,assembly_lease_expires_at=? "+
    "WHERE id=? AND provider='gemini' AND status='awaiting_review' "+
    "AND assembled_at IS NULL AND paused_at IS NULL AND completed_chunks=total_chunks "+
    "AND (assembly_lease_expires_at IS NULL OR assembly_lease_expires_at<=?)")
    .bind(token,expires,job.id,now).run();
  if(locked.meta.changes!==1)return false;
  try{
    const key=geminiAssemblyObjectKey(job.campaignId,job.id);
    const previous=await env.BUCKET.get(key);
    if(previous&&previous.size>2_000_000)throw new Error("Assembled draft is too large.");
    const draft=previous?await previous.json<GeminiAssemblyDraft>():null;
    const cursor=draft?.fragmentsProcessed??0;
    if(cursor<job.assemblyCursor||cursor>=job.totalChunks)
      throw new Error("Assembly checkpoint is inconsistent.");
    const limit=Math.min(GEMINI_ASSEMBLY_BATCH_SIZE,job.totalChunks-cursor);
    const chunks=await env.DB.prepare("SELECT track_index AS trackIndex,"+
      "chunk_index AS chunkIndex,start_ms AS startMs,end_ms AS endMs,"+
      "transcript_key AS transcriptKey FROM campaign_recap_processing_chunks "+
      "WHERE job_id=? AND status='completed' "+
      "ORDER BY track_index,chunk_index LIMIT ? OFFSET ?")
      .bind(job.id,limit,cursor).all<Chunk>();
    if(chunks.results.length!==limit)
      throw new Error("Completed fragments are missing.");
    const input:{identity:GeminiFragmentIdentity;fragment:unknown}[]=[];
    for(const part of chunks.results){
      const expected=geminiFragmentObjectKey(job.campaignId,job.id,part.trackIndex,part.chunkIndex);
      if(part.transcriptKey!==expected)
        throw new Error("A transcript fragment has the wrong storage identity.");
      const object=await env.BUCKET.get(expected);
      if(!object||object.size>160_000)
        throw new Error("A transcript fragment was not saved or is oversized.");
      input.push({identity:{jobId:job.id,recapId:job.recapId,
        trackIndex:part.trackIndex,chunkIndex:part.chunkIndex,
        startMs:part.startMs,endMs:part.endMs},fragment:await object.json()});
    }
    const merged=appendGeminiAssemblyDraft(draft,
      {jobId:job.id,recapId:job.recapId,totalChunks:job.totalChunks},input,now);
    const text=JSON.stringify(merged);
    const condition=previous?{etagMatches:previous.etag}:new Headers({"If-None-Match":"*"});
    const written=await env.BUCKET.put(key,text,{onlyIf:condition,
      httpMetadata:{contentType:"application/json"}});
    if(!written)throw new Error("Another assembler changed the private draft.");
    const done=merged.fragmentsProcessed===job.totalChunks;
    const result=await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET assembly_cursor=?,assembled_transcript_key=?,assembled_at=?,"+
      "assembly_lease_token=NULL,assembly_lease_expires_at=NULL,updated_at=? "+
      "WHERE id=? AND status='awaiting_review' AND paused_at IS NULL "+
      "AND assembly_lease_token=? AND assembled_at IS NULL AND assembly_cursor<=?")
      .bind(merged.fragmentsProcessed,key,done?now:null,now,
        job.id,token,merged.fragmentsProcessed).run();
    if(result.meta.changes!==1)
      throw new Error("Job was paused or changed during private assembly.");
    return true;
  }catch{
    // Keep the private draft and protect the job from bad fragment data.
    // A GM can inspect failure_code and decide whether to repair or retry.
    await env.DB.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET paused_at=?,failure_code='assembly_needs_review',updated_at=?,"+
      "assembly_lease_token=NULL,assembly_lease_expires_at=NULL "+
      "WHERE id=? AND status='awaiting_review' AND assembly_lease_token=?")
      .bind(now,now,job.id,token).run();
    return true;
  }
}
