import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const stagePath="lib/campaigns/recap-staged-audio.ts";
const clientPath="lib/campaigns/recap-staged-upload-client.ts";

test("audio is sent from browser in bounded 512 KiB requests rather than one multipart upload",async()=>{
  const [client,transcriber]=await Promise.all([
    read(clientPath),read("app/campaigns/session-recap-staged-transcriber.tsx"),
  ]);
  assert.match(client,/const CHUNK_BYTES=512\*1024/u);
  assert.match(client,/file\.slice\(start,Math\.min\(start\+CHUNK_BYTES,file\.size\)\)/u);
  assert.match(client,/operation=chunk/u);
  assert.match(client,/content-type":"application\/octet-stream"/u);
  assert.match(client,/operation=finalize/u);
  assert.match(client,/headers:\{"content-type":"application\/json"\}/u);
  assert.match(transcriber,/submitStagedCloudClip\(/u);
  assert.match(transcriber,/base\+"\/staged\/"\+provider/u);
  assert.doesNotMatch(transcriber,/form\.set\("file"/u);
});

test("staging is restricted to authenticated active-campaign GMs and same-origin requests",async()=>{
  const stage=await read(stagePath);
  for(const expected of [
    /getSessionActor\(request\)/u,
    /canManageCampaignContent\(actor,access\.campaign,access\.membership\)/u,
    /requireActiveCampaign\(access\.campaign\)/u,
    /origin!==url\.origin/u,
    /request\.headers\.get\("sec-fetch-site"\)==="cross-site"/u,
    /getCampaignSessionRecap\(db,actor,campaignId/u,
    /const MAX_CHUNK=512\*1024/u,
    /if\(received>MAX_CHUNK\)/u,
    /await bucket\.put\(key,chunk/u,
    /actor\.userId,receipt,index/u,
  ])assert.match(stage,expected);
});

test("only exact transcription staging routes bypass generic Worker parser",async()=>{
  const worker=await read("worker/index.ts");
  assert.ok(worker.includes(String.raw`session-recaps\\/transcript\\/staged\\/`));
  assert.match(worker,/request\.method==="POST"&&stagedClip/u);
  assert.match(worker,/handleStagedRecapAudio\(request,stagedClip\[1\]/u);
  assert.ok(worker.indexOf("handleStagedRecapAudio(request")<worker.indexOf("await handler.fetch(request, env, ctx)"));
});

test("the server verifies reassembled clip size and checksum before any external AI call",async()=>{
  const stage=await read(stagePath);
  assert.match(stage,/await bucket\.get\(names\[i\]\)/u);
  assert.match(stage,/totalBytes!==body\.byteSize/u);
  assert.match(stage,/recapCloudClipReceipt\(fileBytes,provider/u);
  assert.match(stage,/if\(computed!==receipt\)return reply/u);
  assert.match(stage,/handleGeminiRequest\(internal,\{params:Promise\.resolve\(\{id:campaignId\}\)\},form\)/u);
  assert.match(stage,/handleGroqRequest\(internal,\{params:Promise\.resolve\(\{id:campaignId\}\)\},form\)/u);
  assert.doesNotMatch(stage,/method:"POST",headers,body:form/u);
  for(const path of [
    "app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts",
  ]){
    const provider=await read(path);
    assert.match(provider,/stagedForm\?\?await request\.formData\(\)/u);
    assert.match(provider,/getSessionActor\(request\)/u);
    assert.match(provider,/approvedShare/u);
    assert.match(provider,/approvedBilling/u);
    assert.match(provider,/recapCloudClipReceipt/u);
  }
});

test("transient audio is deleted after provider invocation and old abandoned chunks expire",async()=>{
  const [stage,worker]=await Promise.all([read(stagePath),read("worker/index.ts")]);
  assert.match(stage,/for\(const key of names\)await bucket\.delete\(key\)\.catch/u);
  assert.match(stage,/Date\.now\(\)-24\*60\*60\*1000/u);
  assert.match(stage,/prefix:"recap-staged-audio\/",limit:200/u);
  assert.match(stage,/if\(removed>=50\)break/u);
  assert.match(worker,/cleanupExpiredStagedRecapAudio\(env\.BUCKET\)/u);
});

test("staging never auto-invokes provider on chunk transfer or lacks explicit user consent",async()=>{
  const [stage,client]=await Promise.all([read(stagePath),read(clientPath)]);
  const branch=stage.slice(stage.indexOf('if(url.searchParams.get("operation")==="chunk")'),
    stage.indexOf('if(url.searchParams.get("operation")!=="finalize")'));
  assert.doesNotMatch(branch,/handleGeminiRequest|handleGroqRequest/u);
  assert.match(stage,/body\.approvedShare!==true\|\|body\.approvedBilling!==true/u);
  assert.match(client,/No Gemini or Groq request was started/u);
  assert.match(client,/return readRecapClipSubmitResponse\(response,1\)/u);
});
