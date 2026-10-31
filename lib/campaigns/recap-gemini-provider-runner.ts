import { GEMINI_TRANSCRIBE_MODEL,normalizeGeminiWords } from "./recap-gemini-transcribe.ts";
import type { CaptionCue } from "./recap-full-transcript.ts";

const HOST="https://generativelanguage.googleapis.com";
const MAX_RESULT_BYTES=900_000;
const KEY=/^[A-Za-z0-9_-]{24,200}$/u;
const INTERACTION=/^[A-Za-z0-9_-]{6,240}$/u;
type GeminiResponse={id?:unknown;status?:unknown;steps?:unknown;output_text?:unknown};
export type GeminiProviderOutcome=
  |{kind:"complete";id:string;cues:CaptionCue[]}
  |{kind:"pending";id:string}
  |{kind:"quota"}
  |{kind:"rejected"};
export class GeminiAmbiguousResult extends Error {
  constructor(){super("Gemini submission outcome is uncertain; do not retry automatically.");}
}
function keyHeader(key:string){
  if(!KEY.test(key))throw new Error("GM Gemini credential is invalid.");
  return {"x-goog-api-key":key};
}
function fixedUploadUrl(raw:string){
  const parsed=new URL(raw);
  if(parsed.origin!==HOST||!parsed.pathname.startsWith("/upload/v1beta/files")||
    parsed.username||parsed.password||parsed.hash)
    throw new Error("Gemini returned a non-Google file upload location.");
  return parsed.toString();
}
async function readJson(response:Response):Promise<GeminiResponse>{
  if(response.redirected||!response.ok)throw new Error("Gemini provider response failed.");
  const length=response.headers.get("content-length");
  if(length&&Number(length)>MAX_RESULT_BYTES)throw new Error("Gemini response exceeded limit.");
  const body=await response.text();
  if(body.length>MAX_RESULT_BYTES)throw new Error("Gemini response too large.");
  return JSON.parse(body) as GeminiResponse;
}
function parseInteraction(response:GeminiResponse,startMs:number,durationMs:number):GeminiProviderOutcome{
  if(typeof response.id!=="string"||!INTERACTION.test(response.id))
    throw new GeminiAmbiguousResult();
  if(response.status==="in_progress"||response.status==="requires_continuation")
    return {kind:"pending",id:response.id};
  if(response.status==="completed")
    return {kind:"complete",id:response.id,cues:normalizeGeminiWords(response,startMs,durationMs)};
  if(response.status==="failed"||response.status==="cancelled"||
    response.status==="incomplete"||response.status==="requires_action")
    return {kind:"rejected"};
  throw new GeminiAmbiguousResult();
}
async function upload(key:string,bytes:Uint8Array<ArrayBuffer>):Promise<string>{
  const start=await fetch(HOST+"/upload/v1beta/files",{
    method:"POST",redirect:"manual",signal:AbortSignal.timeout(15000),
    headers:{...keyHeader(key),"content-type":"application/json",
      "x-goog-upload-protocol":"resumable",
      "x-goog-upload-command":"start",
      "x-goog-upload-header-content-length":String(bytes.byteLength),
      "x-goog-upload-header-content-type":"audio/wav"},
    body:JSON.stringify({file:{display_name:"TWE GM-owned session speech segment"}}),
  });
  if(start.status===429)throw new Error("quota");
  if(!start.ok||start.redirected)throw new Error("upload-start");
  const url=start.headers.get("x-goog-upload-url");
  if(!url)throw new Error("upload-location");
  const final=await fetch(fixedUploadUrl(url),{
    method:"POST",redirect:"manual",signal:AbortSignal.timeout(45000),
    headers:{"x-goog-upload-offset":"0","x-goog-upload-command":"upload, finalize",
      "content-length":String(bytes.byteLength)},
    body:bytes,
  });
  if(final.status===429)throw new Error("quota");
  const data=await readJson(final) as {file?:{uri?:unknown}};
  const uri=data.file?.uri;
  if(typeof uri!=="string"||!uri.startsWith(HOST+"/"))
    throw new Error("Gemini returned an unexpected file URI.");
  return uri;
}
/** The POST may be billable. Network failures after submission are ambiguous. */
export async function submitVerifiedGeminiAudio(input:{
  key:string;bytes:Uint8Array<ArrayBuffer>;startMs:number;durationMs:number;
}):Promise<GeminiProviderOutcome>{
  const uri=await upload(input.key,input.bytes);
  let response:Response;
  try{
    response=await fetch(HOST+"/v1beta/interactions",{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(45000),
      headers:{...keyHeader(input.key),"content-type":"application/json"},
      body:JSON.stringify({
        model:GEMINI_TRANSCRIBE_MODEL,
        input:[{type:"audio",uri,mime_type:"audio/wav"}],
        generation_config:{transcription_config:{
          mode:{type:"verbatim",timestamp_granularities:["word"]},
        }},
      }),
    });
  }catch{throw new GeminiAmbiguousResult();}
  if(response.status===429)return {kind:"quota"};
  if(response.status===400||response.status===401||response.status===403)
    return {kind:"rejected"};
  if(!response.ok||response.redirected)throw new GeminiAmbiguousResult();
  try{return parseInteraction(await readJson(response),input.startMs,input.durationMs);}
  catch{throw new GeminiAmbiguousResult();}
}
/** GETs are non-billable status recovery; never send the audio a second time. */
export async function pollGeminiInteraction(input:{
  key:string;id:string;startMs:number;durationMs:number;
}):Promise<GeminiProviderOutcome>{
  if(!INTERACTION.test(input.id))throw new Error("Invalid provider interaction ID.");
  const response=await fetch(HOST+"/v1beta/interactions/"+encodeURIComponent(input.id),{
    method:"GET",redirect:"manual",signal:AbortSignal.timeout(15000),
    headers:keyHeader(input.key),
  });
  if(response.status===429)return {kind:"quota"};
  if(response.status===401||response.status===403||response.status===404)
    return {kind:"rejected"};
  return parseInteraction(await readJson(response),input.startMs,input.durationMs);
}
