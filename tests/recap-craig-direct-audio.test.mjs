import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
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
  assert.match(source,/audio\/flac/u);
  assert.match(source,/audio\/mp4/u);
  assert.match(source,/\.aac is not a Groq-supported/u);
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
  assert.match(source,/entry\.uncompressedBytes>MAX_GROQ_AUDIO_BYTES/u);
  assert.match(source,/craig-track-audio\?importId=/u);
  assert.ok(source.includes('setSpeakerId("");'));
  assert.match(source,/readDuration\(audio\)/u);
  assert.match(source,/Confirm the matching campaign speaker/u);
  assert.match(source,/approvedShare/u);
  assert.match(source,/approvedBilling/u);
});
