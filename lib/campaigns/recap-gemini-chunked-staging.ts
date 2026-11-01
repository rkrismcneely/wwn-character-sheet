import {
  encryptDriveRefreshToken,decryptDriveRefreshToken,type DriveSettings,
} from "../account/recap-google-drive-oauth.ts";
import {geminiAudioMime} from "./recap-gemini-audio-mime.ts";

const API="https://generativelanguage.googleapis.com";
// Google's official Go Gemini client uses 8 MiB per upload chunk.
export const RECAP_STAGING_CHUNK_BYTES=8*1024*1024;
// Keep each scheduled run bounded to roughly 24 MiB of network transfer.
export const RECAP_STAGING_CHUNKS_PER_TICK=3;
const GOOGLE_ID=/^[a-zA-Z0-9_-]{6,240}$/u;
export type StagingErrorCode=
  | "gemini_key_unavailable" | "drive_file_unavailable"
  | "drive_permission_unavailable" | "gemini_file_start_failed"
  | "gemini_upload_session_missing" | "gemini_upload_session_expired"
  | "gemini_upload_session_invalid" | "gemini_upload_offset_unknown"
  | "gemini_chunk_granularity_mismatch"
  | "drive_range_unavailable" | "drive_range_invalid"
  | "gemini_chunk_rejected" | "gemini_chunk_network_error"
  | "gemini_chunk_http_400" | "gemini_chunk_http_401" | "gemini_chunk_http_403"
  | "gemini_chunk_http_404" | "gemini_chunk_http_409" | "gemini_chunk_http_413"
  | "gemini_chunk_http_429" | "gemini_chunk_http_500" | "gemini_chunk_http_502"
  | "gemini_chunk_http_503" | "gemini_chunk_http_504"
  | "gemini_upload_receipt_invalid" | "gemini_upload_finalization_uncertain"
  | "gemini_file_processing_failed" | "gemini_file_not_active"
  | "gemini_file_expired" | "staging_data_unavailable";

