import type { CaptionCue } from "./recap-full-transcript.ts";

/** Gemini 3.5 Transcribe Interactions API, documented word-info annotations. */
export const GEMINI_TRANSCRIBE_MODEL="gemini-3.5-transcribe";
export const MAX_GEMINI_CHUNK_BYTES=12*1024*1024;
type Word={type?:unknown;text?:unknown;start_offset?:unknown;end_offset?:unknown;speaker?:unknown};
type Step={type?:unknown;content?:{type?:unknown;text?:unknown;annotations?:Word[]}[]};
export type GeminiInteraction={status?:unknown;steps?:Step[];output_text?:unknown};

export function geminiWordTime(raw:unknown):number {
  // Google's protobuf Duration permits up to nine fractional digits; their
  // transcription examples vary in precision rather than always using 3.
  if(typeof raw!=="string" || !/^\d+(?:\.\d{1,9})?s$/u.test(raw))
    throw new Error("Gemini did not return a valid word timestamp.");
  const value=Math.round(Number(raw.slice(0,-1))*1000);
  if(!Number.isSafeInteger(value)||value<0)return NaN;
  return value;
}
/** Preserve full recognized speech even when individual Gemini annotations
 * contain unusable offsets. Section-range labels do not claim word precision.
 */
function sectionTextCues(raw:string,offsetMs:number,durationMs:number):CaptionCue[]{
  const text=raw.trim().replace(/[\u0000-\u001f\u007f]/gu," ");
  if(!text||text.length>120_000)throw new Error("Gemini returned invalid transcript text.");
  const result:CaptionCue[]=[];
  const label="[Section-level timing only; word timestamps unavailable] ";
  const max=1400-label.length;
  let remaining=text;
  while(remaining){
    let cut=Math.min(max,remaining.length);
    if(cut<remaining.length){
      const space=remaining.lastIndexOf(" ",cut);
      if(space>cut/2)cut=space;
    }
    const portion=remaining.slice(0,cut).trim();
    if(portion)result.push({startMs:offsetMs,endMs:offsetMs+durationMs,
      rawSpeaker:"",text:label+portion});
    remaining=remaining.slice(cut).trimStart();
  }
  return result;
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
  const completeText=typeof response.output_text==="string"?response.output_text:"";
  if(words.length===0) {
    if(response.output_text==="")return []; // Explicitly confirmed silence.
    if(completeText.trim())return sectionTextCues(completeText,offsetMs,durationMs);
    throw new Error("Gemini did not return timestamped words or full transcript text. The provider response is saved for recovery.");
  }
  // Some responses omit output_text even though the word annotations contain
  // the recognized speech. Recover that text before rejecting bad timestamps.
  // Only reconstruct when *every* annotation has safe, nonempty speech.
  const annotatedText=words.every(word=>typeof word.text==="string"&&
    Boolean(word.text.trim())&&word.text.length<=1400&&
    !/[\u0000-\u001f\u007f]/u.test(word.text))
    ?words.map(word=>(word.text as string).trim()).join(" "):"";
  const recoverText=completeText.trim()||annotatedText;
  const recover=():CaptionCue[]=>{
    if(recoverText)return sectionTextCues(recoverText,offsetMs,durationMs);
    throw new Error("Gemini returned out-of-range timestamps and incomplete transcript text. The provider response is saved for recovery.");
  };
  const cues:CaptionCue[]=[];
  let start=-1,end=0,phrase="";
  function flush(){
    if(start<0||!phrase.trim())return;
    cues.push({startMs:offsetMs+start,endMs:offsetMs+end,
      rawSpeaker:"",text:phrase.trim()});
    start=-1;end=0;phrase="";
  }
  // Gemini offsets are normally clip-relative. A few results use recording-
  // absolute offsets, so detect that only if the complete set fits this
  // exact section's global timeline. Never shift unrelated/broken offsets.
  const parsed=words.map(word=>{
    try{return {first:geminiWordTime(word.start_offset),
      last:geminiWordTime(word.end_offset),
      text:typeof word.text==="string"?word.text.trim():""};}
    catch{return null;}
  });
  if(parsed.some(word=>word===null))return recover();
  const timings=parsed as {first:number;last:number;text:string}[];
  const allRelative=timings.every(w=>Number.isSafeInteger(w.first)&&Number.isSafeInteger(w.last)&&
    w.first>=0&&w.first<durationMs&&w.last>=w.first&&w.last<=durationMs+2000);
  const allAbsolute=offsetMs>0&&timings.every(w=>Number.isSafeInteger(w.first)&&
    Number.isSafeInteger(w.last)&&w.first>=offsetMs&&w.first<offsetMs+durationMs&&
    w.last>=w.first&&w.last<=offsetMs+durationMs+2000);
  if(!allRelative&&!allAbsolute)return recover();
  const shift=allRelative?0:offsetMs;
  for(const word of timings){
    const first=word.first-shift;
    // Gemini can end the last word a fraction past the clip boundary; clamp
    // only within the allowed 2-second tolerance, never invent time beyond it.
    let last=Math.min(durationMs,word.last-shift);
    const text=word.text;
    if(!text||text.length>1400||/[\u0000-\u001f\u007f]/u.test(text))
      return recover();
    last=Math.max(first+1,last);
    if(last>durationMs)return recover();
    if(phrase && (first<end-2000||first-end>1000||
      last-start>15_000||phrase.length+text.length>1100))flush();
    if(start<0)start=first;
    end=last;
    if(end<=start)return recover();
    phrase+=(phrase?" ":"")+text;
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
