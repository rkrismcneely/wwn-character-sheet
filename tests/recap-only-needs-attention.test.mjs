import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {safeRecapRetryTarget,recapAttentionText} from "../lib/campaigns/recap-only-recovery.ts";
import {retrySafeRecapPreparation} from "../lib/campaigns/recap-only-jobs.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

const failed={status:"needs_attention",errorCode:"provider_or_storage_error",
  fileUri:null,fileName:null,interactionId:null};
test("only pre-submission errors can resume; an uncertain Gemini submission is never automatically retried",()=>{
  assert.equal(safeRecapRetryTarget(failed),"pending_upload");
  assert.equal(safeRecapRetryTarget({...failed,fileUri:"files/secret",fileName:"files/asset"}),"uploaded");
  assert.equal(safeRecapRetryTarget({...failed,errorCode:"transfer_stalled"}),"pending_upload");
  assert.equal(safeRecapRetryTarget({...failed,errorCode:"incomplete_transfer_or_submission"}),"pending_upload");
  for(const code of ["submission_uncertain","submission_id_missing","unexpected"]){
    assert.equal(safeRecapRetryTarget({...failed,errorCode:code}),null);
  }
  assert.equal(safeRecapRetryTarget({...failed,errorCode:"incomplete_transfer_or_submission",
    fileUri:"files/existing",fileName:"files/existing"}),null);
  assert.equal(safeRecapRetryTarget({...failed,interactionId:"already-submitted"}),null);
  assert.equal(safeRecapRetryTarget({...failed,status:"ready"}),null);
  assert.ok(recapAttentionText.provider_or_storage_error.description.includes("original recording"));
  assert.ok(recapAttentionText.submission_uncertain.action.includes("Do not resubmit"));
});

function mockDatabase(job=failed,{connected=true,source=true,published=0,updateChanges=1}={}){
  const statements=[];
  return {statements,prepare(sql){
    return {bind(...args){
      statements.push({sql,args});
      return {
        async first(){
          if(sql.includes("FROM campaign_recap_audio_summary_jobs WHERE id=?"))
            return job?{id:"6f9ccdd6-ef09-4ae9-9e8d-d02a30a48caf",...job}:null;
          if(sql.includes("FROM campaign_recap_audio_assets a"))return source?{ok:1}:null;
          if(sql.includes("FROM user_recap_ai_connections"))return connected?{ok:1}:null;
          if(sql.includes("FROM campaign_session_recaps"))return {published};
          throw Error("Unexpected SELECT "+sql);
        },
        async run(){return {meta:{changes:updateChanges}};}
      };
    }};
  }};
}
const input={jobId:"6f9ccdd6-ef09-4ae9-9e8d-d02a30a48caf",
  campaignId:"internal-campaign",recapId:"recap",userId:"original-gm"};
test("retry requeues the same owner-approved job without inserting any new job",async()=>{
  const db=mockDatabase();
  assert.deepEqual(await retrySafeRecapPreparation(db,input),
    {resumed:true,status:"pending_upload"});
  const updates=db.statements.filter(x=>x.sql.startsWith("UPDATE"));
  assert.equal(updates.length,1);
  assert.match(updates[0].sql,/WHERE id=\? AND campaign_id=\? AND recap_id=\? AND requested_by=\?/u);
  assert.match(updates[0].sql,/status='needs_attention' AND error_code=\? AND interaction_id IS NULL/u);
  assert.equal(updates[0].args[0],"pending_upload");
  assert.equal(updates[0].args.at(-1),"provider_or_storage_error");
  assert.equal(db.statements.some(x=>x.sql.includes("INSERT")),false);
  const staging=mockDatabase({...failed,fileUri:"https://generativelanguage.googleapis.com/v1beta/files/existing",fileName:"files/existing"});
  assert.deepEqual(await retrySafeRecapPreparation(staging,input),
    {resumed:true,status:"uploaded"});
});
test("retry after Gemini HTTP 400 resets only the temporary upload, not the approved recap job",async()=>{
  const db=mockDatabase({...failed,stageErrorCode:"gemini_chunk_http_400"});
  assert.deepEqual(await retrySafeRecapPreparation(db,input),
    {resumed:true,status:"pending_upload"});
  const update=db.statements.find(x=>x.sql.startsWith("UPDATE"));
  assert.ok(update);
  assert.match(update.sql,/stage_url_ciphertext=CASE WHEN \? THEN NULL/u);
  assert.match(update.sql,/stage_offset=CASE WHEN \? THEN 0/u);
  assert.deepEqual(update.args.slice(2,6),[1,1,1,1]);
  assert.equal(db.statements.filter(x=>x.sql.startsWith("INSERT")).length,0);
});

