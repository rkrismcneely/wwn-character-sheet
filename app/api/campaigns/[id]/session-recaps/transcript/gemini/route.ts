import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { recapTranscriptObjectKey } from "@/lib/campaigns/recap-full-transcript";
import { mergeGroqAudioTranscript,type RecordedRecapTranscript,type TranscriptionAttribution } from "@/lib/campaigns/recap-groq-audio";
import { GEMINI_TRANSCRIBE_MODEL,MAX_GEMINI_CHUNK_BYTES,normalizeGeminiWords,supportedGeminiAudio } from "@/lib/campaigns/recap-gemini-transcribe";

type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
const errorResponse=(msg:string,status:number)=>Response.json({error:msg},{status,headers});
const int=(x:FormDataEntryValue|null)=>{
  if(typeof x!=="string"||!/^\d{1,9}$/u.test(x))return NaN;
  return Number(x);
};
async function digest(value:BufferSource):Promise<string> {
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",value));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
async function uploadGeminiFile(apiKey:string,file:File,mime:string):Promise<string> {
  const base="https://generativelanguage.googleapis.com";
  const start=await fetch(base+"/upload/v1beta/files",{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
    headers:{"x-goog-api-key":apiKey,"x-goog-upload-protocol":"resumable",
      "x-goog-upload-command":"start",
      "x-goog-upload-header-content-length":String(file.size),
      "x-goog-upload-header-content-type":mime,"content-type":"application/json"},
    body:JSON.stringify({file:{display_name:"TWE session audio clip"}}),
  });
  if(!start.ok)throw new Error(start.status===429?"quota":"upload-start");
  const uploadUrl=start.headers.get("x-goog-upload-url");
  if(!uploadUrl)throw new Error("upload-url");
  const parsed=new URL(uploadUrl);
  // Never forward GM credentials or private audio to arbitrary redirects.
  if(parsed.protocol!=="https:"||parsed.hostname!=="generativelanguage.googleapis.com"||
    !parsed.pathname.startsWith("/upload/"))
    throw new Error("upload-host");
  const response=await fetch(uploadUrl,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),
    headers:{"content-length":String(file.size),"x-goog-upload-offset":"0",
      "x-goog-upload-command":"upload, finalize"},
    body:file,
  });
  if(!response.ok)throw new Error(response.status===429?"quota":"upload-finish");
  const data=await response.json() as {file?:{uri?:unknown}};
  if(typeof data.file?.uri!=="string"||!/^https:\/\//u.test(data.file.uri))
    throw new Error("upload-response");
  return data.file.uri;
}
async function runGemini(apiKey:string,uri:string,mime:string):Promise<unknown> {
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),
    headers:{"x-goog-api-key":apiKey,"content-type":"application/json"},
    body:JSON.stringify({
      model:GEMINI_TRANSCRIBE_MODEL,
      input:[{type:"audio",uri,mime_type:mime}],
      generation_config:{transcription_config:{mode:{type:"verbatim",
        timestamp_granularities:["word"]}}},
    }),
  });
  if(!response.ok)throw new Error(response.status===429?"quota":"interaction");
  const data=await response.text();
  if(data.length>600_000)throw new Error("oversize-result");
  return JSON.parse(data) as unknown;
}
export async function POST(request:Request,context:Context):Promise<Response> {
  try{
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")
      return errorResponse("Start transcription from the TWE recap page.",403);
    const actor=await getSessionActor(request);
    if(!actor)return errorResponse("Sign in required.",401);
    const {id}=await context.params;
    const db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return errorResponse("Only campaign GMs can transcribe.",403);
    requireActiveCampaign(access.campaign);
    const form=await request.formData();
    const recapId=form.get("recapId");
    const recap=await getCampaignSessionRecap(db,actor,id,recapId);
    const audio=form.get("file");
    if(!(audio instanceof File)||audio.size<128||audio.size>MAX_GEMINI_CHUNK_BYTES)
      return errorResponse("Choose a prepared audio clip under 12 MB.",413);
    const mime=supportedGeminiAudio(audio.name);
    const startMs=int(form.get("startMs")),durationMs=int(form.get("durationMs"));
    if(!Number.isSafeInteger(startMs)||!Number.isSafeInteger(durationMs)||durationMs<1000||
      durationMs>30*60*1000||startMs+durationMs>8*60*60*1000)
      return errorResponse("Use an actual clip timestamp and duration of up to 30 minutes.",422);
    if(form.get("approvedShare")!=="true"||form.get("approvedBilling")!=="true")
      return errorResponse("Explicit consent to Gemini data use and personal project billing is required.",422);
    const apiKey=form.get("apiKey");
    if(typeof apiKey!=="string"||!/^[A-Za-z0-9_-]{24,200}$/u.test(apiKey))
      return errorResponse("Enter a personal Google AI Studio API key.",422);
    const speakerId=form.get("speakerId");
    if(typeof speakerId!=="string")return errorResponse("Choose a confirmed speaker.",422);
    let speaker:TranscriptionAttribution;
    if(speakerId==="guest") {
      speaker={rawSpeaker:"Guest",speakerName:"Guest",role:"guest",characterName:null};
    }else{
      if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(speakerId))
        return errorResponse("Choose a saved campaign speaker.",422);
      const row=await db.prepare("SELECT discord_name AS discordName,display_name AS displayName,role,character_name AS characterName "+
        "FROM campaign_recap_speakers WHERE campaign_id=? AND id=?")
        .bind(access.campaign.id,speakerId)
        .first<{discordName:string;displayName:string;role:"gm"|"player"|"guest";characterName:string|null}>();
      if(!row)return errorResponse("Selected speaker is not in the campaign.",409);
      speaker={rawSpeaker:row.discordName,speakerName:row.displayName,role:row.role,characterName:row.characterName};
    }
    const hash=await digest(await audio.arrayBuffer());
    const receipt=await digest(new TextEncoder().encode(
      ["gemini",hash,startMs,durationMs,speakerId,GEMINI_TRANSCRIBE_MODEL].join(":")));
    const key=recapTranscriptObjectKey(access.campaign.id,recap.id);
    async function saved(){
      const object=await env.BUCKET.get(key);
      return object?{item:await object.json<RecordedRecapTranscript>(),etag:object.etag}:
        {item:null,etag:null};
    }
    const prior=await saved();
    if(prior.item?.processedClips?.includes(receipt))
      return Response.json({saved:true,duplicate:true,added:0,total:prior.item.cues.length},{headers});
    let transcription:unknown;
    try{
      const uri=await uploadGeminiFile(apiKey,audio,mime);
      transcription=await runGemini(apiKey,uri,mime);
    }catch(cause){
      const message=cause instanceof Error&&cause.message==="quota"?
        "Google rate limit or quota reached. Processing paused; do not automatically retry paid-capable requests.":
        "Gemini could not finish this clip. Check your project access and quota before manually retrying.";
      return errorResponse(message,503);
    }
    const segments=normalizeGeminiWords(transcription,startMs,durationMs);
    const latest=await saved();
    const appended=mergeGroqAudioTranscript(latest.item,segments,speaker,receipt,new Date().toISOString());
    if(appended.duplicate)
      return Response.json({saved:true,duplicate:true,added:0,total:appended.transcript.cues.length},{headers});
    const serialized=JSON.stringify(appended.transcript);
    if(serialized.length>2_000_000)return errorResponse("Private transcript capacity reached; no dialogue was discarded.",413);
    const onlyIf=latest.etag?{etagMatches:latest.etag}:new Headers({"If-None-Match":"*"});
    const updated=await env.BUCKET.put(key,serialized,{onlyIf,httpMetadata:{contentType:"application/json"}});
    if(!updated)return errorResponse("Another tab changed the transcript. Verify before retrying.",409);
    return Response.json({saved:true,duplicate:false,added:segments.length,
      total:appended.transcript.cues.length,published:false},{headers});
  }catch(cause){
    if(cause instanceof CampaignServiceError)return campaignErrorResponse(cause,"Gemini transcript unavailable.");
    return errorResponse(cause instanceof Error&&/Gemini|caption|word|timestamp|audio|clip|supported/i.test(cause.message)?
      cause.message:"Gemini transcription failed safely.",422);
  }
}
