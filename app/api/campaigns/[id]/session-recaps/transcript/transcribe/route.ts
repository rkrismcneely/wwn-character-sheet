import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError, getCampaignD1, loadCampaignAccess, requireActiveCampaign } from "@/lib/campaigns/service";
import { recapTranscriptObjectKey } from "@/lib/campaigns/recap-full-transcript";
import type { RecordedRecapTranscript,TranscriptionAttribution } from "@/lib/campaigns/recap-groq-audio";
import {
  MAX_GROQ_AUDIO_BYTES,validateAudioClipOptions,normalizeGroqAudioSegments,mergeGroqAudioTranscript,
} from "@/lib/campaigns/recap-groq-audio";

type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
const reply=(message:string,status:number)=>Response.json({error:message},{status,headers});
function requiredString(form:FormData,key:string):string {
  const value=form.get(key);
  if(typeof value!=="string")throw new CampaignServiceError("Missing transcription parameter: "+key,422);
  return value;
}
function asSafeInteger(raw:string):number {
  if(!/^\d{1,9}$/u.test(raw))return NaN;
  return Number(raw);
}
function hex(buffer:ArrayBuffer):string {
  return Array.from(new Uint8Array(buffer),value=>value.toString(16).padStart(2,"0")).join("");
}
async function previousTranscript(key:string) {
  const object=await env.BUCKET.get(key);
  if(!object)return {transcript:null as RecordedRecapTranscript|null,etag:null as string|null};
  const transcript=await object.json<RecordedRecapTranscript>();
  if(transcript.version!==1 || !Array.isArray(transcript.cues))
    throw new CampaignServiceError("Existing transcript version is unsupported.",409);
  return {transcript,etag:object.etag};
}

