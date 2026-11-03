import assert from "node:assert/strict";
import test from "node:test";
import {encryptGeminiUserKey} from "../lib/account/recap-gemini-key.ts";
import {confirmedTransientGeminiError,recoveryDueAt,AUTO_RETRY_MARKER,AUTO_RETRY_WAIT_MS}
  from "../lib/campaigns/recap-gemini-auto-retry-policy.ts";
import {runVerifiedGeminiRecapRecoveryTick}
  from "../lib/campaigns/recap-gemini-auto-recovery.ts";
import {readFile} from "node:fs/promises";

test("only verified terminal Gemini service errors qualify for one automatic retry",()=>{
  for(const code of ["internal","internal_error","api_error","service_unavailable"])
    assert.equal(confirmedTransientGeminiError({status:"failed",errors:[{code}]}),true);
  for(const code of ["resource_exhausted","quota_exceeded","invalid_argument","safety_blocked"])
    assert.equal(confirmedTransientGeminiError({status:"failed",errors:[{code}]}),false);
  for(const status of ["in_progress","completed","requires_action","unknown"])
    assert.equal(confirmedTransientGeminiError({status,errors:[{code:"internal"}]}),false);
  assert.equal(confirmedTransientGeminiError({status:"failed"}),false);
  assert.equal(AUTO_RETRY_WAIT_MS,20*60_000);
  assert.equal(recoveryDueAt("2026-11-02T20:00:00.000Z"),"2026-11-02T20:20:00.000Z");
});
function dbMock(candidate,connection){
  const updates=[],calls=[];
  const db={
    prepare(sql){
      return {
        bind(...args){
          return {
            async all(){
              if(sql.includes("JOIN campaign_recap_audio_summary_segments"))
                return {results:candidate?[candidate]:[]};
              throw Error("Unexpected all: "+sql);
            },
            async first(){
              if(sql.includes("FROM campaign_recap_audio_assets"))return {ok:1};
              if(sql.includes("FROM user_recap_ai_connections"))return connection;
              throw Error("Unexpected first: "+sql);
            },
            async run(){
              updates.push({sql,args});
              return {meta:{changes:1}};
            },
          };
        },
      };
    },
    async batch(statements){calls.push("batch");return Promise.all(statements.map(q=>q.run()));},
  };
  return {db,updates,calls};
}
const candidate={
  jobId:"job-1",partId:"part-1",interactionId:"inter_123456",
  userId:"gm-test",campaignId:"campaign",recapId:"recap",audioAssetId:"audio-asset",
  errorCode:null,fileName:"files/abc12345",fileUri:"https://example.invalid/temp-audio",
};
const connectionId="00000000-0000-4000-8000-000000000001";
test("verified temporary failure requeues ONLY one saved section after cooldown, without Gemini POST",async()=>{
  const config={RECAP_STORAGE_ENCRYPTION_KEY:Buffer.alloc(32,11).toString("base64url")};
  const sealed=await encryptGeminiUserKey(config,"gm-test",connectionId,"test-provider-key-without-spaces");
  const {db,updates,calls}=dbMock(candidate,{id:connectionId,
    ciphertext:sealed.ciphertext,nonce:sealed.nonce,version:sealed.version});
  const original=globalThis.fetch;
  const requests=[];
  try{
    globalThis.fetch=async(url,init)=>{
      requests.push({url:String(url),method:init.method});
      if(String(url).includes("/interactions/"))
        return Response.json({status:"failed",errors:[{code:"internal"}]});
      if(String(url).includes("/files/"))
        return Response.json({state:"ACTIVE"});
      throw Error("Unexpected provider call");
    };
    await runVerifiedGeminiRecapRecoveryTick({...config,DB:db});
    assert.equal(calls.length,1);
    assert.deepEqual(requests.map(v=>v.method),["GET","GET"]);
    assert.equal(updates.length,2);
    assert.equal(updates[0].args[0],"uploaded");
    assert.equal(updates[0].args[1],AUTO_RETRY_MARKER);
    assert.equal(updates[1].args[1],updates[0].args[8]);
    assert.ok(Date.parse(updates[1].args[0])>Date.parse(updates[1].args[1]));
  }finally{globalThis.fetch=original;}
});
test("uncertain or quota failures do not schedule more audio analysis",async()=>{
  const config={RECAP_STORAGE_ENCRYPTION_KEY:Buffer.alloc(32,11).toString("base64url")};
  const sealed=await encryptGeminiUserKey(config,"gm-test",connectionId,"test-provider-key-without-spaces");
  for(const provider of [{status:"in_progress"},{status:"failed",errors:[{code:"resource_exhausted"}]}]){
    const {db,calls}=dbMock(candidate,{id:connectionId,
      ciphertext:sealed.ciphertext,nonce:sealed.nonce,version:sealed.version});
    const original=globalThis.fetch;
    try{
      globalThis.fetch=async()=>Response.json(provider);
      await runVerifiedGeminiRecapRecoveryTick({...config,DB:db});
      assert.equal(calls.length,0);
    }finally{globalThis.fetch=original;}
  }
});
test("a second confirmed failure stops the automatic loop and enables manual investigation",async()=>{
  const {db,updates,calls}=dbMock({...candidate,errorCode:AUTO_RETRY_MARKER},null);
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw Error("No Gemini calls for exhausted retries");};
    await runVerifiedGeminiRecapRecoveryTick({DB:db});
    assert.equal(calls.length,0);
    assert.equal(updates.length,1);
    assert.match(updates[0].sql,/manual_retry_after_confirmed_failure/u);
  }finally{globalThis.fetch=original;}
});
test("worker cron invokes recovery, while single-recording planning avoids M4A remux",async()=>{
  const worker=await readFile(new URL("../worker/index.ts",import.meta.url),"utf8");
  const ui=await readFile(new URL("../app/campaigns/session-recap-auto-status.tsx",import.meta.url),"utf8");
  assert.match(worker,/runVerifiedGeminiRecapRecoveryTick/u);
  assert.match(ui,/durationMs>LONG_AUDIO_THRESHOLD_MS/u);
  assert.match(ui,/durationMs<=LONG_AUDIO_THRESHOLD_MS\|\|m4aPlan.length<2/u);
  assert.match(ui,/one delayed retry of a confirmed Gemini service failure/u);
});
