import {MAX_RECAP_TRANSCRIPT_CUES,MAX_RECAP_TRANSCRIPT_TEXT,
  validateRecapCaptionCues,type StoredCaptionCue } from "./recap-full-transcript.ts";
import type { RecordedRecapTranscript } from "./recap-groq-audio.ts";

export const GEMINI_ASSEMBLY_BATCH_SIZE=4;
export const GEMINI_ASSEMBLY_MAX_BYTES=2_000_000;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const CAMPAIGN=/^cmp_[A-Za-z0-9_-]{22}$/u;
export type GeminiFragment={version:1;provider:"gemini";jobId:string;recapId:string;
  trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
  speaker:{index:number;discordName:string;displayName:string;
    role:"gm"|"player"|"guest";characterName:string|null};
  cues:{startMs:number;endMs:number;rawSpeaker:string;text:string}[];
};
export type GeminiAssemblyDraft=RecordedRecapTranscript&{
  jobId:string;recapId:string;fragmentsProcessed:number;totalFragments:number;
};
export type GeminiFragmentIdentity={jobId:string;recapId:string;
  trackIndex:number;chunkIndex:number;startMs:number;endMs:number};
export function geminiAssemblyObjectKey(campaignId:string,jobId:string):string {
  if(!CAMPAIGN.test(campaignId)||!UUID.test(jobId))throw new Error("Invalid assembly location.");
  return "recap-gemini-assembled/"+campaignId+"/"+jobId+".json";
}
export function geminiFragmentObjectKey(campaignId:string,jobId:string,
  trackIndex:number,chunkIndex:number):string {
  if(!CAMPAIGN.test(campaignId)||!UUID.test(jobId)||!Number.isSafeInteger(trackIndex)||
    trackIndex<0||trackIndex>127||!Number.isSafeInteger(chunkIndex)||chunkIndex<0||chunkIndex>=512)
    throw new Error("Invalid Gemini fragment location.");
  return "recap-transcript-chunks/"+campaignId+"/"+jobId+"/"+trackIndex+"-"+chunkIndex+".json";
}
function string(raw:unknown,limit:number):string {
  if(typeof raw!=="string"||!raw.trim()||raw.trim().length>limit||
    /[\u0000-\u001f\u007f]/u.test(raw))throw new Error("Invalid Gemini speaker metadata.");
  return raw.trim();
}
export function validateGeminiFragment(raw:unknown,identity:GeminiFragmentIdentity):StoredCaptionCue[]{
  if(!raw||typeof raw!=="object")throw new Error("Gemini fragment missing.");
  const row=raw as Partial<GeminiFragment>;
  if(row.version!==1||row.provider!=="gemini"||row.jobId!==identity.jobId||
    row.recapId!==identity.recapId||row.trackIndex!==identity.trackIndex||
    row.chunkIndex!==identity.chunkIndex||row.startMs!==identity.startMs||
    row.endMs!==identity.endMs||!Array.isArray(row.cues)||
    row.cues.length>1500||!row.speaker||typeof row.speaker!=="object")
    throw new Error("Gemini fragment has mismatched provenance.");
  const speaker=row.speaker;
  const rawSpeaker=string(speaker.discordName,80);
  const speakerName=string(speaker.displayName,80);
  if(speaker.index!==identity.trackIndex||
    !["gm","player","guest"].includes(speaker.role)||
    (speaker.characterName!==null &&
      (typeof speaker.characterName!=="string"||speaker.characterName.length>80)))
    throw new Error("Gemini fragment speaker assignment is invalid.");
  if(row.cues.length===0)return [];
  const cues=validateRecapCaptionCues(row.cues);
  for(const cue of cues){
    if(cue.rawSpeaker!==rawSpeaker||cue.startMs<identity.startMs||
      cue.endMs>identity.endMs+1000)
      throw new Error("Gemini dialogue timing or speaker does not match its clip.");
  }
  return cues.map(cue=>({...cue,speakerName,role:speaker.role,
    characterName:speaker.characterName}));
}
export function appendGeminiAssemblyDraft(existing:GeminiAssemblyDraft|null,
  identity:{jobId:string;recapId:string;totalChunks:number},batch:readonly {
    identity:GeminiFragmentIdentity;fragment:unknown;
  }[],now:string):GeminiAssemblyDraft {
  if(!UUID.test(identity.jobId)||!UUID.test(identity.recapId)||
    !Number.isSafeInteger(identity.totalChunks)||identity.totalChunks<1||
    identity.totalChunks>512)throw new Error("Invalid Gemini assembly job.");
  if(existing&&(existing.version!==1||existing.published!==false||
    existing.jobId!==identity.jobId||existing.recapId!==identity.recapId||
    existing.totalFragments!==identity.totalChunks||
    !Array.isArray(existing.cues)||!Number.isSafeInteger(existing.fragmentsProcessed)||
    existing.fragmentsProcessed<0||existing.fragmentsProcessed>identity.totalChunks))
    throw new Error("Existing assembled draft is not safe to resume.");
  if(batch.length<1||batch.length>GEMINI_ASSEMBLY_BATCH_SIZE)
    throw new Error("Use a bounded fragment assembly batch.");
  if((existing?.fragmentsProcessed??0)+batch.length>identity.totalChunks)
    throw new Error("Assembly would exceed its verified chunk count.");
  const more=batch.flatMap(({identity:part,fragment})=>{
    if(part.jobId!==identity.jobId||part.recapId!==identity.recapId)
      throw new Error("Gemini assembly fragment belongs to another job.");
    return validateGeminiFragment(fragment,part);
  });
  const merged=[...(existing?.cues??[]),...more].sort((a,b)=>
    a.startMs-b.startMs||a.endMs-b.endMs||a.rawSpeaker.localeCompare(b.rawSpeaker));
  if(merged.length>MAX_RECAP_TRANSCRIPT_CUES)
    throw new Error("Gemini transcript exceeds caption limits; no dialogue was discarded.");
  let characters=0;const speakers=new Set<string>();
  for(const cue of merged){
    characters+=cue.text.length;
    speakers.add(cue.rawSpeaker);
    if(speakers.size>32||characters>MAX_RECAP_TRANSCRIPT_TEXT)
      throw new Error("Gemini transcript exceeds speech or speaker limits.");
  }
  const result:GeminiAssemblyDraft={
    version:1,published:false,updatedAt:now,cues:merged,
    jobId:identity.jobId,recapId:identity.recapId,
    totalFragments:identity.totalChunks,
    fragmentsProcessed:(existing?.fragmentsProcessed??0)+batch.length,
  };
  if(new TextEncoder().encode(JSON.stringify(result)).length>GEMINI_ASSEMBLY_MAX_BYTES)
    throw new Error("Gemini transcript exceeds private draft storage limit.");
  return result;
}
export function validateCompleteGeminiAssembly(draft:GeminiAssemblyDraft,
  jobId:string,recapId:string,total:number):GeminiAssemblyDraft{
  if(draft.version!==1||draft.published!==false||draft.jobId!==jobId||
    draft.recapId!==recapId||draft.totalFragments!==total||
    draft.fragmentsProcessed!==total||total<1||!Array.isArray(draft.cues))
    throw new Error("Gemini transcription has not finished assembling.");
  if(draft.cues.length===0)throw new Error("No speech was detected in this session.");
  validateRecapCaptionCues(draft.cues);
  return draft;
}
