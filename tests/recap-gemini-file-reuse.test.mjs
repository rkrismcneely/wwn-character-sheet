import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {reusePreviouslyUploadedGeminiAudio} from "../lib/campaigns/recap-gemini-file-reuse.ts";

const BASE="https://generativelanguage.googleapis.com/v1beta/";
const job={
  id:"second-summary",campaignId:"campaign-one",recapId:"recap-one",
  audioAssetId:"same-original-drive-file",requestedBy:"owner-one",
};
const source={byteSize:234_567,mimeType:"audio/mpeg"};
const previous={
  id:"first-summary",fileName:"files/audio123456",
  fileUri:BASE+"files/audio123456",
};
function remote(overrides={}){
  return {
    name:previous.fileName,uri:previous.fileUri,
    displayName:"TWE recap "+previous.id,
    state:"ACTIVE",mimeType:"audio/mpeg",sizeBytes:String(source.byteSize),
    expirationTime:new Date(Date.now()+60*60_000).toISOString(),
    ...overrides,
  };
}
function makeDb(candidate=previous,{changes=1}={}){
  const calls=[];
  const db={prepare(sql){
    return {bind(...args){
      calls.push({sql,args});
      return {
        async first(){
          assert.match(sql,/SELECT id,file_name AS fileName,file_uri AS fileUri/u);
          return candidate;
        },
        async run(){
          assert.match(sql,/SET status='uploaded',file_uri=\?,file_name=\?/u);
          return {meta:{changes}};
        },
      };
    }};
  }};
  return {db,calls};
}
async function withFetch(mock,callback){
  const original=globalThis.fetch;
  globalThis.fetch=mock;
  try{return await callback();}
  finally{globalThis.fetch=original;}
}

test("a second detail level reuses an ACTIVE file with the current GM API key, no Drive transfer",async()=>{
  const {db,calls}=makeDb();
  const fetches=[];
  const reused=await withFetch(async(url,options)=>{
    fetches.push(url);
    assert.equal(url,BASE+previous.fileName);
    assert.equal(options.method,"GET");
    assert.equal(options.headers["x-goog-api-key"],"current-personal-key");
    assert.equal(options.redirect,"manual");
    return Response.json(remote());
  },()=>reusePreviouslyUploadedGeminiAudio(db,job,source,"current-personal-key"));
  assert.equal(reused,true);
  assert.deepEqual(fetches,[BASE+previous.fileName]);
  assert.equal(calls.length,2);
  assert.match(calls[0].sql,/campaign_id=\? AND recap_id=\? AND audio_asset_id=\? AND requested_by=\?/u);
  assert.match(calls[0].sql,/id!=\? AND confirmed_at IS NOT NULL/u);
  assert.match(calls[0].sql,/status IN \('ready','failed','needs_attention'\)/u);
  assert.deepEqual(calls[0].args,[
    job.campaignId,job.recapId,job.audioAssetId,job.requestedBy,job.id,
  ]);
  assert.match(calls[1].sql,/stage_url_ciphertext IS NULL AND stage_offset=0/u);
  assert.match(calls[1].sql,/status='transferring'/u);
  assert.match(calls[1].sql,/file_uri IS NULL AND file_name IS NULL/u);
  assert.deepEqual(calls[1].args.slice(0,3),[
    previous.fileUri,previous.fileName,source.byteSize,
  ]);
  assert.deepEqual(calls[1].args.slice(4),[
    job.id,job.campaignId,job.recapId,job.audioAssetId,job.requestedBy,
  ]);
});

test("expired or inaccessible files safely fall back to a fresh upload",async()=>{
  for(const response of [
    new Response(null,{status:404}),
    new Response(null,{status:410}),
    new Response(null,{status:403}),
    Response.json(remote({state:"FAILED"})),
    Response.json(remote({state:"PROCESSING"})),
    Response.json(remote({expirationTime:new Date(Date.now()+5*60_000).toISOString()})),
    Response.json(remote({expirationTime:"invalid"})),
  ]){
    const {db,calls}=makeDb();
    const reused=await withFetch(async()=>response,
      ()=>reusePreviouslyUploadedGeminiAudio(db,job,source,"new-gm-key"));
    assert.equal(reused,false);
    assert.equal(calls.length,1,"expired or inaccessible file must not be committed");
  }
});

test("a different file or malformed metadata cannot be substituted for the saved recording",async()=>{
  for(const data of [
    remote({name:"files/different"}),
    remote({uri:BASE+"files/different"}),
    remote({displayName:"TWE recap some-other-job"}),
    remote({sizeBytes:"777"}),
    remote({mimeType:"audio/wav"}),
    remote({expirationTime:42}),
  ]){
    const {db,calls}=makeDb();
    const reused=await withFetch(async()=>Response.json(data),
      ()=>reusePreviouslyUploadedGeminiAudio(db,job,source,"personal-key"));
    assert.equal(reused,false);
    assert.equal(calls.length,1);
  }
  for(const candidate of [
    null,
    {...previous,fileUri:"https://other.example/files/audio123456"},
    {...previous,fileName:"../../etc/passwd"},
  ]){
    const {db,calls}=makeDb(candidate);
    const reused=await withFetch(async()=>{throw Error("Must not contact Gemini");},
      ()=>reusePreviouslyUploadedGeminiAudio(db,job,source,"personal-key"));
    assert.equal(reused,false);
    assert.equal(calls.length,1);
  }
});

test("network problems and concurrent job changes never claim a reusable upload",async()=>{
  const noNetwork=makeDb();
  assert.equal(await withFetch(async()=>{throw Error("network");},
    ()=>reusePreviouslyUploadedGeminiAudio(noNetwork.db,job,source,"personal-key")),false);
  assert.equal(noNetwork.calls.length,1);
  const raced=makeDb(previous,{changes:0});
  assert.equal(await withFetch(async()=>Response.json(remote()),
    ()=>reusePreviouslyUploadedGeminiAudio(raced.db,job,source,"personal-key")),false);
  assert.equal(raced.calls.length,2);
});

test("runner checks reuse only before staging and keeps independent recap requests",async()=>{
  const runner=await readFile(new URL("../lib/campaigns/recap-only-runner.ts",import.meta.url),"utf8");
  assert.match(runner,/if\(job.status==="pending_upload"&&\s*await reusePreviouslyUploadedGeminiAudio\(env.DB,job,source,secret\)\)return;/u);
  assert.ok(runner.indexOf("await reusePreviouslyUploadedGeminiAudio")<
    runner.indexOf("await getGmDriveAccessToken"));
  assert.match(runner,/else if\(job.status==="transferring"\)/u);
  assert.match(runner,/background:true,store:true/u);
});