export class RecapStagingFailure extends Error{
  readonly code:StagingErrorCode;
  constructor(code:StagingErrorCode){
    super("Recap file preparation failed: "+code);
    this.name="RecapStagingFailure";this.code=code;
  }
}
export type StagedSource={remoteFileId:string;byteSize:number;mimeType:string;
  segment?:{sourceStart:number;sourceEnd:number;originalBytes:number;prefix:Uint8Array};
};
const JOB_TABLE="campaign_recap_audio_summary_jobs";
const SEGMENT_TABLE="campaign_recap_audio_summary_segments";
const tableFor=(src:StagedSource)=>src.segment?SEGMENT_TABLE:JOB_TABLE;
type Job={id:string;requestedBy:string};
type StageRow={
  stageUrlCiphertext:string|null;stageUrlNonce:string|null;
  stageUrlVersion:number|null;stageOffset:number;
};
export type StagingEnv=DriveSettings&{DB:D1Database};
function uploadSessionUrl(raw:string):string{
  let parsed:URL;
  try{parsed=new URL(raw);}catch{throw new RecapStagingFailure("gemini_upload_session_invalid");}
  if(parsed.origin!==API||parsed.pathname!=="/upload/v1beta/files"||
    parsed.username||parsed.password||parsed.hash||
    raw.length>8192)
    throw new RecapStagingFailure("gemini_upload_session_invalid");
  return parsed.href;
}
function validReceipt(data:unknown):{uri:string;name:string}{
  const file=(data as {file?:{uri?:unknown;name?:unknown}}|null)?.file;
  if(typeof file?.uri!=="string"||!file.uri.startsWith(API+"/v1beta/files/")||
    typeof file.name!=="string"||!/^files\/[a-zA-Z0-9_-]+$/u.test(file.name))
    throw new RecapStagingFailure("gemini_upload_receipt_invalid");
  return {uri:file.uri,name:file.name};
}
async function smallJson(response:Response):Promise<unknown>{
  if(Number(response.headers.get("content-length")||0)>100000)
    throw new RecapStagingFailure("gemini_upload_receipt_invalid");
  const raw=await response.text();
  if(raw.length>100000)throw new RecapStagingFailure("gemini_upload_receipt_invalid");
  try{return JSON.parse(raw) as unknown;}catch{
    throw new RecapStagingFailure("gemini_upload_receipt_invalid");
  }
}
function downloadRange(source:StagedSource,offset:number,len:number,driveToken:string){
  return fetch("https://www.googleapis.com/drive/v3/files/"+
    encodeURIComponent(source.remoteFileId)+"?alt=media",{
    method:"GET",redirect:"manual",headers:{
      authorization:"Bearer "+driveToken,
      range:"bytes="+offset+"-"+(offset+len-1),
      "accept-encoding":"identity",
    },signal:AbortSignal.timeout(30000),
  });
}
async function stageRow(db:D1Database,id:string,table:string):Promise<StageRow>{
  const row=await db.prepare("SELECT stage_url_ciphertext AS stageUrlCiphertext,"+
    "stage_url_nonce AS stageUrlNonce,stage_url_version AS stageUrlVersion,"+
    "stage_offset AS stageOffset FROM "+table+" "+
    "WHERE id=? AND status='transferring'").bind(id).first<StageRow>();
  if(!row)throw new RecapStagingFailure("staging_data_unavailable");
  return row;
}
async function startingSession(env:StagingEnv,job:Job,secret:string,src:StagedSource):Promise<string>{
  let response:Response;
  try{
    response=await fetch(API+"/upload/v1beta/files",{
      method:"POST",redirect:"manual",signal:AbortSignal.timeout(20000),
      headers:{"x-goog-api-key":secret,"content-type":"application/json",
        "x-goog-upload-protocol":"resumable","x-goog-upload-command":"start",
        "x-goog-upload-header-content-length":String(src.byteSize),
        "x-goog-upload-header-content-type":geminiAudioMime(src.mimeType)},
      body:JSON.stringify({file:{display_name:"TWE recap "+job.id}}),
    });
  }catch{throw new RecapStagingFailure("gemini_file_start_failed");}
  if(!response.ok||response.redirected)throw new RecapStagingFailure("gemini_file_start_failed");
  const raw=response.headers.get("x-goog-upload-url");
  if(!raw)throw new RecapStagingFailure("gemini_upload_session_missing");
  const url=uploadSessionUrl(raw);
  // Google's resumable upload protocol may return an alignment requirement.
  // Reject a session before sending bytes if our bounded chunks would violate
  // that requirement, rather than receiving a generic 400 on the first chunk.
  const granularity=response.headers.get("x-goog-upload-chunk-granularity");
  if(granularity!==null){
    if(!/^\d+$/u.test(granularity))throw new RecapStagingFailure("gemini_chunk_granularity_mismatch");
    const size=Number(granularity);
    if(!Number.isSafeInteger(size)||size<1||RECAP_STAGING_CHUNK_BYTES%size!==0)
      throw new RecapStagingFailure("gemini_chunk_granularity_mismatch");
  }
  const encrypted=await encryptDriveRefreshToken(env,job.requestedBy,job.id,url);
  const change=await env.DB.prepare("UPDATE "+tableFor(src)+" "+
    "SET stage_url_ciphertext=?,stage_url_nonce=?,stage_url_version=?,stage_offset=0,updated_at=? "+
    "WHERE id=? AND status='transferring' AND stage_url_ciphertext IS NULL")
    .bind(encrypted.ciphertext,encrypted.nonce,encrypted.version,new Date().toISOString(),job.id).run();
  if(change.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
  return url;
}
type OffsetReply={status:"active"|"final";bytes:number};
async function queryOffset(url:string,total:number,secret:string):Promise<OffsetReply>{
  let response:Response;
  try{response=await fetch(url,{
    method:"POST",redirect:"manual",
    headers:{"x-goog-upload-command":"query","x-goog-api-key":secret},
    signal:AbortSignal.timeout(15000),
  });}catch{throw new RecapStagingFailure("gemini_upload_offset_unknown");}
  if(response.status===404||response.status===410)
    throw new RecapStagingFailure("gemini_upload_session_expired");
  if(!response.ok||response.redirected)
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  const state=response.headers.get("x-goog-upload-status");
  if(state!=="active"&&state!=="final")
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  const raw=response.headers.get("x-goog-upload-size-received");
  if(raw===null||!/^\d+$/u.test(raw))
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  const bytes=Number(raw);
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>total||
    (state==="final"&&bytes!==total)||
    (state==="active"&&bytes===total))
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  return {status:state,bytes};
}

/** A finalized session may have lost its browser/Worker receipt. Recover by
 * matching the unique per-job display name, exact original byte size and MIME
 * from this GM's own Gemini Files listing; never accept an arbitrary file ID.
 * List at most three pages and fail closed if ambiguous or still unindexed.
 */
