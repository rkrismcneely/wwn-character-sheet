import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { pcmWavChunkHeader } from "../lib/campaigns/recap-wav-chunks.ts";
import {
  validateGeminiDriveFile,boundedGeminiDownload,verifyGeminiSpeechWav,
} from "../lib/campaigns/recap-gemini-drive-bytes.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

const source={channels:1,sampleRate:16000,bitsPerSample:16,blockAlign:2,dataOffset:44,dataBytes:16000*2};
async function fixture(){
  const data=new Uint8Array(44+source.dataBytes);
  data.set(pcmWavChunkHeader(source,source.dataBytes));
  const view=new DataView(data.buffer);
  for(let i=0;i<16000;i++)view.setInt16(44+2*i,Math.round(Math.sin(i/12)*2000),true);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data)),
    b=>b.toString(16).padStart(2,"0")).join("");
  return {data,hash};
}
test("verify one independently playable mono WAV and its exact SHA-256",async()=>{
  const {data,hash}=await fixture();
  const duration=await verifyGeminiSpeechWav(data,{size:data.length,digest:hash,durationMs:1000});
  assert.equal(duration,1000);
  const tampered=data.slice();
  tampered[500]^=1;
  await assert.rejects(verifyGeminiSpeechWav(tampered,
    {size:data.length,digest:hash,durationMs:1000}),/checksum/u);
  await assert.rejects(verifyGeminiSpeechWav(data,
    {size:data.length,digest:hash,durationMs:1200}),/duration/u);
  await assert.rejects(verifyGeminiSpeechWav(data,
    {size:data.length+1,digest:hash,durationMs:1000}),/size/u);
  await assert.rejects(verifyGeminiSpeechWav(data,
    {size:data.length,digest:hash,durationMs:Number.NaN}),/size or source digest/u);
});
test("reject non-mono and wrong-format staged audio despite a matching hash",async()=>{
  const {data}=await fixture();
  const bad=data.slice();
  const view=new DataView(bad.buffer);
  view.setUint16(22,2,true);view.setUint16(32,4,true);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bad)),
    b=>b.toString(16).padStart(2,"0")).join("");
  await assert.rejects(verifyGeminiSpeechWav(bad,
    {size:bad.byteLength,digest:hash,durationMs:1000}),/mono|inconsistent/u);
});
test("Drive upload metadata must belong to exactly the GM-owned TWE asset",()=>{
  const required={assetId:"d0c3b292-d0e2-42d9-8045-c13226a90aac",
    campaignId:"48f3b020-f99b-4014-8e05-a797d5c62992",
    remoteFileId:"googlefileexample",byteSize:32044};
  const metadata={id:required.remoteFileId,size:"32044",mimeType:"audio/wav",
    trashed:false,appProperties:{tweAudioAssetId:required.assetId,tweCampaignId:required.campaignId}};
  assert.doesNotThrow(()=>validateGeminiDriveFile(metadata,required));
  for(const changes of [{id:"elsewhere"},{size:"32045"},{trashed:true},
    {mimeType:"application/octet-stream"},{appProperties:{...metadata.appProperties,tweCampaignId:"other"}}]){
    assert.throws(()=>validateGeminiDriveFile({...metadata,...changes},required),/metadata/u);
  }
});
test("Drive byte streaming is memory bounded even with false/missing content-length",async()=>{
  const {data}=await fixture();
  const response=new Response(new ReadableStream({
    start(controller){
      controller.enqueue(data.subarray(0,8000));
      controller.enqueue(data.subarray(8000));
      controller.close();
    },
  }),{status:200,headers:{"content-type":"application/octet-stream"}});
  const bytes=await boundedGeminiDownload(response,40000);
  assert.deepEqual(bytes,data);
  const oversized=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(5000));controller.close();}
  }),{status:200,headers:{"content-length":"99999999"}});
  await assert.rejects(boundedGeminiDownload(oversized,40000),/limit/u);
  const big=new Response(new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(40001));controller.close();}
  }),{status:200});
  await assert.rejects(boundedGeminiDownload(big,40000),/limit/u);
  await assert.rejects(boundedGeminiDownload(new Response(null,{status:302}),40000),/download/u);
});
test("Drive source preflight enforces job, recap, user, OAuth and both provider account ownerships",async()=>{
  const [reader,route,ui]=await Promise.all([
    read("../lib/campaigns/recap-gemini-drive-source.ts"),
    read("../app/api/campaigns/[id]/session-recaps/background-gemini/verify-source/route.ts"),
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
  ]);
  for(const phrase of [
    "j.requested_by AS requestedBy","g.user_id=j.requested_by",
    "g.provider='gemini'","a.storage_owner_user_id=j.requested_by",
    "a.campaign_id=j.campaign_id AND a.recap_id=j.recap_id",
    "s.user_id=j.requested_by AND s.provider='google-drive'",
    "row.requestedBy!==identity.requestedBy",
    "row.connectionStatus!==\"connected\"",
    "getGmDriveAccessToken(db,settings,identity.requestedBy,row.connectionId)",
    "https://www.googleapis.com/drive/v3/files/",
    "fields=id,size,mimeType,trashed,appProperties",
    "?alt=media","redirect:\"manual\"","boundedGeminiDownload(response)",
    "verifyGeminiSpeechWav(bytes",
  ])assert.ok(reader.includes(phrase),"Missing private Drive source guard: "+phrase);
  for(const phrase of [
    "getSessionActor(request)","canManageCampaignContent",
    "getCampaignSessionRecap","actor.userId","source_verify_attempted_at",
    "source_verified_at","new Date(now.getTime()-2*60*1000)",
    "readVerifiedGmGeminiClip","cache-control",
  ])assert.ok(route.includes(phrase),"Missing rate-limit/GM guard: "+phrase);
  assert.match(ui,/Verify one saved clip from my Drive/u);
  assert.match(ui,/jobs\+"\/verify-source"/u);
  for(const text of [reader,route]){
    assert.doesNotMatch(text,/generativelanguage\.googleapis\.com|api\.groq\.com|console\.log\(/u);
  }
});
test("manual source verification audit migration is additive",async()=>{
  const [sql,schema]=await Promise.all([
    read("../drizzle/0043_recap_gemini_source_verification.sql"),read("../db/schema.ts"),
  ]);
  assert.match(sql,/ADD COLUMN source_verify_attempted_at/u);
  assert.match(sql,/ADD COLUMN source_verified_at/u);
  assert.match(schema,/sourceVerifyAttemptedAt: text\("source_verify_attempted_at"\)/u);
  assert.match(schema,/sourceVerifiedAt: text\("source_verified_at"\)/u);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM/u);
});
