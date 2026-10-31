import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sniffCraigGroqFormat } from "../lib/campaigns/recap-craig-groq-format.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("direct Craig audio remains GM-only with saved speaker confirmation",async()=>{
  const source=await read("../app/api/campaigns/[id]/recap-imports/craig-track-audio/route.ts");
  assert.match(source,/getSessionActor\(request\)/u);
  assert.match(source,/getCraigRecordingForDownloadJob\(db,actor,id,importId\)/u);
  assert.match(source,/source_type='craig'/u);
  assert.match(source,/recap-track-speakers\//u);
  assert.match(source,/snapshot\.assignments\.find\(part=>part\.index===index\)/u);
  assert.match(source,/if\(!assignment/u);
  assert.match(source,/BUCKET\.head\(key\)/u);
  assert.match(source,/head\.size>MAX_GROQ_AUDIO_BYTES/u);
  assert.match(source,/head\.customMetadata\?\.filename/u);
  assert.match(source,/sniffCraigGroqFormat/u);
  assert.match(source,/length:32/u);
  assert.match(source,/format.mimeType/u);
  assert.match(source,/private, no-store/u);
  assert.match(source,/nosniff/u);
  assert.doesNotMatch(source,/raw\.dat\?key=|source_reference|apiKey|refresh_token|GROQ_API_KEY/u);
});

test("Craig importer only offers previously confirmed, extract-ready short tracks",async()=>{
  const source=await read("../app/campaigns/session-recap-groq-transcriber.tsx");
  assert.match(source,/data\.imports\.filter\(item=>item\.sourceType==="craig"&&item\.status==="ready"\)/u);
  assert.match(source,/craig-track-speakers/u);
  assert.match(source,/craig-manifest/u);
  assert.match(source,/byIndex\.get\(index\)/u);
  assert.match(source,/entry\.uncompressedBytes>maxBytes/u);
  assert.match(source,/craig-track-audio\?importId=/u);
  assert.ok(source.includes('setSpeakerId("");'));
  assert.match(source,/readDuration\(audio\)/u);
  assert.match(source,/Confirm the matching campaign speaker/u);
  assert.match(source,/approvedShare/u);
  assert.match(source,/approvedBilling/u);
});

test("actual container signature determines Groq-supported FLAC and MPEG-4 AAC",()=>{
  const flac=new Uint8Array(32);flac.set([102,76,97,67]);
  assert.deepEqual(sniffCraigGroqFormat("user.flac","audio/flac",flac),
    {extension:"flac",mimeType:"audio/flac"});
  assert.equal(sniffCraigGroqFormat("user.m4a","audio/aac",flac),null);
  const mp4=new Uint8Array(32);
  mp4.set([0,0,0,24,102,116,121,112,77,52,65,32]);
  assert.deepEqual(sniffCraigGroqFormat("user.aac","audio/aac",mp4),
    {extension:"m4a",mimeType:"audio/mp4"});
  assert.deepEqual(sniffCraigGroqFormat("user.m4a","audio/aac",mp4),
    {extension:"m4a",mimeType:"audio/mp4"});
  assert.equal(sniffCraigGroqFormat("user.flac","audio/aac",flac),null);
  assert.equal(sniffCraigGroqFormat("user.aac","audio/aac",new Uint8Array([255,241,80,128,0,0,0,0,0,0,0,0])),null);
  assert.equal(sniffCraigGroqFormat("user.mp3","audio/flac",flac),null);
});
