import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {releaseRecapTransferSlice} from "../lib/campaigns/recap-only-runner.ts";
import {RECAP_STAGING_CHUNK_BYTES,RECAP_STAGING_CHUNKS_PER_TICK}
  from "../lib/campaigns/recap-gemini-chunked-staging.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const lease="2026-10-31T20:58:19.000Z";
const id="99b86e3f-d410-4d2a-82e9-28fe02263381";
function storage({claim=lease,offset=24*1024*1024,status="transferring"}={}){
  let state={claim,offset,status};
  const calls=[];
  const db={prepare(sql){
    return {bind(...args){return {async run(){
      calls.push({sql,args});
      assert.match(sql,/SET claimed_at=NULL,updated_at=\?/u);
      assert.match(sql,/claimed_at=\? AND stage_offset=\?/u);
      const [timestamp,jobId,requiredLease,requiredOffset]=args;
      assert.equal(jobId,id);
      assert.ok(Number.isFinite(Date.parse(timestamp)));
      if(state.status==="transferring"&&state.claim===requiredLease&&
        state.offset===requiredOffset){
        state={...state,claim:null};
        return {meta:{changes:1}};
      }
      return {meta:{changes:0}};
    }};}};}
  }};
  return {db,calls,get state(){return state;}};
}

test("checkpointed Gemini transfer releases exactly its own lease for next scheduled run",async()=>{
  const store=storage();
  assert.equal(await releaseRecapTransferSlice(store.db,id,lease,24*1024*1024),true);
  assert.equal(store.state.claim,null);
  assert.equal(store.state.offset,24*1024*1024);
  assert.equal(store.state.status,"transferring");
});

test("lease release never erases newer ownership or an unconfirmed/stale checkpoint",async()=>{
  for(const initial of [
    {claim:"2026-10-31T20:59:19.000Z"},
    {offset:16*1024*1024},
    {status:"uploaded"},
    {status:"needs_attention"},
  ]){
    const store=storage(initial);
    assert.equal(await releaseRecapTransferSlice(store.db,id,lease,24*1024*1024),false);
    assert.notEqual(store.state.claim,null);
  }
});

test("one-minute cron resumes yielded chunks without waiting for crash recovery",async()=>{
  const [wrangler,runner,staging,worker]=await Promise.all([
    read("wrangler.jsonc"),
    read("lib/campaigns/recap-only-runner.ts"),
    read("lib/campaigns/recap-gemini-chunked-staging.ts"),
    read("worker/index.ts"),
  ]);
  assert.deepEqual(JSON.parse(wrangler).triggers.crons,["* * * * *"]);
  assert.equal(RECAP_STAGING_CHUNK_BYTES,8*1024*1024);
  assert.equal(RECAP_STAGING_CHUNKS_PER_TICK,3);
  assert.match(runner,/if\(!slice\.done\)/u);
  assert.match(runner,/releaseRecapTransferSlice\(env.DB,job.id,claimTime,slice.bytes\)/u);
  assert.match(runner,/status='transferring' AND \(claimed_at IS NULL OR claimed_at<\?\)/u);
  assert.match(runner,/AND \(\(claimed_at IS NULL AND \? IS NULL\) OR claimed_at=\?\)/u);
  assert.match(runner,/Date.now\(\)-90_000/u);
  assert.match(staging,/AND stage_offset=\?/u);
  assert.match(worker,/runRecapOnlyScheduledTick/u);
  assert.match(worker,/runGeminiScheduledTick/u);
});

test("a 125.5 MiB file remains chunked and resumable, and does not consume extra model requests",async()=>{
  const size=125.5*1024*1024;
  const perTick=RECAP_STAGING_CHUNK_BYTES*RECAP_STAGING_CHUNKS_PER_TICK;
  assert.equal(Math.ceil(size/perTick),6);
  const runner=await read("lib/campaigns/recap-only-runner.ts");
  assert.match(runner,/if\(job.status==="pending_upload"&&/u);
  assert.match(runner,/background:true,store:true/u);
  assert.match(runner,/else if\(job.status==="uploaded"\)await submit/u);
});
