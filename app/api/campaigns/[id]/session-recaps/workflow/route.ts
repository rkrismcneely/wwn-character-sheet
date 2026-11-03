import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign} from "@/lib/campaigns/service";
import {listRecapAudioForPlayer} from "@/lib/campaigns/recap-audio-assets";
import {recapTranscriptObjectKey,type SavedRecapTranscript} from "@/lib/campaigns/recap-full-transcript";
import {emptyRecapWorkflow,recapWorkflowObjectKey,recapDraftObjectKey,
  transitionRecapWorkflow,type RecapWorkflow,type RecapWorkflowAction,
  type RecapSource} from "@/lib/campaigns/recap-stage-workflow";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";

type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
async function scope(request:Request,context:Context,recapId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only campaign GMs can manage recap stages.",403);
  requireActiveCampaign(access.campaign);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  return {db,actor,campaignId:access.campaign.publicId,recapId:recap.id};
}
async function readState(key:string){
  const object=await env.BUCKET.get(key);
  const current=object?await object.json<RecapWorkflow>():emptyRecapWorkflow(new Date().toISOString());
  if(current.version!==1||!Number.isSafeInteger(current.revision)||
    !Array.isArray(current.drafts))throw new CampaignServiceError("Unsupported recap workflow version.",409);
  return {current,etag:object?.etag??null};
}
async function transcriptSummary(campaignId:string,recapId:string){
  const object=await env.BUCKET.get(recapTranscriptObjectKey(campaignId,recapId));
  if(!object)return {updatedAt:null as string|null,count:0,published:false};
  const stored=await object.json<SavedRecapTranscript>();
  if(stored.version!==1||!Array.isArray(stored.cues))
    throw new CampaignServiceError("Saved transcript format is unsupported.",409);
  return {updatedAt:stored.updatedAt??null,count:stored.cues.length,published:stored.published};
}
function failure(e:unknown):Response{
  if(e instanceof RequestBodyError)return Response.json({error:e.message},{status:e.status,headers});
  if(e instanceof CampaignServiceError)return campaignErrorResponse(e,"Recap workflow unavailable.");
  if(e instanceof Error)return Response.json({error:e.message},{status:422,headers});
  return campaignErrorResponse(e,"Recap workflow unavailable.");
}
export async function GET(request:Request,context:Context){
  try{
    const params=new URL(request.url).searchParams;
    const {db,actor,campaignId,recapId}=await scope(request,context,params.get("recapId"));
    const key=recapWorkflowObjectKey(campaignId,recapId);
    const {current}=await readState(key);
    const draftId=params.get("draftId");
    if(draftId){
      const version=current.drafts.find(d=>d.id===draftId);
      if(!version)throw new CampaignServiceError("Draft version not found.",404);
      const object=await env.BUCKET.get(version.key);
      if(!object)throw new CampaignServiceError("Saved draft is missing.",409);
      const data=await object.json<{content:string}>();
      return Response.json({draft:version,content:data.content},{headers});
    }
    const [assets,transcript]=await Promise.all([
      listRecapAudioForPlayer(db,actor,campaignId,recapId),
      transcriptSummary(campaignId,recapId),
    ]);
    return Response.json({workflow:current,assets,transcript},{headers});
  }catch(e){return failure(e);}
}
export async function POST(request:Request,context:Context){
  try{
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin||
      request.headers.get("sec-fetch-site")==="cross-site")
      throw new CampaignServiceError("Open TWE to approve recap stages.",403);
    const body=await readBoundedJson(request,45_000) as
      Partial<RecapWorkflowAction>&{recapId?:unknown;revision?:unknown;localVerified?:unknown};
    if(!Number.isSafeInteger(body.revision)||Number(body.revision)<0)
      throw new CampaignServiceError("Refresh the recap workflow before saving.",409);
    const {db,actor,campaignId,recapId}=await scope(request,context,body.recapId);
    const key=recapWorkflowObjectKey(campaignId,recapId);
    const {current,etag}=await readState(key);
    if(current.revision!==body.revision)
      throw new CampaignServiceError("Recap stages changed in another tab. Reload before continuing.",409);
    const action=body as RecapWorkflowAction;
    const [assets,transcript]=await Promise.all([
      listRecapAudioForPlayer(db,actor,campaignId,recapId),
      transcriptSummary(campaignId,recapId),
    ]);
    // The transcript is a single saved document, not a versioned per-source collection.
    // Never silently combine captions from different recordings or transcription providers.
    if(transcript.count>0&&action.action==="approve-source"&&current.source&&
      JSON.stringify(current.source)!==JSON.stringify(action.source))
      throw new CampaignServiceError(
        "A transcript already exists for this recording. Start a separate recap to use a different audio source.",409);
    if(transcript.count>0&&action.action==="save-preparation"&&current.preparation&&
      (current.preparation.provider!==action.provider||
       current.preparation.method!==action.method))
      throw new CampaignServiceError(
        "The existing transcript belongs to the previous preparation. Start a separate recap to switch transcription providers or preparation methods.",409);
    let sourceReady=false;
    if(action.action==="approve-source"){
      const source=action.source as RecapSource;
      if(source?.kind==="drive"){
        const ready=assets.find(a=>a.id===source.id&&a.status==="ready");
        sourceReady=Boolean(ready&&ready.byteSize===source.bytes);
      }else if(source?.kind==="browser"){
        // The file lives in the GM's origin-private browser storage. The client
        // verifies it can reopen the bytes immediately before explicit approval.
        sourceReady=body.localVerified===true;
      }
    }
    const now=new Date().toISOString();
    const draft=action.action==="save-draft"
      ? {id:crypto.randomUUID(),key:""} : undefined;
    if(draft)draft.key=recapDraftObjectKey(campaignId,recapId,draft.id);
    const next=transitionRecapWorkflow(current,action,{
      sourceReady,transcriptRevision:transcript.count>0?transcript.updatedAt:null,
      draft,
    },now);
    if(action.action==="save-preparation"&&next.preparation){
      if(next.preparation.method==="ffmpeg" &&
        next.preparation.parts.some(p=>!p.localKey))
        throw new CampaignServiceError("Save every converted part in the browser before approval.",422);
      if(next.source?.kind==="browser"&&
        next.preparation.parts.some(p=>!p.localKey))
        throw new CampaignServiceError("Local recordings must have saved browser audio parts.",422);
    }
    if(action.action==="save-draft"&&draft){
      // Immutable draft first, then optimistic workflow commit. Failed commits
      // can leave an inaccessible orphan, never overwrite an approved version.
      await env.BUCKET.put(draft.key,JSON.stringify({
        version:1,content:action.content,savedAt:now,
      }),{httpMetadata:{contentType:"application/json"}});
    }
    const onlyIf=etag?{etagMatches:etag}:new Headers({"If-None-Match":"*"});
    const committed=await env.BUCKET.put(key,JSON.stringify(next),{
      onlyIf,httpMetadata:{contentType:"application/json"},
    });
    if(!committed)throw new CampaignServiceError("Recap stages changed in another tab. Reload.",409);
    return Response.json({workflow:next,transcript},{headers});
  }catch(e){return failure(e);}
}
