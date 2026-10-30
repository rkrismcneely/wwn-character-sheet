import type { StoredCaptionCue } from "./recap-full-transcript.ts";

export const GROQ_RECAP_MODELS = ["openai/gpt-oss-120b","openai/gpt-oss-20b"] as const;
export const GROQ_RECAP_MODEL = GROQ_RECAP_MODELS[0];
export function selectGroqRecapModel(value:unknown):string {
  if(typeof value!=="string" || !GROQ_RECAP_MODELS.some(model=>model===value))
    throw new Error("Select a supported Groq recap model.");
  return value;
}
export const MAX_RECAP_REQUEST_CHARS = 22000;
export const MAX_RECAP_AI_PARTS = 40;
export type RecapAIPlan = { parts:string[]; totalCharacters:number; requests:number };

/** Partitions an existing, reviewed transcript without silently dropping speech. */
export function planTranscriptRecap(cues: StoredCaptionCue[]): RecapAIPlan {
  if(!Array.isArray(cues)||!cues.length)throw new Error("Import a transcript first.");
  const parts:string[]=[];
  let current="";
  let chars=0;
  for(const cue of cues) {
    const seconds=Math.floor(cue.startMs/1000);
    const timestamp=[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60]
      .map(n=>String(n).padStart(2,"0")).join(":");
    const line="["+timestamp+"] "+cue.speakerName+
      (cue.characterName?" ("+cue.characterName+")":"")+": "+cue.text.replace(/\s+/gu," ").trim()+"\n";
    if(line.length>MAX_RECAP_REQUEST_CHARS)throw new Error("Transcript cue is too large.");
    chars+=line.length;
    if(current && current.length+line.length>MAX_RECAP_REQUEST_CHARS){
      parts.push(current);current="";
    }
    current+=line;
  }
  if(current)parts.push(current);
  if(parts.length>MAX_RECAP_AI_PARTS)throw new Error("Transcript needs more than 40 provider requests. Use shorter source captions or another recap workflow.");
  return {parts,totalCharacters:chars,requests:parts.length+1};
}
export function validateRecapNotes(raw:unknown,expectedCount:number):string[] {
  if(!Array.isArray(raw)||raw.length!==expectedCount || expectedCount<1 || expectedCount>MAX_RECAP_AI_PARTS)
    throw new Error("All transcript sections must be summarized before the final recap.");
  return raw.map(value=>{
    if(typeof value!=="string" || value.trim().length<10 || value.length>3500)
      throw new Error("A section summary is missing or too long.");
    return value.trim();
  });
}
export function boundedGroqResponse(raw:unknown):string {
  if(!raw||typeof raw!=="object")throw new Error("Provider returned an invalid response.");
  const result=raw as {choices?:{message?:{content?:unknown}}[]};
  const value=result.choices?.[0]?.message?.content;
  if(typeof value!=="string"||!value.trim()||value.length>11000)
    throw new Error("Provider returned an empty or oversized answer.");
  return value.trim();
}
