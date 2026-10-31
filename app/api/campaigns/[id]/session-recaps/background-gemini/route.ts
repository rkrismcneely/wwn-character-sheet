import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
import { GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM,GEMINI_BACKGROUND_MAX_TRACKS,
  safeGeminiJobSummary,validateGeminiJobTransition,validateGeminiQuotaMode,
  type GeminiJobSummary,type GeminiJobState } from "@/lib/campaigns/recap-gemini-background";

type Context={params:Promise<{id:string}>};
type DatabaseJob=GeminiJobSummary&{requestedBy:string;importId:string;providerConnectionId:string|null};
const privateHeaders={"cache-control":"private, no-store"};
const respond=(error:string,status:number)=>Response.json({error},{status,headers:privateHeaders});
const originOK=(request:Request)=>request.headers.get("origin")===new URL(request.url).origin&&
  request.headers.get("sec-fetch-site")!=="cross-site";
async function scope(request:Request,context:Context,rawRecap:unknown) {
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only GMs can manage recap transcription jobs.",403);
  requireActiveCampaign(access.campaign);
  const recap=await getCampaignSessionRecap(db,actor,id,rawRecap);
  return {db,actor,campaign:access.campaign,recap};
}
const selectJob="SELECT id,recap_id AS recapId,requested_by AS requestedBy,import_id AS importId,"+
  "provider_connection_id AS providerConnectionId,status,quota_mode AS quotaMode,"+
  "total_chunks AS totalChunks,completed_chunks AS completedChunks,"+
  "failed_chunks AS failedChunks,speaker_tracks AS speakerTracks,"+
  "next_eligible_at AS nextEligibleAt,paused_at AS pausedAt,failure_code AS failureCode,"+
  "created_at AS createdAt,updated_at AS updatedAt "+
  "FROM campaign_recap_processing_jobs WHERE provider='gemini' AND campaign_id=? AND recap_id=? ";
