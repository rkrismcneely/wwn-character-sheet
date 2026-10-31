import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { readVerifiedGmGeminiClip } from "@/lib/campaigns/recap-gemini-drive-source";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";

type Context={params:Promise<{id:string}>};
const HEADERS={"cache-control":"private, no-store"};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const error=(msg:string,status:number)=>Response.json({error:msg},{status,headers:HEADERS});

/**
 * Manual source check, not provider inference. The GM can test one Drive clip
 * without submitting audio to Gemini or exposing its bytes to the browser.
 */
export async function POST(request:Request,context:Context):Promise<Response>{
  const origin=request.headers.get("origin");
  if(origin!==new URL(request.url).origin||
    request.headers.get("sec-fetch-site")==="cross-site")
    return error("Verify audio from the TWE recap page.",403);
  try{
    const actor=await getSessionActor(request);
    if(!actor)return error("Sign in required.",401);
    const {id}=await context.params;
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    requireActiveCampaign(access.campaign);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return error("Only GMs can verify processing audio.",403);
    const body=await readBoundedJson(request,2048) as {
      recapId?:unknown;jobId?:unknown;trackIndex?:unknown;chunkIndex?:unknown;
    };
    if(typeof body.jobId!=="string"||!UUID.test(body.jobId)||
      typeof body.trackIndex!=="number"||!Number.isSafeInteger(body.trackIndex)||
      body.trackIndex<0||body.trackIndex>127||
      typeof body.chunkIndex!=="number"||!Number.isSafeInteger(body.chunkIndex)||
      body.chunkIndex<0||body.chunkIndex>=512)
      return error("Choose an existing prepared audio clip.",422);
    const recap=await getCampaignSessionRecap(db,actor,id,body.recapId);
    // Admission limited to the GM who owns BOTH the saved job and provider key.
    const job=await db.prepare("SELECT id FROM campaign_recap_processing_jobs "+
      "WHERE id=? AND campaign_id=? AND recap_id=? AND requested_by=? "+
      "AND provider='gemini' AND status IN ('queued','transcribing') "+
      "AND paused_at IS NULL AND cancelled_at IS NULL")
      .bind(body.jobId,access.campaign.id,recap.id,actor.userId)
      .first<{id:string}>();
    if(!job)return error("You do not have an active Gemini job for this recap.",409);
    const now=new Date(),stamp=now.toISOString();
    const eligibleBefore=new Date(now.getTime()-2*60*1000).toISOString();
    // Atomic cooldown keeps repeated verification from consuming owner resources.
    const admitted=await db.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET source_verify_attempted_at=? WHERE id=? AND requested_by=? "+
      "AND provider='gemini' AND status IN ('queued','transcribing') "+
      "AND paused_at IS NULL AND cancelled_at IS NULL "+
      "AND (source_verify_attempted_at IS NULL OR source_verify_attempted_at<=?)")
      .bind(stamp,job.id,actor.userId,eligibleBefore).run();
    if(admitted.meta.changes!==1)
      return error("Source verification is rate-limited to one clip per job every two minutes.",429);
    const verified=await readVerifiedGmGeminiClip(db,env as unknown as DriveSettings,{
      jobId:job.id,campaignId:access.campaign.id,recapId:recap.id,
      requestedBy:actor.userId,trackIndex:body.trackIndex,chunkIndex:body.chunkIndex,
    });
    const audit=await db.prepare("UPDATE campaign_recap_processing_jobs "+
      "SET source_verified_at=? WHERE id=? AND requested_by=? "+
      "AND status IN ('queued','transcribing') AND paused_at IS NULL")
      .bind(new Date().toISOString(),job.id,actor.userId).run();
    if(audit.meta.changes!==1)return error("Job changed while verifying audio.",409);
    return Response.json({verified:true,trackIndex:verified.trackIndex,
      chunkIndex:verified.chunkIndex,durationMs:verified.actualDurationMs,
      notice:"Drive audio was authenticated, checksum-matched and checked as playable speech WAV. No Gemini inference occurred."},
      {headers:HEADERS});
  }catch(e){
    if(e instanceof RequestBodyError)return error(e.message,e.status);
    // Avoid disclosing remote URLs, OAuth tokens, Drive file IDs or source bytes.
    if(e instanceof CampaignServiceError)
      return campaignErrorResponse(e,"Unable to verify the private Drive audio.");
    return error("The Drive audio could not be validated. Reconnect Drive or restage this clip.",409);
  }
}
