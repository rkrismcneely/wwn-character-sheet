import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
import { GEMINI_BACKGROUND_MAX_CLIP_BYTES,GEMINI_BACKGROUND_MAX_CLIP_MS,
  GEMINI_BACKGROUND_MAX_CLIPS_PER_JOB } from "@/lib/campaigns/recap-gemini-background";

type Context={params:Promise<{id:string}>};
type Job={id:string;importId:string;requestedBy:string;recapId:string;status:string;
  speakerTracks:number;totalChunks:number;pausedAt:string|null};
type ClipRow={trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
  sourceDigest:string|null;driveAssetId:string|null};
type ProposedClip={startMs:number;endMs:number};
const HEADERS={"cache-control":"private, no-store"};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
function respond(error:string,status:number){return Response.json({error},{status,headers:HEADERS});}
function sameOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin&&
  request.headers.get("sec-fetch-site")!=="cross-site";}
function invalid(message:string):never{throw new CampaignServiceError(message,422);}
function parseId(value:unknown,label:string):string{
  if(typeof value!=="string"||!uuid.test(value))invalid("Choose a valid "+label+".");
  return value as string;
}
async function scope(request:Request,context:Context,recapId:unknown,rawJobId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  requireActiveCampaign(access.campaign);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only GMs can prepare session audio.",403);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  const job=await db.prepare("SELECT id,import_id AS importId,requested_by AS requestedBy,"+
    "recap_id AS recapId,status,speaker_tracks AS speakerTracks,"+
    "total_chunks AS totalChunks,paused_at AS pausedAt "+
    "FROM campaign_recap_processing_jobs "+
    "WHERE id=? AND campaign_id=? AND recap_id=? AND provider='gemini'")
    .bind(parseId(rawJobId,"Gemini job"),access.campaign.id,recap.id).first<Job>();
  if(!job)throw new CampaignServiceError("Gemini job not found.",404);
  if(job.requestedBy!==actor.userId)
    throw new CampaignServiceError("Only this job's initiating GM can stage audio.",403);
  return {db,actor,campaign:access.campaign,recap,job};
}
async function confirmedTracks(campaignId:string,importId:string){
  const obj=await env.BUCKET.get("recap-track-speakers/"+campaignId+"/"+importId);
  if(!obj)throw new CampaignServiceError("Confirm the Craig speaker tracks before staging audio.",409);
  const data=await obj.json<{version?:number;assignments?:{index:number;discordName:string;displayName:string}[]}>();
  if(data.version!==1||!Array.isArray(data.assignments)||data.assignments.length===0)
    throw new CampaignServiceError("The Craig speaker snapshot is unavailable.",409);
  return data.assignments.map(item=>item.index);
}
const select="SELECT track_index AS trackIndex,chunk_index AS chunkIndex,start_ms AS startMs,"+
  "end_ms AS endMs,source_digest AS sourceDigest,drive_asset_id AS driveAssetId "+
  "FROM campaign_recap_processing_chunks WHERE job_id=? ORDER BY track_index,chunk_index";
