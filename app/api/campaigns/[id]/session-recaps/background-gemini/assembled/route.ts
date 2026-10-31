import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";
import { geminiAssemblyObjectKey,validateCompleteGeminiAssembly,
  type GeminiAssemblyDraft } from "@/lib/campaigns/recap-gemini-assembly";
import { recapTranscriptObjectKey,type SavedRecapTranscript } from "@/lib/campaigns/recap-full-transcript";

type Context={params:Promise<{id:string}>};
type Job={id:string;requestedBy:string;status:string;totalChunks:number;
  completedChunks:number;assemblyCursor:number;assembledAt:string|null;
  assembledKey:string|null;pausedAt:string|null};
const HEADERS={"cache-control":"private, no-store"};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
function reply(error:string,status:number){return Response.json({error},{status,headers:HEADERS});}
function fail(error:unknown) {
  if(error instanceof RequestBodyError)return reply(error.message,error.status);
  return campaignErrorResponse(error,"Gemini assembled transcript unavailable.");
}
async function scope(request:Request,context:Context,recapId:unknown,jobId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  requireActiveCampaign(access.campaign);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only campaign GMs may review transcripts.",403);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  if(typeof jobId!=="string"||!UUID.test(jobId))
    throw new CampaignServiceError("Select a saved Gemini transcription job.",422);
  const job=await db.prepare("SELECT id,requested_by AS requestedBy,status,"+
    "total_chunks AS totalChunks,completed_chunks AS completedChunks,"+
    "assembly_cursor AS assemblyCursor,assembled_at AS assembledAt,"+
    "assembled_transcript_key AS assembledKey,paused_at AS pausedAt "+
    "FROM campaign_recap_processing_jobs WHERE id=? AND provider='gemini' "+
    "AND campaign_id=? AND recap_id=?").bind(jobId,access.campaign.id,recap.id).first<Job>();
  if(!job)throw new CampaignServiceError("The Gemini job was not found.",404);
  if(job.requestedBy!==actor.userId)
    throw new CampaignServiceError("Only the GM who created this Gemini job may import its result.",403);
  return {job,db,campaign:access.campaign,recap};
}
async function loadCandidate(job:Job,campaignId:string,recapId:string) {
  if(job.status!=="awaiting_review"||!job.assembledAt||
    job.assemblyCursor!==job.totalChunks||job.completedChunks!==job.totalChunks||
    job.totalChunks<1||job.pausedAt!==null)
    throw new CampaignServiceError("This job's transcript has not finished assembling.",409);
  const expected=geminiAssemblyObjectKey(campaignId,job.id);
  if(job.assembledKey!==expected)
    throw new CampaignServiceError("The assembled transcript identity is invalid.",409);
  const object=await env.BUCKET.get(expected);
  if(!object||object.size>2_000_000)
    throw new CampaignServiceError("The private assembled transcript is missing or oversized.",409);
  const draft=await object.json<GeminiAssemblyDraft>();
  try{return validateCompleteGeminiAssembly(draft,job.id,recapId,job.totalChunks);}
  catch{throw new CampaignServiceError("The assembled transcript requires review or repair.",409);}
}
async function existingTranscript(key:string) {
  const obj=await env.BUCKET.get(key);
  if(!obj)return {value:null as SavedRecapTranscript|null,etag:null as string|null};
  const value=await obj.json<SavedRecapTranscript>();
  if(value.version!==1||!Array.isArray(value.cues))
    throw new CampaignServiceError("Existing recap transcript is unsupported.",409);
  return {value,etag:obj.etag};
}
/** First 100 captions are a preview; no raw audio/provider tokens are exposed. */
export async function GET(request:Request,context:Context) {
  try{
    const url=new URL(request.url);
    const {job,campaign,recap}=await scope(request,context,
      url.searchParams.get("recapId"),url.searchParams.get("jobId"));
    const current=await existingTranscript(recapTranscriptObjectKey(campaign.id,recap.id));
    if(!job.assembledAt)return Response.json({ready:false,status:job.status,
      assembled:job.assemblyCursor,total:job.totalChunks,
      existing:current.value?{published:current.value.published,
        updatedAt:current.value.updatedAt,count:current.value.cues.length}:null},{headers:HEADERS});
    const draft=await loadCandidate(job,campaign.id,recap.id);
    const rawPage=Number(url.searchParams.get("page")??"1");
    const page=Number.isSafeInteger(rawPage)&&rawPage>0?Math.min(rawPage,100):1;
    const offset=(page-1)*100;
    return Response.json({ready:true,status:job.status,count:draft.cues.length,
      speakers:[...new Set(draft.cues.map(c=>c.speakerName))].slice(0,32),
      page,pageCount:Math.ceil(draft.cues.length/100),cues:draft.cues.slice(offset,offset+100),
      existing:current.value?{published:current.value.published,
        updatedAt:current.value.updatedAt,count:current.value.cues.length}:null},
    {headers:HEADERS});
  }catch(e){return fail(e);}
}
/** GM explicitly copies a finished candidate into the existing editable *private* transcript. */
export async function POST(request:Request,context:Context){
  if(request.headers.get("origin")!==new URL(request.url).origin||
    request.headers.get("sec-fetch-site")==="cross-site")
    return reply("Import the transcript from your open TWE recap.",403);
  try{
    const body=await readBoundedJson(request,2048) as {
      recapId?:unknown;jobId?:unknown;replace?:unknown;expectedUpdatedAt?:unknown;
    };
    const {job,campaign,recap}=await scope(request,context,body.recapId,body.jobId);
    const draft=await loadCandidate(job,campaign.id,recap.id);
    const target=recapTranscriptObjectKey(campaign.id,recap.id);
    const prior=await existingTranscript(target);
    if(prior.value?.published)
      return reply("Unpublish your existing transcript before replacing its content.",409);
    if(prior.value && (body.replace!==true||
      typeof body.expectedUpdatedAt!=="string"||
      prior.value.updatedAt!==body.expectedUpdatedAt))
      return reply("An unpublished transcript already exists or changed. Review it before explicitly replacing.",409);
    if(!prior.value && body.replace===true && body.expectedUpdatedAt!==null)
      return reply("The existing transcript changed. Reload before importing.",409);
    const now=new Date().toISOString();
    const record:SavedRecapTranscript={version:1,published:false,updatedAt:now,
      cues:draft.cues};
    const json=JSON.stringify(record);
    if(new TextEncoder().encode(json).length>2_000_000)
      return reply("The assembled transcript exceeds the editable storage capacity.",413);
    const written=await env.BUCKET.put(target,json,{
      onlyIf:prior.etag?{etagMatches:prior.etag}:new Headers({"If-None-Match":"*"}),
      httpMetadata:{contentType:"application/json"},
    });
    if(!written)return reply("The transcript was updated in another tab. Reload and review it.",409);
    // Idempotent import remains private; publication is a separate reviewed GM action.
    return Response.json({saved:true,published:false,count:draft.cues.length,updatedAt:now,
      notice:"Assembled transcript copied to the GM-only editable draft. Review speaker mappings and dialogue before publishing."},
      {headers:HEADERS});
  }catch(e){return fail(e);}
}
