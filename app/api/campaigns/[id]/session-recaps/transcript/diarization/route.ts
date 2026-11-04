import {env} from "cloudflare:workers";
import {getSessionActor} from "@/lib/auth-session";
import {canManageCampaignContent} from "@/lib/campaigns/authorization";
import {CampaignServiceError,getCampaignD1,loadCampaignAccess,requireActiveCampaign} from "@/lib/campaigns/service";
import {campaignErrorResponse} from "@/lib/campaigns/http";
import {getCampaignSessionRecap} from "@/lib/campaigns/session-recaps";
import {recapTranscriptObjectKey,validateRecapCaptionCues,type StoredCaptionCue} from "@/lib/campaigns/recap-full-transcript";
import {alignSherpaTurns,type SherpaTurn} from "@/lib/campaigns/recap-sherpa-alignment";
import type {RecordedRecapTranscript} from "@/lib/campaigns/recap-groq-audio";
import {readBoundedJson,RequestBodyError} from "@/lib/http-json";
type Context={params:Promise<{id:string}>};
const headers={"cache-control":"private, no-store"};
function invalid(message:string,status=422){return Response.json({error:message},{status,headers});}
/** Accepts timestamps and numbered clusters only; the audio stays in the GM's browser. */
export async function PATCH(request:Request,context:Context){
  try{
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin||
      request.headers.get("sec-fetch-site")==="cross-site")
      return invalid("Open TWE to review local speakers.",403);
    const actor=await getSessionActor(request);
    if(!actor)return invalid("Sign in required.",401);
    const {id}=await context.params,db=await getCampaignD1();
    const access=await loadCampaignAccess(db,actor,id);
    if(!canManageCampaignContent(actor,access.campaign,access.membership))
      return invalid("Only campaign GMs may label the transcript.",403);
    requireActiveCampaign(access.campaign);
    const body=await readBoundedJson(request,160_000) as {
      recapId?:unknown;updatedAt?:unknown;partIndex?:unknown;
      startMs?:unknown;endMs?:unknown;turns?:unknown;
    };
    if(!Number.isSafeInteger(body.partIndex)||Number(body.partIndex)<0||
      Number(body.partIndex)>63||!Number.isSafeInteger(body.startMs)||
      !Number.isSafeInteger(body.endMs)||Number(body.startMs)<0||
      Number(body.endMs)<=Number(body.startMs)||
      Number(body.endMs)>8*60*60*1000)
      throw new CampaignServiceError("Invalid diarization section.",422);
    if(!Array.isArray(body.turns)||body.turns.length===0||body.turns.length>2000)
      throw new CampaignServiceError("Diarization returned no valid speaker turns.",422);
    const turns=body.turns as SherpaTurn[];
    const durationSec=(Number(body.endMs)-Number(body.startMs))/1000;
    if(turns.some(turn=>!turn||typeof turn!=="object"||
      !Number.isFinite(turn.start)||!Number.isFinite(turn.end)||
      turn.start<0||turn.end>durationSec+0.5))
      throw new CampaignServiceError("Speaker turns exceed the prepared audio section.",422);
    const recap=await getCampaignSessionRecap(db,actor,id,body.recapId);
    const key=recapTranscriptObjectKey(access.campaign.publicId,recap.id);
    const object=await env.BUCKET.get(key);
    if(!object)throw new CampaignServiceError("Transcribe with Whisper before identifying voices.",404);
    const transcript=await object.json<RecordedRecapTranscript>();
    if(transcript.version!==1||!Array.isArray(transcript.cues))
      throw new CampaignServiceError("Unsupported transcript document.",409);
    if(body.updatedAt!==transcript.updatedAt)
      throw new CampaignServiceError("Transcript changed; reload before saving speaker labels.",409);
    if(transcript.published)
      throw new CampaignServiceError("Unpublish the transcript before applying speaker labels.",409);
    const targets=transcript.cues.filter(cue=>
      cue.startMs>=Number(body.startMs)&&cue.endMs<=Number(body.endMs)&&
      (cue.speakerName===cue.rawSpeaker||cue.rawSpeaker==="Local Whisper")&&
      (cue.rawSpeaker==="Local Whisper"||cue.rawSpeaker==="Guest"||
        cue.rawSpeaker==="Unidentified speaker"||/^Speaker [0-9]+(?: · section [0-9]+)?$/u.test(cue.rawSpeaker)));
    if(!targets.length)throw new CampaignServiceError(
      "No eligible Whisper captions overlap this section. Existing confirmed speakers were preserved.",422);
    const aligned=alignSherpaTurns(targets,turns,Number(body.startMs));
    const replacements=new Map(targets.map((cue,i)=>[
      cue,
      aligned.cues[i].rawSpeaker==="Unidentified speaker"?
        "Unidentified speaker":aligned.cues[i].rawSpeaker+" · section "+(Number(body.partIndex)+1),
    ]));
    let changed=0;
    const cues:StoredCaptionCue[]=transcript.cues.map(cue=>{
      const label=replacements.get(cue);
      if(label===undefined)return cue;
      changed++;
      return {...cue,rawSpeaker:label,speakerName:label,
        role:"guest",characterName:null};
    });
    validateRecapCaptionCues(cues);
    const updated:RecordedRecapTranscript={...transcript,cues,
      updatedAt:new Date().toISOString(),published:false};
    const json=JSON.stringify(updated);
    if(new TextEncoder().encode(json).byteLength>2_000_000)
      throw new CampaignServiceError("Private transcript is full.",422);
    const result=await env.BUCKET.put(key,json,{
      onlyIf:{etagMatches:object.etag},
      httpMetadata:{contentType:"application/json"},
    });
    if(!result)throw new CampaignServiceError("Transcript changed in another tab; reload.",409);
    return Response.json({saved:true,updatedAt:updated.updatedAt,changed,
      uncertain:aligned.uncertain,speakers:aligned.speakerLabels.length},{headers});
  }catch(error){
    if(error instanceof RequestBodyError)return invalid(error.message,error.status);
    if(error instanceof CampaignServiceError)return campaignErrorResponse(error,"Could not save diarization.");
    return invalid("Local speaker labels could not be saved.",503);
  }
}