function fail(error:unknown){
  if(error instanceof RequestBodyError)return respond(error.message,error.status);
  return campaignErrorResponse(error,"Gemini audio staging unavailable.");
}
/** Private upload progress, with no Drive URL, remote file ID or account token. */
export async function GET(request:Request,context:Context){
  try{
    const qs=new URL(request.url).searchParams;
    const {db,job}=await scope(request,context,qs.get("recapId"),qs.get("jobId"));
    const rows=await db.prepare(select).bind(job.id).all<ClipRow>();
    return Response.json({jobId:job.id,status:job.status,totalChunks:job.totalChunks,
      speakerTracks:job.speakerTracks,
      clips:rows.results.map(row=>({trackIndex:row.trackIndex,chunkIndex:row.chunkIndex,
        startMs:row.startMs,endMs:row.endMs,sourceDigest:row.sourceDigest,
        staged:Boolean(row.driveAssetId)}))},{headers:HEADERS});
  }catch(error){return fail(error);}
}
export async function POST(request:Request,context:Context){
  if(!sameOrigin(request))return respond("Open TWE to prepare audio.",403);
  try{
    const body=await readBoundedJson(request,35000) as {
      recapId?:unknown;jobId?:unknown;action?:unknown;trackIndex?:unknown;chunks?:unknown;
      chunkIndex?:unknown;assetId?:unknown;sourceDigest?:unknown;
    };
    const {db,actor,campaign,job}=await scope(request,context,body.recapId,body.jobId);
    if(job.status!=="awaiting_source"||job.pausedAt!==null)
      return respond("This job is not accepting new audio.",409);
    if(body.action==="plan"){
      const trackIndex=body.trackIndex;
      const assigned=await confirmedTracks(campaign.id,job.importId);
      if(!Number.isSafeInteger(trackIndex)||!assigned.includes(trackIndex as number))
        return respond("Select a speaker track from this Craig recording.",422);
      if(!Array.isArray(body.chunks)||body.chunks.length<1||body.chunks.length>120)
        return respond("Choose a complete one-to-eight-hour WAV track plan.",422);
      const proposed=body.chunks as ProposedClip[];
      let last=0;
      for(const part of proposed){
        if(!part||!Number.isSafeInteger(part.startMs)||!Number.isSafeInteger(part.endMs)||
          part.startMs!==last||part.endMs<=part.startMs||
          part.endMs-part.startMs>GEMINI_BACKGROUND_MAX_CLIP_MS||
          part.endMs>8*60*60*1000)
          return respond("Each clip must be time-aligned, contiguous and at most 30 minutes.",422);
        last=part.endMs;
      }
      const existing=await db.prepare(
        "SELECT COUNT(*) AS count FROM campaign_recap_processing_chunks "+
        "WHERE job_id=? AND track_index=?").bind(job.id,trackIndex).first<{count:number}>();
      if(Number(existing?.count??0)>0)return respond("This track is already planned. Resume its uploads.",409);
      if(job.totalChunks+proposed.length>GEMINI_BACKGROUND_MAX_CLIPS_PER_JOB)
        return respond("The staged job exceeds the allowed 512 audio clips.",413);
      const now=new Date().toISOString();
      // One transactional batch: either all timed fragments exist or none do.
      await db.batch([
        ...proposed.map((part,i)=>db.prepare(
          "INSERT INTO campaign_recap_processing_chunks "+
          "(job_id,track_index,chunk_index,start_ms,end_ms,status,attempts,updated_at) "+
          "VALUES (?,?,?,?,?,'pending',0,?)")
          .bind(job.id,trackIndex,i,part.startMs,part.endMs,now)),
        db.prepare("UPDATE campaign_recap_processing_jobs SET "+
          "total_chunks=(SELECT COUNT(*) FROM campaign_recap_processing_chunks WHERE job_id=?),"+
          "updated_at=? WHERE id=? AND status='awaiting_source'")
          .bind(job.id,now,job.id),
      ]);
      return Response.json({planned:true,count:proposed.length},{headers:HEADERS});
    }
    if(body.action==="attach"){
      const index=body.trackIndex,part=body.chunkIndex;
      if(!Number.isSafeInteger(index)||!Number.isSafeInteger(part)||index<0||index>127||
        part<0||part>511||typeof body.sourceDigest!=="string"||
        !/^[0-9a-f]{64}$/u.test(body.sourceDigest))
        return respond("Choose a valid signed-off audio clip and SHA-256 digest.",422);
      const assetId=parseId(body.assetId,"verified Drive audio asset");
      const clip=await db.prepare(
        "SELECT start_ms AS startMs,end_ms AS endMs,drive_asset_id AS driveAssetId,"+
        "source_digest AS sourceDigest FROM campaign_recap_processing_chunks "+
        "WHERE job_id=? AND track_index=? AND chunk_index=? AND status='pending'")
        .bind(job.id,index,part).first<{
          startMs:number;endMs:number;driveAssetId:string|null;sourceDigest:string|null;
        }>();
      if(!clip)return respond("Plan the exact timed clip before uploading.",409);
      if(clip.driveAssetId){
        if(clip.driveAssetId===assetId&&clip.sourceDigest===body.sourceDigest)
          return Response.json({staged:true,duplicate:true},{headers:HEADERS});
        return respond("This clip already has a different verified recording.",409);
      }
      const asset=await db.prepare(
        "SELECT id,byte_size AS byteSize,duration_ms AS durationMs,mime_type AS mimeType,"+
        "remote_file_id AS remoteFileId FROM campaign_recap_audio_assets "+
        "WHERE id=? AND campaign_id=? AND recap_id=? AND processing_job_id=? "+
        "AND storage_owner_user_id=? AND status='ready'")
        .bind(assetId,campaign.id,job.recapId,job.id,actor.userId)
        .first<{id:string;byteSize:number;durationMs:number|null;mimeType:string;remoteFileId:string|null}>();
      if(!asset||!asset.remoteFileId||asset.mimeType!=="audio/wav"||
        asset.byteSize<128||asset.byteSize>GEMINI_BACKGROUND_MAX_CLIP_BYTES||
        asset.durationMs===null||Math.abs(asset.durationMs-(clip.endMs-clip.startMs))>10)
        return respond("This Drive file is not a verified matching speech clip.",409);
      // A Drive asset may be attached to exactly one queued chunk.
      const reused=await db.prepare("SELECT 1 AS found FROM campaign_recap_processing_chunks "+
        "WHERE drive_asset_id=? LIMIT 1").bind(assetId).first<{found:number}>();
      if(reused)return respond("This uploaded clip belongs to a different chunk.",409);
      const now=new Date().toISOString();
      const saved=await db.prepare("UPDATE campaign_recap_processing_chunks SET "+
        "drive_asset_id=?,audio_key=?,audio_mime_type='audio/wav',audio_bytes=?,"+
        "source_digest=?,updated_at=? WHERE job_id=? AND track_index=? AND chunk_index=? "+
        "AND status='pending' AND drive_asset_id IS NULL")
        .bind(assetId,"drive-asset/"+assetId,asset.byteSize,body.sourceDigest,now,
          job.id,index,part).run();
      if(saved.meta.changes!==1)return respond("This clip changed elsewhere. Refresh to resume.",409);
      return Response.json({staged:true,duplicate:false},{headers:HEADERS});
    }
    if(body.action==="seal"){
      const confirmed=await confirmedTracks(campaign.id,job.importId);
      const stats=await db.prepare("SELECT COUNT(*) AS total,"+
        "COUNT(DISTINCT track_index) AS tracks,"+
        "SUM(CASE WHEN drive_asset_id IS NOT NULL AND audio_key IS NOT NULL "+
        "AND source_digest IS NOT NULL THEN 1 ELSE 0 END) AS linked "+
        "FROM campaign_recap_processing_chunks WHERE job_id=?").bind(job.id)
        .first<{total:number;tracks:number;linked:number}>();
      if(!stats||stats.total<1||stats.total!==stats.linked||
        stats.total!==job.totalChunks||stats.tracks!==confirmed.length||
        stats.tracks!==job.speakerTracks)
        return respond("Finish preparing every confirmed Craig track before sealing the job.",409);
      const result=await db.prepare("UPDATE campaign_recap_processing_jobs "+
        "SET status='queued',source_checked_at=?,updated_at=? "+
        "WHERE id=? AND requested_by=? AND status='awaiting_source' AND paused_at IS NULL")
        .bind(new Date().toISOString(),new Date().toISOString(),job.id,actor.userId).run();
      if(result.meta.changes!==1)return respond("Job changed elsewhere.",409);
      return Response.json({staged:true,queued:true,
        backgroundEnabled:false,notice:"Prepared clips are in your Drive. Gemini background execution is not active yet."},
        {headers:HEADERS});
    }
    return respond("Choose plan, attach, or seal.",422);
  }catch(error){return fail(error);}
}