async function recoverCompletedFile(job:Job,source:StagedSource,secret:string){
  const matches:{uri:string;name:string}[]=[];
  let pageToken:string|undefined;
  for(let page=0;page<3;page++){
    const url=new URL(API+"/v1beta/files");
    url.searchParams.set("pageSize","100");
    if(pageToken)url.searchParams.set("pageToken",pageToken);
    let response:Response;
    try{response=await fetch(url.toString(),{
      redirect:"manual",headers:{"x-goog-api-key":secret},
      signal:AbortSignal.timeout(12000),
    });}catch{throw new RecapStagingFailure("gemini_upload_finalization_uncertain");}
    if(!response.ok||response.redirected)
      throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
    const data=await smallJson(response) as {
      files?:{displayName?:unknown;sizeBytes?:unknown;mimeType?:unknown;uri?:unknown;name?:unknown}[];
      nextPageToken?:unknown;
    };
    if(!data||!Array.isArray(data.files))
      throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
    for(const file of data.files){
      if(file.displayName!=="TWE recap "+job.id||
        String(file.sizeBytes)!==String(source.byteSize)||
        file.mimeType!==geminiAudioMime(source.mimeType))continue;
      try{matches.push(validReceipt({file}));}catch{
        throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
      }
    }
    if(matches.length>1)throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
    pageToken=typeof data.nextPageToken==="string"&&data.nextPageToken?data.nextPageToken:undefined;
    if(!pageToken){
      if(matches.length===1)return matches[0];
      throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
    }
  }
  // A partial paginated listing is not proof of uniqueness.
  throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
}
async function storeCompletedFile(
  env:StagingEnv,job:Job,source:StagedSource,file:{uri:string;name:string},
):Promise<void>{
  const result=await env.DB.prepare("UPDATE "+tableFor(source)+" "+
    "SET status='uploaded',file_uri=?,file_name=?,stage_url_ciphertext=NULL,"+
    "stage_url_nonce=NULL,stage_url_version=NULL,stage_offset=?,updated_at=? "+
    "WHERE id=? AND status='transferring'")
    .bind(file.uri,file.name,source.byteSize,new Date().toISOString(),job.id).run();
  if(result.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
}
/** One cron slice: safely stage a few bounded Drive range bytes into Gemini.
 * Uint8Array bodies have a fixed Content-Length in Cloudflare Workers; unlike
 * forwarding a raw ReadableStream, Google does not receive chunked encoding.
 * Resumable upload sessions are encrypted at rest and reconciled with Google's
 * acknowledged offset at the start of each new tick.
 */
export async function stageRecapAudioChunked(
  env:StagingEnv,job:Job,secret:string,source:StagedSource,driveToken:string,
):Promise<{done:boolean;bytes:number;total:number}>{
  if(!GOOGLE_ID.test(source.remoteFileId)||!Number.isSafeInteger(source.byteSize)||
    source.byteSize<=0||source.byteSize>2*1024*1024*1024)
    throw new RecapStagingFailure("drive_file_unavailable");
  const row=await stageRow(env.DB,job.id,tableFor(source));
  let url:string;
  let offset:number;
  if(!row.stageUrlCiphertext){
    url=await startingSession(env,job,secret,source);offset=0;
  }else{
    if(!row.stageUrlNonce||row.stageUrlVersion!==1)
      throw new RecapStagingFailure("staging_data_unavailable");
    try{
      url=uploadSessionUrl(await decryptDriveRefreshToken(env,job.requestedBy,job.id,{
        ciphertext:row.stageUrlCiphertext,nonce:row.stageUrlNonce,version:row.stageUrlVersion,
      }));
    }catch{throw new RecapStagingFailure("staging_data_unavailable");}
    const checkpoint=await queryOffset(url,source.byteSize,secret);
    if(checkpoint.status==="final"){
      const file=await recoverCompletedFile(job,source,secret);
      await storeCompletedFile(env,job,source,file);
      return {done:true,bytes:source.byteSize,total:source.byteSize};
    }
    offset=checkpoint.bytes;
    if(offset!==row.stageOffset){
      const synced=await env.DB.prepare("UPDATE "+tableFor(source)+" "+
        "SET stage_offset=?,updated_at=? WHERE id=? AND status='transferring' "+
        "AND stage_offset=?").bind(offset,new Date().toISOString(),job.id,row.stageOffset).run();
      if(synced.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
    }
  }
  for(let i=0;i<RECAP_STAGING_CHUNKS_PER_TICK&&offset<source.byteSize;i++){
    const length=Math.min(RECAP_STAGING_CHUNK_BYTES,source.byteSize-offset);
    // A segment is a virtual file: a short WAV header (when necessary)
    // followed by a bounded contiguous range of the ORIGINAL Drive audio.
    // Never assume that arbitrary 8 MiB resumable upload chunks are playable.
    const prefix=source.segment?.prefix??new Uint8Array(0);
    const prefixBytes=Math.max(0,Math.min(length,prefix.length-offset));
    const mediaBytes=length-prefixBytes;
    // Do not copy the regular 8 MiB Drive buffer: on Workers Free that
    // unnecessary CPU work can exceed a scheduled invocation's budget.
    // Only the first WAV segment chunk needs to join a tiny header with data.
    let bytes:Uint8Array<ArrayBuffer>|null=prefixBytes?new Uint8Array(length):null;
    if(bytes&&prefixBytes)bytes.set(prefix.subarray(offset,offset+prefixBytes),0);
    if(mediaBytes){
      const mediaOffset=source.segment?
        source.segment.sourceStart+offset+prefixBytes-prefix.length:offset;
      const originalTotal=source.segment?.originalBytes??source.byteSize;
      if(mediaOffset<0||mediaOffset+mediaBytes>originalTotal||
        (source.segment&&mediaOffset+mediaBytes>source.segment.sourceEnd))
        throw new RecapStagingFailure("drive_range_invalid");
      let drive:Response;
      try{drive=await downloadRange(source,mediaOffset,mediaBytes,driveToken);}
      catch{throw new RecapStagingFailure("drive_range_unavailable");}
      if(drive.status!==206||drive.redirected)
        throw new RecapStagingFailure("drive_range_unavailable");
      const contentRange=drive.headers.get("content-range");
      if(contentRange!=="bytes "+mediaOffset+"-"+(mediaOffset+mediaBytes-1)+"/"+originalTotal)
        throw new RecapStagingFailure("drive_range_invalid");
      if(Number(drive.headers.get("content-length")||mediaBytes)>mediaBytes)
        throw new RecapStagingFailure("drive_range_invalid");
      let data:ArrayBuffer;
      try{data=await drive.arrayBuffer();}catch{
        throw new RecapStagingFailure("drive_range_unavailable");
      }
      if(data.byteLength!==mediaBytes)throw new RecapStagingFailure("drive_range_invalid");
      if(bytes)bytes.set(new Uint8Array(data),prefixBytes);
      else bytes=new Uint8Array(data); // zero-copy for ordinary and MP3 chunks
    }
    if(!bytes)bytes=new Uint8Array(prefix.subarray(offset,offset+prefixBytes));
    // Typed-array bodies receive the correct fixed Content-Length in Workers.
    const final=offset+length===source.byteSize;
    let response:Response;
    try{
      response=await fetch(url,{
        method:"POST",redirect:"manual",signal:AbortSignal.timeout(45000),
        headers:{"x-goog-upload-offset":String(offset),
          "x-goog-upload-command":final?"upload, finalize":"upload",
          // The Google genai SDK sends the API key with every upload chunk.
          // Only send it to the strictly validated Google upload session URL.
          "x-goog-api-key":secret,
          // Match Google's first-party Go SDK for raw resumable chunks. The
          // body is still an 8 MiB binary Uint8Array, NOT serialized JSON.
          "content-type":"application/json"},
        body:bytes,
      });
    }catch{throw new RecapStagingFailure("gemini_chunk_network_error");}
    if(!response.ok||response.redirected){
      // Do not echo Google's response body or URL: it could contain sensitive
      // provider details. Record only a fixed, whitelisted HTTP status so the
      // GM can distinguish bad requests from credentials/quota/outages.
      const recognized=[400,401,403,404,409,413,429,500,502,503,504] as const;
      if(!response.redirected&&recognized.some(code=>code===response.status))
        throw new RecapStagingFailure(("gemini_chunk_http_"+response.status) as StagingErrorCode);
      throw new RecapStagingFailure("gemini_chunk_rejected");
    }
    const acknowledgement=response.headers.get("x-goog-upload-status");
    if(final){
      if(acknowledgement!=="final")
        throw new RecapStagingFailure("gemini_upload_finalization_uncertain");
      const file=validReceipt(await smallJson(response));
      await storeCompletedFile(env,job,source,file);
      return {done:true,bytes:source.byteSize,total:source.byteSize};
    }
    if(acknowledgement!=="active")
      throw new RecapStagingFailure("gemini_upload_offset_unknown");
    const updated=await env.DB.prepare("UPDATE "+tableFor(source)+" "+
      "SET stage_offset=?,updated_at=? WHERE id=? AND status='transferring' "+
      "AND stage_offset=?").bind(offset+length,new Date().toISOString(),job.id,offset).run();
    if(updated.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
    offset+=length;
  }
  return {done:false,bytes:offset,total:source.byteSize};
}
