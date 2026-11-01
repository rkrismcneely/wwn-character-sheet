import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {encryptGeminiUserKey} from "../lib/account/recap-gemini-key.ts";
import {retryFailedRecapSection} from "../lib/campaigns/recap-section-recovery.ts";
import {geminiAudioMime} from "../lib/campaigns/recap-gemini-audio-mime.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const id="30c19cef-bf35-4170-8aaa-1a4e9d8036d4";
const envKey=Buffer.alloc(32,34).toString("base64url");
const input={jobId:id,campaignId:"campaign",recapId:"recap",userId:"gm"};
const partId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const interactionId="gemini_failed_section_123";
const fileName="files/validSection";
const fileUri="https://generativelanguage.googleapis.com/v1beta/files/validSection";
const ownerId="da0bb000-bbbb-4ccc-8ddd-eeeeeeeeeeee";
function fakeDb(credential,{jobStatus="needs_attention",partStatus="submitted",
  partError=null,parentError="segment_interaction_failed",canRead=true}={}){
  const statements=[],writes=[];
  const db={
    prepare(sql){
      return {bind(...args){
        statements.push({sql,args});
        return {
          async first(){
            if(sql.includes("FROM campaign_recap_audio_summary_jobs "))
              return {id,audioAssetId:"audio",status:jobStatus,errorCode:parentError,processingMode:"segmented"};
            if(sql.includes("FROM campaign_recap_audio_assets"))return canRead?{ok:1}:null;
            if(sql.includes("FROM user_recap_ai_connections"))return credential;
            throw Error("Unexpected first(): "+sql);
          },
          async all(){
            if(sql.includes("FROM campaign_recap_audio_summary_segments"))
              return {results:[{id:partId,status:partStatus,interactionId,
                fileUri,fileName,errorCode:partError}]};
            throw Error("Unexpected all(): "+sql);
          },
        };
      }};
    },
    async batch(batch){
      writes.push(...batch);
      return batch.map(()=>({meta:{changes:1}}));
    },
  };
  return {db,statements,writes};
}
async function setup(overrides={}){
  const credential={
    id:ownerId,...await encryptGeminiUserKey(
      {RECAP_STORAGE_ENCRYPTION_KEY:envKey},input.userId,ownerId,"fake-key-for-tests-123456789",
    ),version:1,
  };
  return fakeDb(credential,overrides);
}

test("Gemini M4A MIME is normalized on both resumable upload and section interaction",async()=>{
  const [staging,section]=await Promise.all([
    read("lib/campaigns/recap-gemini-chunked-staging.ts"),
    read("lib/campaigns/recap-long-audio-runner.ts"),
  ]);
  assert.equal(geminiAudioMime("audio/mp4"),"audio/m4a");
  assert.equal(geminiAudioMime("audio/x-m4a"),"audio/m4a");
  assert.match(staging,/geminiAudioMime\(src\.mimeType\)/u);
  assert.match(section,/mime_type:geminiAudioMime\(part\.mimeType\)/u);
  assert.doesNotMatch(section,/mime_type:part\.mimeType[},]/u);
});

test("explicit retry confirms original failure, reuses current file and never posts from request handler",async()=>{
  const {db,statements,writes}=await setup();
  const original=globalThis.fetch,seen=[];
  globalThis.fetch=async(url,init)=>{
    seen.push({url,method:init.method});
    if(String(url).includes("/interactions/"))
      return Response.json({status:"failed",errors:[{code:"invalid_request"}]});
    if(String(url).endsWith(fileName))return Response.json({state:"ACTIVE"});
    throw Error("Unknown URL "+url);
  };
  try{
    const outcome=await retryFailedRecapSection({DB:db,RECAP_STORAGE_ENCRYPTION_KEY:envKey},input);
    assert.deepEqual(outcome,{resumed:true,status:"uploaded"});
    assert.equal(seen.length,2);
    assert.deepEqual(seen.map(s=>s.method),["GET","GET"]);
    assert.equal(writes.length,2);
    const child=statements.find(s=>s.sql.includes("SET status=?,interaction_id=NULL"));
    assert.ok(child);
    assert.equal(child.args[0],"uploaded");
    assert.match(child.sql,/error_code='manual_retry_after_confirmed_failure'/u);
    assert.match(child.sql,/interaction_id=\? AND error_code IS NULL/u);
    const parent=statements.find(s=>s.sql.includes("SET status='transferring'"));
    assert.ok(parent);
    assert.match(parent.sql,/requested_by=\?/u);
    assert.match(parent.sql,/status='needs_attention' AND error_code='segment_interaction_failed'/u);
  }finally{globalThis.fetch=original;}
});

