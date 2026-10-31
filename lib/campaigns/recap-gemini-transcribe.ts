import type { CaptionCue } from "./recap-full-transcript.ts";

/** Gemini 3.5 Transcribe Interactions API, documented word-info annotations. */
export const GEMINI_TRANSCRIBE_MODEL="gemini-3.5-transcribe";
export const MAX_GEMINI_CHUNK_BYTES=12*1024*1024;
type Word={type?:unknown;text?:unknown;start_offset?:unknown;end_offset?:unknown;speaker?:unknown};
type Step={type?:unknown;content?:{type?:unknown;text?:unknown;annotations?:Word[]}[]};
export type GeminiInteraction={status?:unknown;steps?:Step[];output_text?:unknown};

export function geminiWordTime(raw:unknown):number {
  if(typeof raw!=="string" || !/^\d+(?:\.\d{1,3})?s$/u.test(raw))
    throw new Error("Gemini did not return a valid word timestamp.");
  const value=Math.round(Number(raw.slice(0,-1))*1000);
  if(!Number.isSafeInteger(value)||value<0)return NaN;
  return value;
}
export function normalizeGeminiWords(raw:unknown,offsetMs:number,durationMs:number):CaptionCue[] {
  if(!raw||typeof raw!=="object")throw new Error("Gemini returned invalid transcription data.");
  const response=raw as GeminiInteraction;
  if(response.status!=="completed"||!Array.isArray(response.steps))
    throw new Error("Gemini transcription is not complete.");
  const words:Word[]=[];
  for(const step of response.steps) {
    if(step.type!=="model_output")continue;
    for(const part of step.content??[])if(part.type==="text"&&Array.isArray(part.annotations))
      words.push(...part.annotations.filter(annotation=>annotation.type==="word_info"));
  }
  if(words.length>20_000)throw new Error("Gemini returned too many words for one clip.");
  if(words.length===0) {
    if(response.output_text==="")return [];
    throw new Error("Gemini did not return timestamped words; the transcript was not changed.");
  }
  const cues:CaptionCue[]=[];
  let start=-1,end=0,phrase="";
  function flush(){
    if(start<0||!phrase.trim())return;
    cues.push({startMs:offsetMs+start,endMs:offsetMs+end,
      rawSpeaker:"",text:phrase.trim()});
    start=-1;end=0;phrase="";
  }
  for(const word of words){
    const first=geminiWordTime(word.start_offset),last=geminiWordTime(word.end_offset);
    const text=typeof word.text==="string"?word.text.trim():"";
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last<=first||
      first<0||last>durationMs+1000||!text||text.length>80)
      throw new Error("Gemini returned unsupported word timings or text.");
    if(phrase && (first-end>1000 || last-start>15_000 || phrase.length+text.length>1100))flush();
    if(start<0)start=first;
    end=Math.min(last,durationMs);
    if(end<=start)throw new Error("Gemini returned out-of-range timestamps.");
    phrase+= (phrase?" ":"")+text;
  }
  flush();
  return cues;
}
export function supportedGeminiAudio(name:string):string {
  if(/\.wav$/iu.test(name))return "audio/wav";
  if(/\.flac$/iu.test(name))return "audio/flac";
  if(/\.m4a$/iu.test(name))return "audio/m4a";
  if(/\.aac$/iu.test(name))return "audio/aac";
  if(/\.mp3$/iu.test(name))return "audio/mpeg";
  if(/\.ogg$/iu.test(name))return "audio/ogg";
  if(/\.webm$/iu.test(name))return "audio/webm";
  throw new Error("Select a supported Gemini audio file.");
}
