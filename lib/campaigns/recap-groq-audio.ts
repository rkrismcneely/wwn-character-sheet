import {
  validateRecapCaptionCues, type CaptionCue, type SavedRecapTranscript, type StoredCaptionCue,
} from "./recap-full-transcript.ts";

export const GROQ_AUDIO_MODELS=["whisper-large-v3-turbo","whisper-large-v3"] as const;
export const MAX_GROQ_AUDIO_BYTES=16*1024*1024; // Below Groq free upload cap, with multipart headroom
export const MAX_GROQ_AUDIO_SECONDS=30*60;
export const MAX_GROQ_CLIP_RECEIPTS=512;
export type GroqAudioSegment = { start?:unknown;end?:unknown;text?:unknown };
export type TranscriptionAttribution = {
  rawSpeaker:string;speakerName:string;role:"gm"|"player"|"guest";characterName:string|null;
};
export type RecordedRecapTranscript = SavedRecapTranscript & { processedClips?: string[] };

export function validateAudioClipOptions(input:{
  model:unknown;startMs:unknown;durationMs:unknown;filename:unknown;byteSize:unknown;
}) {
  if(!GROQ_AUDIO_MODELS.includes(input.model as typeof GROQ_AUDIO_MODELS[number]))
    throw new Error("Choose a supported Groq Whisper model.");
  if(!Number.isSafeInteger(input.startMs)|| (input.startMs as number)<0 ||
    (input.startMs as number)>8*60*60*1000)
    throw new Error("Enter a valid session-relative clip start.");
  if(!Number.isSafeInteger(input.durationMs) || (input.durationMs as number)<1000 ||
    (input.durationMs as number)>MAX_GROQ_AUDIO_SECONDS*1000 ||
    (input.startMs as number)+(input.durationMs as number)>8*60*60*1000)
    throw new Error("Use an audio clip lasting 1 second to 30 minutes within the session timeline.");
  if(typeof input.filename!=="string" ||
    !/^[^\\/\u0000-\u001f]{1,160}\.(flac|mp3|mp4|m4a|mpeg|mpga|ogg|wav|webm)$/iu.test(input.filename))
    throw new Error("Choose a supported audio clip (FLAC, MP3, M4A, WAV, OGG or WebM).");
  if(!Number.isSafeInteger(input.byteSize) || (input.byteSize as number)<128 ||
    (input.byteSize as number)>MAX_GROQ_AUDIO_BYTES)
    throw new Error("Clip must be smaller than 16 MB for reliable free-tier upload.");
  return {model:input.model as typeof GROQ_AUDIO_MODELS[number],
    startMs:input.startMs as number,durationMs:input.durationMs as number,
    filename:input.filename as string,byteSize:input.byteSize as number};
}

/** Returns exact session-relative timestamps; no fabricated timing from text alone. */
export function normalizeGroqAudioSegments(raw:unknown,clipStartMs:number,clipDurationMs:number):CaptionCue[] {
  if(!Array.isArray(raw)||raw.length===0||raw.length>1500)
    throw new Error("Groq returned no valid timed segments, or too many.");
  const out:CaptionCue[]=[];
  for(const entry of raw as GroqAudioSegment[]){
    if(!entry||typeof entry!=="object"||
      typeof entry.start!=="number"||typeof entry.end!=="number"||
      !Number.isFinite(entry.start)||!Number.isFinite(entry.end))
      throw new Error("Groq returned an invalid segment timestamp.");
    const start=Math.round(entry.start*1000),end=Math.round(entry.end*1000);
    if(start<0||end<=start||end>clipDurationMs+2000)
      throw new Error("Groq timestamps do not fit inside the submitted clip.");
    const text=typeof entry.text==="string"?entry.text.trim():"";
    if(!text||text.length>1500)
      throw new Error("Groq returned invalid spoken text.");
    out.push({startMs:clipStartMs+start,endMs:clipStartMs+Math.min(end,clipDurationMs),
      rawSpeaker:"",text});
  }
  // Some Whisper end timestamps may be rounded a little past the duration.
  if(out.some(item=>item.endMs<=item.startMs))throw new Error("Invalid final audio segment.");
  return out;
}

export function mergeGroqAudioTranscript(
  existing:RecordedRecapTranscript|null,
  incoming:CaptionCue[],
  attribution:TranscriptionAttribution,
  receipt:string,
  updatedAt:string,
):{transcript:RecordedRecapTranscript;duplicate:boolean} {
  if(!/^[a-f0-9]{64}$/u.test(receipt))throw new Error("Invalid clip receipt.");
  if(existing && (existing.version!==1||!Array.isArray(existing.cues)))
    throw new Error("Unrecognized transcript version.");
  const receipts=existing?.processedClips??[];
  if(!Array.isArray(receipts)||receipts.length>MAX_GROQ_CLIP_RECEIPTS)
    throw new Error("Transcript has invalid clip history.");
  if(receipts.includes(receipt))return {transcript:existing!,duplicate:true};
  if(receipts.length>=MAX_GROQ_CLIP_RECEIPTS)
    throw new Error("Too many clips. Create a separate session recap.");
  if(!attribution.rawSpeaker||!attribution.speakerName)throw new Error("Confirm this clip's speaker.");
  const more:StoredCaptionCue[]=incoming.map(cue=>({...cue,...attribution}));
  const all:StoredCaptionCue[]=[...(existing?.cues??[]),...more]
    .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
  // Revalidate ALL entries and preserve their speaker snapshots; do not silently truncate.
  if(all.length>0)validateRecapCaptionCues(all);
  return {transcript:{version:1,published:false,cues:all,updatedAt,
    processedClips:[...receipts,receipt]},duplicate:false};
}