test("expired temporary audio restages only failed section from original recording",async()=>{
  const {db,statements,writes}=await setup();
  const original=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes("/interactions/")?
    Response.json({status:"failed"}):Response.json({error:"expired"},{status:404});
  try{
    assert.deepEqual(await retryFailedRecapSection({DB:db,RECAP_STORAGE_ENCRYPTION_KEY:envKey},input),
      {resumed:true,status:"pending_upload"});
    assert.equal(writes.length,2);
    const child=statements.find(s=>s.sql.includes("SET status=?,interaction_id=NULL"));
    assert.deepEqual(child.args.slice(0,7),["pending_upload",1,1,1,1,1,1]);
    assert.match(child.sql,/stage_offset=CASE WHEN \? THEN 0/u);
  }finally{globalThis.fetch=original;}
});

test("never resubmit an active, completed, unverifiable or already-retired interaction",async()=>{
  for(const status of ["in_progress","completed","requires_action"]){
    const {db,writes}=await setup();
    const original=globalThis.fetch;
    globalThis.fetch=async()=>Response.json({status});
    try{
      await assert.rejects(()=>retryFailedRecapSection({DB:db,RECAP_STORAGE_ENCRYPTION_KEY:envKey},input),
        /terminal failed interaction/u);
      assert.equal(writes.length,0);
    }finally{globalThis.fetch=original;}
  }
  for(const bad of [{partError:"manual_retry_after_confirmed_failure"},{jobStatus:"ready"},
    {parentError:"interaction_failed"},{canRead:false}]){
    const {db,writes}=await setup(bad);
    await assert.rejects(()=>retryFailedRecapSection({DB:db,RECAP_STORAGE_ENCRYPTION_KEY:envKey},input));
    assert.equal(writes.length,0);
  }
  const {db,writes}=await setup();
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({error:"not_found"},{status:404});
  try{
    await assert.rejects(()=>retryFailedRecapSection({DB:db,RECAP_STORAGE_ENCRYPTION_KEY:envKey},input),
      /no longer retains/u);
    assert.equal(writes.length,0);
  }finally{globalThis.fetch=original;}
});

test("failed section diagnosis is GM-scoped and limited to read-only original Gemini interaction",async()=>{
  const [diagnose,route,ui,progress]=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/auto-recap/diagnose/route.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-progress.tsx"),
  ]);
  assert.match(diagnose,/segment_interaction_failed/u);
  assert.match(diagnose,/WHERE job_id=\? AND status='submitted' AND interaction_id IS NOT NULL/u);
  assert.match(diagnose,/requested_by=\? AND confirmed_at IS NOT NULL/u);
  assert.match(diagnose,/summarizeRecapGeminiFailure\(detail\)/u);
  assert.match(diagnose,/method:"GET"/u);
  assert.doesNotMatch(diagnose,/method:"POST"[^\n]*fetch\(/u);
  assert.match(route,/retryFailedRecapSection/u);
  assert.match(route,/retryApproved!==true/u);
  assert.match(ui,/Retry failed section only/u);
  assert.match(ui,/diagnosedJob\.current===newest\.id/u);
  assert.match(progress,/analysisFailure/u);
  assert.match(progress,/!analysisFailure/u);
});
