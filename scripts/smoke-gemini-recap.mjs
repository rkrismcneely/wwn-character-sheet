#!/usr/bin/env node
/** Explicitly opted-in provider smoke test, using only synthetic 1-second audio.
 * Never used by CI/production without a manually supplied test-project secret.
 * May incur a tiny amount of Gemini usage on the test project.
 */
import assert from "node:assert/strict";
const API="https://generativelanguage.googleapis.com";
const KEY=process.env.TWE_GEMINI_SMOKE_API_KEY;
if(!KEY)throw Error("Configure TWE_GEMINI_SMOKE_API_KEY on a test project before manually running this.");
const requestHeaders={"x-goog-api-key":KEY};
const deadline=Date.now()+4*60*1000;
function tinyWav(){
  const rate=16000,frames=rate,out=Buffer.alloc(44+frames*2);
  out.write("RIFF",0);out.writeUInt32LE(out.length-8,4);out.write("WAVE",8);
  out.write("fmt ",12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);
  out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write("data",36);out.writeUInt32LE(frames*2,40);
  // Synthetic quiet tone, not user audio or copyrighted source material.
  for(let i=0;i<frames;i++)out.writeInt16LE(Math.round(900*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
  return out;
}
async function expectResponse(response,step){
  if(response.status>=300||!response.ok||response.redirected)
    throw Error(step+" failed: HTTP "+response.status);
  return response;
}
async function responseJson(response,step){
  const text=await response.text();
  if(text.length>200000)throw Error(step+" oversized provider response");
  try{return JSON.parse(text);}catch{throw Error(step+" returned invalid JSON");}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let fileName;
try{
  const audio=tinyWav();
  const init=await expectResponse(await fetch(API+"/upload/v1beta/files",{
    method:"POST",redirect:"manual",
    headers:{...requestHeaders,"content-type":"application/json",
      "x-goog-upload-protocol":"resumable","x-goog-upload-command":"start",
      "x-goog-upload-header-content-length":String(audio.length),
      "x-goog-upload-header-content-type":"audio/wav"},
    body:JSON.stringify({file:{display_name:"TWE synthetic protocol smoke"}}),
  }),"upload session");
  const session=init.headers.get("x-goog-upload-url");
  assert.ok(session,"Google did not issue an upload session URL");
  const parsed=new URL(session);
  assert.equal(parsed.origin,API);
  assert.equal(parsed.pathname,"/upload/v1beta/files");
  const uploaded=await expectResponse(await fetch(session,{
    method:"POST",redirect:"manual",
    headers:{...requestHeaders,"x-goog-upload-command":"upload, finalize",
      "x-goog-upload-offset":"0","content-type":"application/json"},
    body:audio,
  }),"binary audio upload");
  assert.equal(uploaded.headers.get("x-goog-upload-status"),"final",
    "Gemini did not acknowledge final upload");
  const receipt=await responseJson(uploaded,"upload receipt");
  assert.match(receipt?.file?.name??"",/^files\/[A-Za-z0-9_-]+$/u);
  fileName=receipt.file.name;
  assert.equal(new URL(receipt.file.uri).origin,API);
  while(Date.now()<deadline){
    const file=await responseJson(await expectResponse(await fetch(API+"/v1beta/"+fileName,{
      headers:requestHeaders,redirect:"manual",
    }),"file readiness"),"file readiness");
    if(file.state==="ACTIVE")break;
    if(file.state==="FAILED")throw Error("Gemini file processing failed");
    if(file.state!=="PROCESSING")throw Error("Unrecognized Gemini file state");
    await sleep(4000);
  }
  if(Date.now()>=deadline)throw Error("Timed out preparing a synthetic audio file");
  const created=await responseJson(await expectResponse(await fetch(API+"/v1beta/interactions",{
    method:"POST",redirect:"manual",
    headers:{...requestHeaders,"content-type":"application/json","Api-Revision":"2026-05-20"},
    body:JSON.stringify({model:"gemini-3.8-flash",background:true,store:true,
      input:[{type:"text",text:"Briefly describe the sound in this one-second test recording."},
        {type:"audio",uri:receipt.file.uri,mime_type:"audio/wav"}]}),
  }),"interaction creation"),"interaction creation");
  const id=created?.id;
  assert.match(id??"",/^[A-Za-z0-9_-]+$/u);
  while(Date.now()<deadline){
    const status=await responseJson(await expectResponse(await fetch(
      API+"/v1beta/interactions/"+encodeURIComponent(id),{
        headers:{...requestHeaders,"Api-Revision":"2026-05-20"},redirect:"manual",
      }),"interaction polling"),"interaction polling");
    if(status.status==="completed"){
      assert.ok(typeof status.output_text==="string"||
        Array.isArray(status.steps),"Completed interaction has no visible output");
      process.stdout.write("PASS: synthetic WAV Files upload, readiness, background interaction and poll completed.\n");
      process.exitCode=0;break;
    }
    if(status.status!=="in_progress")throw Error("Interaction stopped: "+String(status.status));
    await sleep(4000);
  }
  if(Date.now()>=deadline)throw Error("Timed out during Gemini interaction polling");
}finally{
  if(fileName){
    try{
      await fetch(API+"/v1beta/"+fileName,{method:"DELETE",headers:requestHeaders,redirect:"manual"});
    }catch{/* Gemini temporary files expire; cleanup is best effort. */}
  }
}