export async function POST(request:Request,context:Context):Promise<Response> {
  try {
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin ||
      request.headers.get("sec-fetch-site")==="cross-site")
      return reply("Transcription must be started from the TWE site.",403);
    const bytesHeader=request.headers.get("content-length");
    if(bytesHeader && (!/^\d+$/u.test(bytesHeader) ||
      Number(bytesHeader)>MAX_GROQ_AUDIO_BYTES+16_384))
      return reply("Audio clip exceeds the 16 MB upload limit.",413);
    const actor=await getSessionActor(request);
    if(!actor)return reply("Sign in required.",401);
    const {id}=await context.params;
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return reply("Only campaign GMs can run transcription.",403);
    requireActiveCampaign(access.campaign);
    const form=await request.formData();
    const recapId=requiredString(form,"recapId");
    const recap=await getCampaignSessionRecap(db,actor,id,recapId);
    const file=form.get("file");
    if(!(file instanceof File))return reply("Choose a prepared audio clip.",422);
    const input=validateAudioClipOptions({
      filename:file.name,byteSize:file.size,
      model:requiredString(form,"model"),
      startMs:asSafeInteger(requiredString(form,"startMs")),
      durationMs:asSafeInteger(requiredString(form,"durationMs")),
    });
    if(requiredString(form,"approvedShare")!=="true" ||
      requiredString(form,"approvedBilling")!=="true")
      return reply("Confirm external audio sharing and your own provider charges.",422);
    const apiKey=requiredString(form,"apiKey");
    if(!/^gsk_[A-Za-z0-9_-]{16,180}$/u.test(apiKey))
      return reply("Enter a valid personal Groq API key.",422);
    const speakerId=requiredString(form,"speakerId");
    let speaker:TranscriptionAttribution;
    if(speakerId==="guest"){
      speaker={rawSpeaker:"Guest",speakerName:"Guest",role:"guest",characterName:null};
    }else {
      if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(speakerId))
        return reply("Select a saved campaign speaker or Guest.",422);
      const row=await db.prepare("SELECT discord_name AS discordName, display_name AS displayName, "+
        "role, character_name AS characterName FROM campaign_recap_speakers WHERE campaign_id=? AND id=?")
        .bind(access.campaign.id,speakerId)
        .first<{discordName:string;displayName:string;role:"gm"|"player"|"guest";characterName:string|null}>();
      if(!row)return reply("The selected speaker is not in this campaign.",409);
      speaker={rawSpeaker:row.discordName,speakerName:row.displayName,
        role:row.role,characterName:row.characterName};
    }
    // The media digest plus timestamp and association determines exact retry identity.
    const fileBytes=await file.arrayBuffer();
    const audioHash=hex(await crypto.subtle.digest("SHA-256",fileBytes));
    const receipt=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(
      [audioHash,input.startMs,input.durationMs,input.model,speakerId].join(":"))));
    const key=recapTranscriptObjectKey(access.campaign.id,recap.id);
    const before=await previousTranscript(key);
    if(before.transcript?.processedClips?.includes(receipt))
      return Response.json({saved:true,duplicate:true,added:0,
        total:before.transcript.cues.length,notice:"This exact audio clip was already transcribed."},{headers});
    const upload=new FormData();
    upload.set("file",new Blob([fileBytes],{type:file.type||"application/octet-stream"}),input.filename);
    upload.set("model",input.model);
    upload.set("response_format","verbose_json");
    upload.append("timestamp_granularities[]","segment");
    const language=form.get("language");
    if(language==="en")upload.set("language","en");
    let provider:Response;
    try {
      provider=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{
        method:"POST",headers:{"authorization":"Bearer "+apiKey},
        body:upload,redirect:"error",signal:AbortSignal.timeout(45000),
      });
    }catch{
      return reply("Groq timed out or could not be reached. Check your account before manually retrying; the request may have consumed quota.",503);
    }
    if(!provider.ok){
      if(provider.status===429)return reply("Your Groq transcription quota or rate limit was reached. Processing paused.",429);
      if(provider.status===401||provider.status===403)
        return reply("Your personal Groq key was rejected or lacks transcription access.",403);
      return reply("Groq rejected this clip. Check its audio format, length and your account.",502);
    }
    const raw=await provider.text();
    if(raw.length>320_000)return reply("Groq response is too large for one clip.",502);
    let data:unknown;
    try{data=JSON.parse(raw);}catch{return reply("Groq returned invalid transcript JSON.",502);}
    const responseData=data as {segments?:unknown;text?:unknown};
    // A genuinely empty timestamped transcription is a completed silent clip,
    // not permission to fabricate dialogue or rerun the charged request.
    const silent=Array.isArray(responseData.segments)&&responseData.segments.length===0&&
      typeof responseData.text==="string"&&!responseData.text.trim();
    const segments=silent?[]:normalizeGroqAudioSegments(responseData.segments,input.startMs,input.durationMs);
    // Re-read AFTER the external request. Conditional R2 write protects against
    // two clients overwriting another clip or changing publication state.
    const latest=await previousTranscript(key);
    const appended=mergeGroqAudioTranscript(latest.transcript,segments,speaker,receipt,new Date().toISOString());
    if(appended.duplicate)
      return Response.json({saved:true,duplicate:true,added:0,total:appended.transcript.cues.length},{headers});
    const json=JSON.stringify(appended.transcript);
    if(new TextEncoder().encode(json).byteLength>2_000_000)
      return reply("Transcript storage is full. No dialogue was discarded.",413);
    const onlyIf=latest.etag ? {etagMatches:latest.etag} : new Headers({"If-None-Match":"*"});
    const stored=await env.BUCKET.put(key,json,{
      onlyIf,httpMetadata:{contentType:"application/json"},
    });
    if(!stored)return reply("Transcript was updated in another tab. Reload and verify before retrying. Groq may have charged for this clip.",409);
    return Response.json({saved:true,duplicate:false,added:segments.length,silent,total:appended.transcript.cues.length,
      published:false,notice:"Saved to private GM draft. Review and publish separately."},{headers});
  }catch(error){
    if(error instanceof CampaignServiceError)return campaignErrorResponse(error,"Transcription unavailable.");
    if(error instanceof Error && /Clip|audio|transcript|segment|Groq|speaker|timestamp|supported|Too many|Invalid/i.test(error.message))
      return reply(error.message,422);
    return campaignErrorResponse(error,"Transcription could not be completed.");
  }
}