function fail(error:unknown){
  if(error instanceof RequestBodyError)return respond(error.message,error.status);
  return campaignErrorResponse(error,"Gemini background job unavailable.");
}
/** GM may inspect job progress; credentials, raw Craig keys and audio keys never appear. */
export async function GET(request:Request,context:Context) {
  try{
    const recapId=new URL(request.url).searchParams.get("recapId");
    const {db,campaign,recap}=await scope(request,context,recapId);
    const rows=await db.prepare(selectJob+"ORDER BY created_at DESC LIMIT 20")
      .bind(campaign.id,recap.id).all<DatabaseJob>();
    return Response.json({jobs:rows.results.map(safeGeminiJobSummary),
      backgroundEnabled:false,
      notice:"Saved job plans are not dispatched until the audio staging and free-usage guards are activated."},
      {headers:privateHeaders});
  }catch(error){return fail(error);}
}
/** Register a private, GM-owned future job; never start inference or upload audio. */
export async function POST(request:Request,context:Context){
  if(!originOK(request))return respond("Use the TWE recap page to create a job.",403);
  try{
    const body=await readBoundedJson(request,4096) as {
      recapId?:unknown;importId?:unknown;quotaMode?:unknown;approvedShare?:unknown;approvedBilling?:unknown;
    };
    const {db,actor,campaign,recap}=await scope(request,context,body.recapId);
    if(body.approvedShare!==true||body.approvedBilling!==true)
      return respond("Confirm Google data processing and use of your own provider account.",422);
    let quotaMode;
    try{quotaMode=validateGeminiQuotaMode(body.quotaMode);}
    catch{return respond("Select your own provider quota preference.",422);}
    if(typeof body.importId!=="string"||!/^[0-9a-f-]{36}$/iu.test(body.importId))
      return respond("Choose a confirmed Craig recording.",422);
    await getCraigRecordingForDownloadJob(db,actor,await (async()=>campaign.publicId)(),body.importId);
    const imported=await db.prepare(
      "SELECT session_date AS sessionDate FROM campaign_recap_recording_imports "+
      "WHERE campaign_id=? AND id=? AND source_type='craig' AND status='ready'")
      .bind(campaign.id,body.importId).first<{sessionDate:string}>();
    if(!imported||imported.sessionDate!==recap.sessionDate)
      return respond("Choose a Craig recording from the same session date as this recap.",409);
    const speakerObject=await env.BUCKET.get("recap-track-speakers/"+campaign.id+"/"+body.importId);
    if(!speakerObject)return respond("Extract and confirm Craig track speakers first.",409);
    const saved=await speakerObject.json<{
      version?:number;assignments?:{index:number;displayName:string;discordName:string}[];
    }>();
    const tracks=saved.version===1&&Array.isArray(saved.assignments)?saved.assignments:[];
    if(tracks.length<1||tracks.length>GEMINI_BACKGROUND_MAX_TRACKS||
      tracks.some(x=>!Number.isSafeInteger(x.index)||x.index<0||x.index>127||
        !x.displayName||!x.discordName))
      return respond("Confirm 1–16 independent Craig speaker tracks before queuing.",409);
    const connection=await db.prepare("SELECT id FROM user_recap_ai_connections "+
      "WHERE user_id=? AND provider='gemini' AND status='connected' AND key_ciphertext IS NOT NULL")
      .bind(actor.userId).first<{id:string}>();
    if(!connection)return respond("Connect your own Gemini API key in Account first.",409);
    const old=await db.prepare(selectJob+"AND import_id=? LIMIT 1")
      .bind(campaign.id,recap.id,body.importId).first<DatabaseJob>();
    if(old){
      if(old.requestedBy!==actor.userId)
        return respond("Another GM already owns the transcription job for this recording.",409);
      return Response.json({job:safeGeminiJobSummary(old),existing:true},{headers:privateHeaders});
    }
    const active=await db.prepare(
      "SELECT COUNT(*) AS count FROM campaign_recap_processing_jobs "+
      "WHERE requested_by=? AND provider='gemini' AND status NOT IN ('completed','cancelled','failed')")
      .bind(actor.userId).first<{count:number}>();
    if(Number(active?.count??0)>=GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM)
      return respond("Finish or cancel a saved job before creating another.",409);
    const now=new Date().toISOString(),id=crypto.randomUUID();
    const inserted=await db.prepare("INSERT INTO campaign_recap_processing_jobs "+
      "(id,campaign_id,import_id,requested_by,source_lane,status,provider,recap_id,provider_connection_id,"+
      "quota_mode,speaker_tracks,total_chunks,completed_chunks,failed_chunks,max_cost_microusd,"+
      "spent_cost_microusd,created_at,updated_at) "+
      "VALUES (?,?,?,?,'craig-multitrack','awaiting_source','gemini',?,?,?, ?,0,0,0,0,0,?,?) "+
      "ON CONFLICT(import_id) DO NOTHING")
      .bind(id,campaign.id,body.importId,actor.userId,recap.id,connection.id,quotaMode,tracks.length,now,now)
      .run();
    if(inserted.meta.changes!==1)
      return respond("This recording already has a processing job; refresh its status.",409);
    const job=await db.prepare(selectJob+"AND id=? LIMIT 1")
      .bind(campaign.id,recap.id,id).first<DatabaseJob>();
    if(!job)throw new CampaignServiceError("Could not load the new job.",409);
    return Response.json({job:safeGeminiJobSummary(job),created:true,
      notice:"Job saved privately. Waiting for prepared audio; no AI requests or charges have started."},
      {status:201,headers:privateHeaders});
  }catch(error){return fail(error);}
}
/** Pause, resume, or permanently cancel only the initiating GM's own job. */
export async function PATCH(request:Request,context:Context){
  if(!originOK(request))return respond("Use TWE to change job state.",403);
  try{
    const body=await readBoundedJson(request,2048) as {recapId?:unknown;jobId?:unknown;action?:unknown};
    const {db,actor,campaign,recap}=await scope(request,context,body.recapId);
    if(typeof body.jobId!=="string"||!/^[0-9a-f-]{36}$/iu.test(body.jobId))
      return respond("Choose a saved job.",422);
    const job=await db.prepare(selectJob+"AND id=? LIMIT 1")
      .bind(campaign.id,recap.id,body.jobId).first<DatabaseJob>();
    if(!job)return respond("Job not found.",404);
    if(job.requestedBy!==actor.userId)
      return respond("Only the GM who connected Gemini may control this job.",403);
    let action:"pause"|"resume"|"cancel";
    try{action=validateGeminiJobTransition(job.status as GeminiJobState,body.action);}
    catch{return respond("Job cannot transition from its current status.",409);}
    const now=new Date().toISOString();
    const changed=await db.prepare(
      action==="cancel"?
        "UPDATE campaign_recap_processing_jobs SET status='cancelled',cancelled_at=?,paused_at=?,updated_at=? "+
          "WHERE id=? AND requested_by=? AND status=?":
      action==="pause"?
        "UPDATE campaign_recap_processing_jobs SET paused_at=?,updated_at=? "+
          "WHERE id=? AND requested_by=? AND status=? AND paused_at IS NULL":
        "UPDATE campaign_recap_processing_jobs SET paused_at=NULL,updated_at=? "+
          "WHERE id=? AND requested_by=? AND status=? AND paused_at IS NOT NULL")
      .bind(...(action==="cancel"?[now,now,now,job.id,actor.userId,job.status]:
        action==="pause"?[now,now,job.id,actor.userId,job.status]:
        [now,job.id,actor.userId,job.status]))
      .run();
    if(changed.meta.changes!==1)return respond("Job changed elsewhere. Refresh its status.",409);
    return Response.json({updated:true,action},{headers:privateHeaders});
  }catch(error){return fail(error);}
}
