import {
  encryptDriveRefreshToken,decryptDriveRefreshToken,type DriveSettings,
} from "../account/recap-google-drive-oauth.ts";

const API="https://generativelanguage.googleapis.com";
export const RECAP_STAGING_CHUNK_BYTES=4*1024*1024;
export const RECAP_STAGING_CHUNKS_PER_TICK=6;
const GOOGLE_ID=/^[a-zA-Z0-9_-]{6,240}$/u;
export type StagingErrorCode=
  | "gemini_key_unavailable" | "drive_file_unavailable"
  | "drive_permission_unavailable" | "gemini_file_start_failed"
  | "gemini_upload_session_missing" | "gemini_upload_session_expired"
  | "gemini_upload_session_invalid" | "gemini_upload_offset_unknown"
  | "drive_range_unavailable" | "drive_range_invalid"
  | "gemini_chunk_rejected" | "gemini_chunk_network_error"
  | "gemini_upload_receipt_invalid" | "staging_data_unavailable";

export class RecapStagingFailure extends Error{
  readonly code:StagingErrorCode;
  constructor(code:StagingErrorCode){
    super("Recap file preparation failed: "+code);
    this.name="RecapStagingFailure";this.code=code;
  }
}
type StagedSource={remoteFileId:string;byteSize:number;mimeType:string};
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
function audioMime(raw:string):string{
  if(raw==="audio/mp4"||raw==="audio/m4a")return "audio/mp4";
  if(raw==="audio/mpeg"||raw==="audio/mp3")return "audio/mpeg";
  if(["audio/aac","audio/flac","audio/wav"].includes(raw))return raw;
  throw new RecapStagingFailure("drive_range_invalid");
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
async function stageRow(db:D1Database,id:string):Promise<StageRow>{
  const row=await db.prepare("SELECT stage_url_ciphertext AS stageUrlCiphertext,"+
    "stage_url_nonce AS stageUrlNonce,stage_url_version AS stageUrlVersion,"+
    "stage_offset AS stageOffset FROM campaign_recap_audio_summary_jobs "+
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
        "x-goog-upload-header-content-type":audioMime(src.mimeType)},
      body:JSON.stringify({file:{display_name:"TWE private recap audio"}}),
    });
  }catch{throw new RecapStagingFailure("gemini_file_start_failed");}
  if(!response.ok||response.redirected)throw new RecapStagingFailure("gemini_file_start_failed");
  const raw=response.headers.get("x-goog-upload-url");
  if(!raw)throw new RecapStagingFailure("gemini_upload_session_missing");
  const url=uploadSessionUrl(raw);
  const encrypted=await encryptDriveRefreshToken(env,job.requestedBy,job.id,url);
  const change=await env.DB.prepare("UPDATE campaign_recap_audio_summary_jobs "+
    "SET stage_url_ciphertext=?,stage_url_nonce=?,stage_url_version=?,stage_offset=0,updated_at=? "+
    "WHERE id=? AND status='transferring' AND stage_url_ciphertext IS NULL")
    .bind(encrypted.ciphertext,encrypted.nonce,encrypted.version,new Date().toISOString(),job.id).run();
  if(change.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
  return url;
}
async function queryOffset(url:string,total:number):Promise<number>{
  let response:Response;
  try{response=await fetch(url,{
    method:"POST",redirect:"manual",
    headers:{"x-goog-upload-command":"query"},
    signal:AbortSignal.timeout(15000),
  });}catch{throw new RecapStagingFailure("gemini_upload_offset_unknown");}
  if(response.status===404||response.status===410)
    throw new RecapStagingFailure("gemini_upload_session_expired");
  if(!response.ok||response.redirected)
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  const state=response.headers.get("x-goog-upload-status");
  if(state&&state!=="active")
    throw new RecapStagingFailure("gemini_upload_session_expired");
  const text=response.headers.get("x-goog-upload-size-received");
  if(text===null||!/^\d+$/u.test(text))
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  const count=Number(text);
  if(!Number.isSafeInteger(count)||count<0||count>=total)
    throw new RecapStagingFailure("gemini_upload_offset_unknown");
  return count;
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
  const row=await stageRow(env.DB,job.id);
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
    offset=await queryOffset(url,source.byteSize);
    if(offset!==row.stageOffset){
      const synced=await env.DB.prepare("UPDATE campaign_recap_audio_summary_jobs "+
        "SET stage_offset=?,updated_at=? WHERE id=? AND status='transferring' "+
        "AND stage_offset=?").bind(offset,new Date().toISOString(),job.id,row.stageOffset).run();
      if(synced.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
    }
  }
  for(let i=0;i<RECAP_STAGING_CHUNKS_PER_TICK&&offset<source.byteSize;i++){
    const length=Math.min(RECAP_STAGING_CHUNK_BYTES,source.byteSize-offset);
    let drive:Response;
    try{drive=await downloadRange(source,offset,length,driveToken);}
    catch{throw new RecapStagingFailure("drive_range_unavailable");}
    if(drive.status!==206||drive.redirected)
      throw new RecapStagingFailure("drive_range_unavailable");
    const contentRange=drive.headers.get("content-range");
    if(contentRange!=="bytes "+offset+"-"+(offset+length-1)+"/"+source.byteSize)
      throw new RecapStagingFailure("drive_range_invalid");
    if(Number(drive.headers.get("content-length")||length)>length)
      throw new RecapStagingFailure("drive_range_invalid");
    let data:ArrayBuffer;
    try{data=await drive.arrayBuffer();}catch{
      throw new RecapStagingFailure("drive_range_unavailable");
    }
    if(data.byteLength!==length)throw new RecapStagingFailure("drive_range_invalid");
    // Typed-array bodies receive the correct fixed Content-Length in Workers.
    const final=offset+length===source.byteSize;
    let response:Response;
    try{
      response=await fetch(url,{
        method:"POST",redirect:"manual",signal:AbortSignal.timeout(45000),
        headers:{"x-goog-upload-offset":String(offset),
          "x-goog-upload-command":final?"upload, finalize":"upload",
          "content-type":"application/octet-stream"},
        body:new Uint8Array(data),
      });
    }catch{throw new RecapStagingFailure("gemini_chunk_network_error");}
    if(!response.ok||response.redirected)
      throw new RecapStagingFailure("gemini_chunk_rejected");
    if(final){
      const file=validReceipt(await smallJson(response));
      const result=await env.DB.prepare("UPDATE campaign_recap_audio_summary_jobs "+
        "SET status='uploaded',file_uri=?,file_name=?,stage_url_ciphertext=NULL,"+
        "stage_url_nonce=NULL,stage_url_version=NULL,stage_offset=?,updated_at=? "+
        "WHERE id=? AND status='transferring' AND stage_offset=?")
        .bind(file.uri,file.name,source.byteSize,new Date().toISOString(),job.id,offset).run();
      if(result.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
      return {done:true,bytes:source.byteSize,total:source.byteSize};
    }
    const updated=await env.DB.prepare("UPDATE campaign_recap_audio_summary_jobs "+
      "SET stage_offset=?,updated_at=? WHERE id=? AND status='transferring' "+
      "AND stage_offset=?").bind(offset+length,new Date().toISOString(),job.id,offset).run();
    if(updated.meta.changes!==1)throw new RecapStagingFailure("staging_data_unavailable");
    offset+=length;
  }
  return {done:false,bytes:offset,total:source.byteSize};
}