test("expired Gemini temporary Files audio can re-stage the original recording without resubmitting a model",async()=>{
  for(const stageErrorCode of ["gemini_file_expired","gemini_file_processing_failed"]){
    const job={...failed,fileUri:"https://generativelanguage.googleapis.com/v1beta/files/expired",
      fileName:"files/expired",stageErrorCode};
    assert.equal(safeRecapRetryTarget(job),"pending_upload");
    const db=mockDatabase(job);
    assert.deepEqual(await retrySafeRecapPreparation(db,input),
      {resumed:true,status:"pending_upload"});
    const updated=db.statements.find(row=>row.sql.startsWith("UPDATE"));
    assert.ok(updated);
    assert.match(updated.sql,/file_uri=CASE WHEN \? THEN NULL/u);
    assert.match(updated.sql,/file_name=CASE WHEN \? THEN NULL/u);
    assert.deepEqual(updated.args.slice(2,8),[1,1,1,1,1,1]);
    assert.equal(db.statements.some(row=>row.sql.startsWith("INSERT")),false);
  }
  assert.equal(safeRecapRetryTarget({...failed,errorCode:"interaction_result_unavailable",
    interactionId:"received-previously"}),null);
});
test("no retry for unsafe submissions, invalid state, missing storage or key",async()=>{
  for(const bad of [
    {...failed,errorCode:"submission_uncertain"},
    {...failed,errorCode:"submission_id_missing"},
    {...failed,interactionId:"already-sent"},
    {...failed,status:"submitted"}
  ]){
    const db=mockDatabase(bad);
    await assert.rejects(()=>retrySafeRecapPreparation(db,input),/cannot safely/u);
    assert.equal(db.statements.some(x=>x.sql.startsWith("UPDATE")),false);
  }
  for(const [setup,match] of [
    [{source:false},/original Drive audio/u],
    [{connected:false},/Gemini API key/u],
    [{updateChanges:0},/changed while/u],
  ]){
    await assert.rejects(()=>retrySafeRecapPreparation(mockDatabase(failed,setup),input),match);
  }
  assert.deepEqual(await retrySafeRecapPreparation(mockDatabase(failed,{published:1}),input),
    {resumed:true,status:"pending_upload"}); // published page stays unchanged
});
test("GM sees explanatory actions, but never receives temporary Gemini file URI",async()=>{
  const [route,ui,runner]=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("lib/campaigns/recap-only-runner.ts"),
  ]);
  assert.match(route,/file_uri AS fileUri,file_name AS fileName,interaction_id AS interactionId/u);
  assert.match(route,/const safeJobs=rows\.results\.map\(\(\{fileUri,fileName,interactionId,\.\.\.job\}\)/u);
  assert.match(route,/canRetry:/u);
  assert.match(route,/retrySafeRecapPreparation/u);
  assert.match(route,/body\.retryApproved!==true/u);
  assert.match(route,/getSessionActor/u);
  assert.match(route,/request\.headers\.get\("origin"\)!==CANONICAL_ORIGIN/u);
  assert.match(ui,/Retry AI processing/u);
  assert.match(ui,/View partial AI notes/u);
  assert.match(ui,/newest\.generatedMarkdown&&<details>/u);
  assert.match(ui,/recapAttentionText/u);
  assert.match(ui,/Copy diagnostics/u);
  assert.match(ui,/Test Gemini connection/u);
  assert.match(ui,/role="alert"/u);
  assert.match(runner,/error_code='transfer_stalled'/u);
  assert.match(runner,/error_code='submission_uncertain'/u);
  assert.doesNotMatch(ui,/fileUri|interactionId|x-goog-api-key/u);
});
