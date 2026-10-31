import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignSessionRecap } from "@/lib/campaigns/session-recaps";
import { CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign } from "@/lib/campaigns/service";
import { recapTranscriptObjectKey,validateRecapCaptionCues,type CaptionCue } from "@/lib/campaigns/recap-full-transcript";
import { mergeGroqAudioTranscript,type RecordedRecapTranscript,type TranscriptionAttribution } from "@/lib/campaigns/recap-groq-audio";
import { readBoundedJson,RequestBodyError } from "@/lib/http-json";

type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
async function scope(request:Request,context:Context,recapId:unknown){
  const actor=await getSessionActor(request);
  if(!actor)throw new CampaignServiceError("Sign in required.",401);
  const {id}=await context.params;
  const db=await getCampaignD1();
  const access=await loadCampaignAccess(db,actor,id);
  if(!canManageCampaignContent(actor,access.campaign,access.membership))
    throw new CampaignServiceError("Only GMs can save local transcript segments.",403);
  requireActiveCampaign(access.campaign);
  const recap=await getCampaignSessionRecap(db,actor,id,recapId);
  return {db,key:recapTranscriptObjectKey(access.campaign.id,recap.id),campaignId:access.campaign.id};
}
async function snapshot(key:string){
  const object=await env.BUCKET.get(key);
  if(!object)return {document:null as RecordedRecapTranscript|null,etag:null as string|null};
  const document=await object.json<RecordedRecapTranscript>();
  if(document.version!==1||!Array.isArray(document.cues))throw new CampaignServiceError("Transcript version unsupported.",409);
  return {document,etag:object.etag};
}
const fail=(error:unknown)=>{
  if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status,headers});
  return campaignErrorResponse(error,"Local transcript unavailable.");
};
export async function GET(request:Request,context:Context){
  try {
    const url=new URL(request.url);
    const receipt=url.searchParams.get("receipt");
    if(!receipt||!/^[a-f0-9]{64}$/u.test(receipt))
      throw new CampaignServiceError("Invalid audio checkpoint.",422);
    const {key}=await scope(request,context,url.searchParams.get("recapId"));
    const existing=await snapshot(key);
    return Response.json({complete:Boolean(existing.document?.processedClips?.includes(receipt))},{headers});
  }catch(error){return fail(error);}
}
export async function POST(request:Request,context:Context){
  try {
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin||request.headers.get("sec-fetch-site")==="cross-site")
      throw new CampaignServiceError("Open the recap in TWE to save local transcription.",403);
    const body=await readBoundedJson(request,210_000) as {
      recapId?:unknown;receipt?:unknown;speakerId?:unknown;cues?:unknown;
      approved?:unknown;
    };
    if(body.approved!==true)throw new CampaignServiceError("Confirm this local transcript is ready to save privately.",422);
    if(typeof body.receipt!=="string"||!/^[a-f0-9]{64}$/u.test(body.receipt))
      throw new CampaignServiceError("Invalid audio clip checkpoint.",422);
    const {db,key,campaignId}=await scope(request,context,body.recapId);
    const raw:Array<CaptionCue>=Array.isArray(body.cues)&&body.cues.length===0?[]:validateRecapCaptionCues(body.cues);
    if(raw.length>1000)throw new CampaignServiceError("Save at most 1000 timed cues per local audio chunk.",422);
    const speakerId=body.speakerId;
    let speaker:TranscriptionAttribution;
    if(speakerId==="guest"){
      speaker={rawSpeaker:"Guest",speakerName:"Guest",role:"guest",characterName:null};
    }else{
      if(typeof speakerId!=="string"||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(speakerId))
        throw new CampaignServiceError("Choose a campaign speaker.",422);
      const row=await db.prepare("SELECT discord_name AS discordName,display_name AS displayName,role,character_name AS characterName "+
        "FROM campaign_recap_speakers WHERE campaign_id=? AND id=?")
        .bind(campaignId,speakerId).first<{discordName:string;displayName:string;role:"gm"|"player"|"guest";characterName:string|null}>();
      if(!row)throw new CampaignServiceError("Speaker no longer belongs to the campaign.",409);
      speaker={rawSpeaker:row.discordName,speakerName:row.displayName,role:row.role,characterName:row.characterName};
    }
    const latest=await snapshot(key);
    const merged=mergeGroqAudioTranscript(latest.document,raw,speaker,body.receipt,new Date().toISOString());
    if(merged.duplicate)return Response.json({saved:true,duplicate:true,total:merged.transcript.cues.length},{headers});
    const data=JSON.stringify(merged.transcript);
    if(new TextEncoder().encode(data).length>2_000_000)
      throw new CampaignServiceError("Private transcript is full; no cues were discarded.",422);
    const onlyIf=latest.etag?{etagMatches:latest.etag}:new Headers({"If-None-Match":"*"});
    const written=await env.BUCKET.put(key,data,{onlyIf,httpMetadata:{contentType:"application/json"}});
    if(!written)throw new CampaignServiceError("Another tab changed this transcript; reload to resume safely.",409);
    return Response.json({saved:true,duplicate:false,total:merged.transcript.cues.length,
      published:false},{headers});
  }catch(error){return fail(error);}
}
