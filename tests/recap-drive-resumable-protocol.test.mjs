import assert from "node:assert/strict";
import test from "node:test";
import {
  DRIVE_UPLOAD_BLOCK_BYTES, driveChunkRange, nextDriveUploadOffset,
  validateAudioUploadDraft, validateDriveSessionUrl,
} from "../lib/campaigns/recap-drive-upload.ts";
import { uploadRecordingToDrive } from "../lib/campaigns/recap-drive-upload-browser.ts";

const MiB=1024*1024;
const session="https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=privatesession-123";

test("2–3 hour recordings can upload as resumable, 256-KiB-aligned chunks",()=>{
  const audio=validateAudioUploadDraft({filename:"26-10-30 Session.m4a",mimeType:"audio/mp4",byteSize: 780*MiB, durationMs:3*60*60*1000});
  assert.equal(audio.durationMs,10800000);
  assert.deepEqual(driveChunkRange(20*MiB,8*MiB),{
    start:8*MiB,endExclusive:16*MiB,bytes:8*MiB,
    contentRange:"bytes "+(8*MiB)+"-"+(16*MiB-1)+"/"+20*MiB,
  });
  assert.equal(driveChunkRange(9*MiB,8*MiB).bytes, MiB);
  assert.equal(DRIVE_UPLOAD_BLOCK_BYTES,262144);
  assert.equal(nextDriveUploadOffset(308,"bytes=0-1048575",9*MiB),1048576);
  assert.equal(nextDriveUploadOffset(308,null,9*MiB),0);
  assert.equal(nextDriveUploadOffset(201,null,9*MiB),9*MiB);
});
test("reject malformed or oversized audio and untrusted upload redirects",()=>{
  assert.throws(()=>validateAudioUploadDraft({filename:"a/../file.m4a",mimeType:"audio/mp4",byteSize:100}),/filename/);
  assert.throws(()=>validateAudioUploadDraft({filename:"abc.exe",mimeType:"application/x-msdownload",byteSize:100}),/MP3/);
  assert.throws(()=>validateAudioUploadDraft({filename:"three-hours.mp3",mimeType:"audio/mpeg",byteSize:5*1024*MiB}),/size/);
  assert.throws(()=>validateAudioUploadDraft({filename:"long.mp3",mimeType:"audio/mpeg",byteSize:100,durationMs:9*3600*1000}),/duration/);
  assert.equal(validateDriveSessionUrl(session),session);
  assert.throws(()=>validateDriveSessionUrl("https://www.googleapis.com.evil.example/upload/drive/v3/files?uploadType=resumable&upload_id=1"),/Unexpected/);
  assert.throws(()=>validateDriveSessionUrl("http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=1"),/Unexpected/);
  assert.throws(()=>validateDriveSessionUrl("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"),/Unexpected/);
  assert.throws(()=>nextDriveUploadOffset(308,"bytes=12-900",1000),/acknowledgement/);
});
test("browser sends entire recording directly to Drive with no intermediary body",async()=>{
  const body = new Blob([new Uint8Array(2*MiB+50)],{type:"audio/mp4"});
  const requests=[];const progress=[];
  const fakeFetch=async (url,opts)=>{
    assert.equal(url,session);
    const range=opts.headers.get("Content-Range");
    requests.push(range);
    if(requests.length<3){
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/u.exec(range);
      return new Response(null,{status:308,headers:{Range:"bytes=0-"+match[2]}});
    }
    return Response.json({id:"file_xyz_12345",mimeType:"audio/mp4",size:String(body.size)});
  };
  const result=await uploadRecordingToDrive(body,session,(a,b)=>progress.push([a,b]),{fetcher:fakeFetch,chunkBytes:MiB});
  assert.equal(result.id,"file_xyz_12345");
  assert.equal(requests.length,3);
  assert.equal(requests[0],"bytes 0-1048575/"+body.size);
  assert.equal(requests[1],"bytes 1048576-2097151/"+body.size);
  assert.equal(requests[2],"bytes 2097152-2097201/"+body.size);
  assert.deepEqual(progress.at(-1),[body.size,body.size]);
});
test("lost upload response probes Drive status and resumes from its actual accepted offset",async()=>{
  const file=new Blob([new Uint8Array(2*MiB)]);
  const requests=[];
  const fakeFetch=async (url,opts)=>{
    requests.push(opts.headers.get("Content-Range"));
    if(requests.length===1) throw Error("connection dropped after chunk arrived");
    if(requests.length===2) return new Response(null,{status:308,headers:{Range:"bytes=0-1048575"}});
    return Response.json({id:"file_resume_123"});
  };
  const result=await uploadRecordingToDrive(file,session,()=>{},{fetcher:fakeFetch,chunkBytes:MiB});
  assert.equal(result.id,"file_resume_123");
  assert.deepEqual(requests,["bytes 0-1048575/"+file.size,"bytes */"+file.size,"bytes 1048576-2097151/"+file.size]);
});
