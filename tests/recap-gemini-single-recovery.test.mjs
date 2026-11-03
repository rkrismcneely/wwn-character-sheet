import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {encryptGeminiUserKey} from "../lib/account/recap-gemini-key.ts";
import {runVerifiedSingleAudioRecoveryTick}
  from "../lib/campaigns/recap-gemini-single-recovery.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const base={
  id:"job-123",campaignId:"campaign-123",recapId:"recap-123",userId:"gm-test",
  audioAssetId:"asset-123",interactionId:"inter_123456",
  fileName:"files/recording123",fileUri:"https://generativelanguage.googleapis.com/v1beta/files/recording123",
};
const connectionId="00000000-0000-4000-8000-000000000001";
const config={RECAP_STORAGE_ENCRYPTION_KEY:Buffer.alloc(32,42).toString("base64url")};
async function credentials(){
  const stored=await encryptGeminiUserKey(config,"gm-test",connectionId,
    "my-gemini-test-key-only-not-usable");
  return {id:connectionId,...stored};
}
function mockDb({job=base,hasSchema=true,asset=true,connection=null,changes=1}={}){
  const statements=[],calls=[];
  return {
    statements,calls,
    db:{
      prepare(sql){
        calls.push(sql);
        return {
          async all(){
            if(sql.startsWith("PRAGMA table_info"))
              return {results:hasSchema?[
                {name:"auto_retry_opt_in"},{name:"single_audio_retry_count"},
                {name:"audio_analysis_model"},{name:"audio_retry_not_before"}]:[]};
            if(sql.includes("FROM campaign_recap_audio_summary_jobs"))
              return {results:job?[job]:[]};
            throw Error("Unexpected unbound query "+sql);
          },
          bind(...args){
            return {
              async first(){
                if(sql.includes("FROM campaign_recap_audio_assets"))
                  return asset?{mimeType:"audio/mp4",byteSize:12345678}:null;
                if(sql.includes("FROM user_recap_ai_connections"))return connection;
                throw Error("Unexpected first "+sql);
              },
              async run(){
                statements.push({sql,args});
                return {meta:{changes}};
              },
            };
          },
        };
      },
    },
  };
}
test("single-file Gemini INTERNAL failure reschedules existing upload with an alternate model",async()=>{
  const {db,statements,calls}=mockDb({connection:await credentials()});
  const requests=[],saved=globalThis.fetch;
  try{
    globalThis.fetch=async(url,init)=>{
      requests.push({url:String(url),method:init.method});
      if(String(url).includes("/interactions/"))
        return Response.json({status:"failed",errors:[{code:"internal"}]});
      if(String(url).includes("/files/"))
        return Response.json({name:base.fileName,uri:base.fileUri,
          sizeBytes:12345678,mimeType:"audio/m4a",state:"ACTIVE"});
      throw Error("Unexpected request");
    };
    await runVerifiedSingleAudioRecoveryTick({...config,DB:db});
    assert.deepEqual(requests.map(req=>req.method),["GET","GET"],
      "Recovery verifier must never POST to Gemini.");
    assert.equal(statements.length,1);
    const entry=statements[0];
    assert.match(entry.sql,/single_audio_retry_count=1/u);
    assert.match(entry.sql,/single_audio_retry_count=0/u);
    assert.match(entry.sql,/auto_retry_opt_in=1/u);
    assert.match(entry.sql,/interaction_id=\?/u);
    assert.equal(entry.args[0],"uploaded");
    assert.equal(entry.args[1],"gemini-3.6-flash");
    assert.ok(Date.parse(entry.args[2])>Date.now()+10*60_000);
    assert.equal(entry.args[3],0);
    assert.ok(calls.some(q=>q.includes("processing_mode='single'")));
  }finally{globalThis.fetch=saved;}
});
test("expired Gemini temporary audio re-stages from the GM's original Drive file",async()=>{
  const {db,statements}=mockDb({connection:await credentials()});
  const saved=globalThis.fetch;
  try{
    globalThis.fetch=async(url)=>{
      if(String(url).includes("/interactions/"))
        return Response.json({status:"failed",errors:[{code:"internal"}]});
      return new Response("",{status:404});
    };
    await runVerifiedSingleAudioRecoveryTick({...config,DB:db});
    assert.equal(statements.length,1);
    assert.equal(statements[0].args[0],"pending_upload");
    assert.equal(statements[0].args[3],1);
  }finally{globalThis.fetch=saved;}
});
test("quota, uncertain and running Gemini interactions never trigger replays",async()=>{
  const connection=await credentials();
  const states=[
    {status:"in_progress",errors:[{code:"internal"}]},
    {status:"failed",errors:[{code:"resource_exhausted"}]},
    {status:"failed",errors:[{code:"invalid_argument"}]},
    {status:"failed",errors:[{code:"permission_denied"}]},
    {status:"failed"},
  ];
  for(const provider of states){
    const {db,statements}=mockDb({connection});
    const saved=globalThis.fetch;
    try{
      globalThis.fetch=async()=>Response.json(provider);
      await runVerifiedSingleAudioRecoveryTick({...config,DB:db});
      assert.equal(statements.length,0,JSON.stringify(provider));
    }finally{globalThis.fetch=saved;}
  }
});
test("missing migration or GM credential disables automatic recovery",async()=>{
  const missing=mockDb({hasSchema:false});
  await runVerifiedSingleAudioRecoveryTick({DB:missing.db});
  assert.equal(missing.calls.length,1);
  const {db,statements}=mockDb();
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{throw Error("Should not reach provider");};
    await runVerifiedSingleAudioRecoveryTick({DB:db});
    assert.equal(statements.length,0);
  }finally{globalThis.fetch=original;}
});
test("single-file Gemini retry path is durable, consent-gated and used only for audio",async()=>{
  const [runner,worker,sql,migration,ui,route]=await Promise.all([
    read("lib/campaigns/recap-only-runner.ts"),read("worker/index.ts"),
    read("drizzle/0058_recap_single_audio_recovery.sql"),
    read("scripts/migrate-recap-writer.mjs"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
  ]);
  assert.match(sql,/single_audio_retry_count INTEGER NOT NULL DEFAULT 0/u);
  assert.match(sql,/audio_retry_not_before TEXT/u);
  assert.match(migration,/0058_recap_single_audio_recovery.sql/u);
  assert.match(worker,/runVerifiedSingleAudioRecoveryTick/u);
  assert.match(runner,/audio_retry_not_before<=\?/u);
  assert.match(runner,/model:job.audioAnalysisModel==="gemini-3.6-flash"/u);
  assert.match(runner,/model:RECAP_ONLY_MODEL,background:true/u,
    "Text-only Gemini writing remains on the default model.");
  assert.match(ui,/The alternate Gemini model also failed/u);
  assert.match(route,/audio_analysis_model AS audioAnalysisModel/u);
});
