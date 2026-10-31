import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { GeminiAmbiguousResult,pollGeminiInteraction,
  submitVerifiedGeminiAudio } from "../lib/campaigns/recap-gemini-provider-runner.ts";
import { runGeminiScheduledTick } from "../lib/campaigns/recap-gemini-scheduler.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const KEY="AIzaSyTEST_PRIVATE_KEY_FOR_GM_ACCOUNT_123456";
const ID="v1_TWEInteractionExample_123456789";
const completed={
  id:ID,status:"completed",steps:[{type:"model_output",content:[{type:"text",
    annotations:[{type:"word_info",text:"Well",start_offset:"0.200s",end_offset:"0.500s"},
      {type:"word_info",text:"met!",start_offset:"0.600s",end_offset:"1.100s"}]}]}],
};
test("feature disabled means zero DB queries, Google calls or AI usage",async()=>{
  let touched=false;
  await runGeminiScheduledTick({RECAP_GEMINI_BACKGROUND_ENABLED:undefined,
    DB:{prepare(){touched=true;throw new Error("DB touched");}}});
  assert.equal(touched,false);
});
test("Gemini interaction polling uses only recorded ID, no audio reupload",async()=>{
  const saved=globalThis.fetch;
  const called=[];
  globalThis.fetch=async (url,init)=>{
    called.push({url,method:init?.method});
    return Response.json(completed,{status:200});
  };
  try{
    const outcome=await pollGeminiInteraction({key:KEY,id:ID,startMs:180000,durationMs:30000});
    assert.equal(outcome.kind,"complete");
    assert.deepEqual(outcome.cues.map(x=>x.text),["Well met!"]);
    assert.deepEqual(outcome.cues.map(x=>x.startMs),[180200]);
    assert.equal(called.length,1);
    assert.equal(called[0].method,"GET");
    assert.match(called[0].url,/\/v1beta\/interactions\/v1_TWEInteractionExample_123456789$/u);
    assert.doesNotMatch(called[0].url,/upload|files/u);
  }finally{globalThis.fetch=saved;}
});
test("pending interaction IDs are preserved, not treated as completed",async()=>{
  const saved=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:ID,status:"in_progress"});
  try{
    const outcome=await pollGeminiInteraction({key:KEY,id:ID,startMs:0,durationMs:30000});
    assert.deepEqual(outcome,{kind:"pending",id:ID});
  }finally{globalThis.fetch=saved;}
});
test("Gemini POST is single-shot and cannot blindly retry after ambiguous output",async()=>{
  const saved=globalThis.fetch;
  let calls=0;
  const bytes=new Uint8Array(200);
  globalThis.fetch=async (url)=>{
    calls++;
    if(calls===1)return new Response(null,{status:200,headers:{
      "x-goog-upload-url":"https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=ok"}});
    if(calls===2)return Response.json({file:{uri:"https://generativelanguage.googleapis.com/v1beta/files/ok"}});
    if(calls===3)return Response.json({id:ID,status:"in_progress"});
    throw new Error("Unexpected extra provider request.");
  };
  try{
    const value=await submitVerifiedGeminiAudio({key:KEY,bytes,startMs:0,durationMs:5000});
    assert.deepEqual(value,{kind:"pending",id:ID});
    assert.equal(calls,3);
  }finally{globalThis.fetch=saved;}
});
test("Gemini malformed post-response causes an ambiguous outcome, never resubmit",async()=>{
  const saved=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    if(calls===1)return new Response(null,{status:200,headers:{
      "x-goog-upload-url":"https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=ok"}});
    if(calls===2)return Response.json({file:{uri:"https://generativelanguage.googleapis.com/v1beta/files/ok"}});
    return Response.json({unexpected:"garbled"}, {status:200});
  };
  try{
    await assert.rejects(submitVerifiedGeminiAudio({
      key:KEY,bytes:new Uint8Array(200),startMs:0,durationMs:5000,
    }),error=>error instanceof GeminiAmbiguousResult);
    assert.equal(calls,3);
  }finally{globalThis.fetch=saved;}
});
test("scheduled wiring is fail closed on free quota and cost capped for GM-owned paid project",async()=>{
  const [scheduler,lease,worker,wrangler,migration,schema]=await Promise.all([
    read("../lib/campaigns/recap-gemini-scheduler.ts"),
    read("../lib/campaigns/recap-gemini-leases.ts"),
    read("../worker/index.ts"),
    read("../wrangler.jsonc"),
    read("../drizzle/0044_recap_gemini_interaction_polls.sql"),
    read("../db/schema.ts"),
  ]);
  for(const v of ["RECAP_GEMINI_BACKGROUND_ENABLED",'!=="true"',"freeQuotaVerified:false",
    "readVerifiedGmGeminiClip","decryptGeminiUserKey","leaseOnePreparedGeminiChunk",
    "quarantineExpiredGeminiLeases","provider_interaction_id","pollGeminiInteraction",
    "submitVerifiedGeminiAudio","spent_cost_microusd+?",
    "awaiting_review","FRAGMENT","saveFragment",
    "provider_poll_after","status='submitted'"]){
    assert.ok(scheduler.includes(v),"Missing runner safety property: "+v);
  }
  assert.match(lease,/spentCostMicrousd\+conservativeMicrousd>item\.maxCostMicrousd/u);
  assert.match(worker,/async scheduled\(/u);
  assert.match(worker,/runGeminiScheduledTick/u);
  assert.match(wrangler,/"crons": \["\*\/5 \* \* \* \*"\]/u);
  assert.match(migration,/ADD COLUMN provider_interaction_id/u);
  assert.match(schema,/providerInteractionId: text\("provider_interaction_id"\)/u);
  assert.doesNotMatch(scheduler,/env\.AI|@cf\/openai\/whisper|SITE_OWNER_GEMINI_API_KEY|process\.env\.GEMINI_API_KEY/u);
});
