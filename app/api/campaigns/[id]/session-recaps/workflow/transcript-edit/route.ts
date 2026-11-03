import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {recapTranscriptObjectKey,validateRecapCaptionCues,type StoredCaptionCue} from "@/lib/campaigns/recap-full-transcript";
import type {RecordedRecapTranscript} from "@/lib/campaigns/recap-groq-audio";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
function invalid(message:string,status=422){return Response.json({error:message},{status,headers});}
export async function PATCH(request:Request,context:Context){
  try{
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin||
      request.headers.get("sec-fetch-site")==="cross-site")
      return invalid("Open TWE to edit saved transcripts.",403);
    const actor=await getSessionActor(request);
    if(!actor)return invalid("Sign in required.",401);
    const {id}=await context.params;
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return invalid("Only campaign GMs may correct transcripts.",403);
    requireActiveCampaign(access.campaign);
    const body=await readBoundedJson(request,7000) as {
      recapId?:unknown;updatedAt?:unknown;cueIndex?:unknown;
      text?:unknown;startMs?:unknown;endMs?:unknown;
      replaceFrom?:unknown;replaceTo?:unknown;
    };
    const recap=await getCampaignSessionRecap(db,actor,id,body.recapId);
    const key=recapTranscriptObjectKey(access.campaign.publicId,recap.id);
    const object=await env.BUCKET.get(key);
    if(!object)throw new CampaignServiceError("No saved transcript exists.",404);
    const transcript=await object.json<RecordedRecapTranscript>();
    if(transcript.version!==1||!Array.isArray(transcript.cues))
      throw new CampaignServiceError("Unsupported transcript document.",409);
    if(body.updatedAt!==transcript.updatedAt)
      throw new CampaignServiceError("The transcript changed. Reload before editing.",409);
    if(transcript.published)throw new CampaignServiceError(
      "Unpublish the transcript before correcting its public text.",409);
    let cues:StoredCaptionCue[];
    let replacements=0;
    if(typeof body.replaceFrom==="string"&&typeof body.replaceTo==="string"){
      const from=body.replaceFrom.trim(),to=body.replaceTo.trim();
      if(from.length<2||from.length>80||to.length<1||to.length>80||
        /[\u0000-\u001f\u007f]/u.test(from+to))
        throw new CampaignServiceError("Enter a valid name or phrase (2–80 characters).",422);
      const escaped=from.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");
      const pattern=new RegExp("(?<![\\p{L}\\p{N}])"+escaped+"(?![\\p{L}\\p{N}])","giu");
      cues=transcript.cues.map(cue=>{
        const text=cue.text.replace(pattern,()=>{replacements++;return to;});
        return {...cue,text};
      });
      if(!replacements)throw new CampaignServiceError("No matching names were found.",422);
    }else{
      if(!Number.isSafeInteger(body.cueIndex)||Number(body.cueIndex)<0||
        Number(body.cueIndex)>=transcript.cues.length)
        throw new CampaignServiceError("Choose a valid transcript cue.",422);
      const cue=transcript.cues[Number(body.cueIndex)];
      const text=typeof body.text==="string"?body.text.trim():"";
      if(!text||text.length>1500||/[\u0000-\u001f\u007f]/u.test(text))
        throw new CampaignServiceError("Enter a nonempty speech caption under 1500 characters.",422);
      const startMs=Number(body.startMs),endMs=Number(body.endMs);
      if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(endMs)||
        startMs<0||endMs<=startMs||endMs>8*60*60*1000)
        throw new CampaignServiceError("Invalid corrected timestamp.",422);
      cues=transcript.cues.map((entry,index)=>
        index===body.cueIndex?{...cue,startMs,endMs,text}:entry);
    }
    validateRecapCaptionCues(cues);
    const updated:RecordedRecapTranscript={...transcript,cues,
      updatedAt:new Date().toISOString(),published:false};
    const json=JSON.stringify(updated);
    if(json.length>2_000_000)throw new CampaignServiceError("Transcript storage capacity reached.",422);
    const result=await env.BUCKET.put(key,json,{
      onlyIf:{etagMatches:object.etag},
      httpMetadata:{contentType:"application/json"},
    });
    if(!result)throw new CampaignServiceError("Transcript changed in another tab. Reload.",409);
    return Response.json({saved:true,updatedAt:updated.updatedAt,replacements},{headers});
  }catch(e){
    if(e instanceof RequestBodyError)return invalid(e.message,e.status);
    if(e instanceof CampaignServiceError)return campaignErrorResponse(e,"Could not correct transcript.");
    return invalid("Transcript correction could not be saved.",503);
  }
}
