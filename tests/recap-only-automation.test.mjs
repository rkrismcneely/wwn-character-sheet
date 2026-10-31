import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {cleanGeneratedRecap,RECAP_ONLY_MAX_AUDIO_BYTES,RECAP_ONLY_MODEL} from "../lib/campaigns/recap-only-runner.ts";
import {enqueueConfirmedRecapAudio} from "../lib/campaigns/recap-only-jobs.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

function eligible({connected=true,published=0,already=false,confirmedAt="2026-10-31T12:00:00Z"}={}){
  let writes=0,insertParams=[];
  const db={prepare(sql){
    return {bind(...params){return {
      async first(){
        if(sql.includes("user_recap_auto_preferences"))return {detail:"detailed"};
        if(sql.includes("user_recap_ai_connections"))return connected?{ok:1}:null;
        if(sql.includes("campaign_session_recaps"))return {published};
        if(sql.includes("confirmed_at AS confirmedAt"))return {confirmedAt};
        throw Error("Unexpected query: "+sql);
      },
      async run(){
        writes++;insertParams=params;
        return {meta:{changes:already?0:1}};
      },
    };}};
  }};
  return {db,get writes(){return writes;},get insertParams(){return insertParams;}};
}
const input={campaignId:"campaign",recapId:"recap",audioAssetId:"asset",userId:"gm",byteSize:4_000_000,
  confirmed:true,privacyApproved:true,billingApproved:true};

test("Gemini requires explicit per-recording confirmation and connected personal key",async()=>{
  const notConfirmed=eligible();
  for(const change of [{confirmed:false},{privacyApproved:false},{billingApproved:false}]){
    await assert.rejects(()=>enqueueConfirmedRecapAudio(notConfirmed.db,{...input,...change}),
      /Confirm that Gemini/u);
  }
  assert.equal(notConfirmed.writes,0);
  await assert.rejects(()=>enqueueConfirmedRecapAudio(eligible({connected:false}).db,input),/Connect your own Gemini/u);
  assert.deepEqual(await enqueueConfirmedRecapAudio(eligible({published:1}).db,input),
    {created:true,alreadyQueued:false}); // published recap produces a separate private AI version
  const allowed=eligible();
  assert.deepEqual(await enqueueConfirmedRecapAudio(allowed.db,input),{created:true,alreadyQueued:false});
  assert.equal(allowed.writes,1);
  assert.equal(allowed.insertParams.length,13);
  assert.match(allowed.insertParams[9],/^\d{4}-\d\d-\d\dT/u); // explicit confirmed_at
});

test("duplicate POST never creates another billable job; old unconfirmed jobs cannot be reused",async()=>{
  const duplicate=eligible({already:true});
  assert.deepEqual(await enqueueConfirmedRecapAudio(duplicate.db,input),{created:false,alreadyQueued:true});
  const legacy=eligible({already:true,confirmedAt:null});
  await assert.rejects(()=>enqueueConfirmedRecapAudio(legacy.db,input),/not confirmed/u);
});

test("oversize recordings stay in Drive but cannot be analyzed",async()=>{
  await assert.rejects(()=>enqueueConfirmedRecapAudio(eligible().db,
    {...input,byteSize:RECAP_ONLY_MAX_AUDIO_BYTES+1}),/2 GB/u);
  assert.equal(RECAP_ONLY_MAX_AUDIO_BYTES,2*1024**3);
});

test("Gemini native recap model and output validation",()=>{
  assert.equal(RECAP_ONLY_MODEL,"gemini-3.8-flash");
  assert.throws(()=>cleanGeneratedRecap("short"),/incomplete/);
  assert.throws(()=>cleanGeneratedRecap("A".repeat(30001)),/oversized/);
  assert.throws(()=>cleanGeneratedRecap("A".repeat(90)+"\x00"),/incomplete/);
  assert.ok(cleanGeneratedRecap("## 00:05:10 — Harbor arrival\n"+"A".repeat(90)).startsWith("##"));
});

test("uploaded audio never starts a Gemini job, and per-recording confirmation is enforced server-side",async()=>{
  const [runner,route,workflow,worker,upload,schema,migration]=await Promise.all([
    read("lib/campaigns/recap-only-runner.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read(".github/workflows/migrate-session-recaps.yml"),
    read("worker/index.ts"),
    read("lib/campaigns/recap-drive-upload-service.ts"),
    read("drizzle/0049_recap_explicit_confirmation.sql"),
    read("scripts/migrate-recap-manual-confirmation.mjs"),
  ]);
  assert.doesNotMatch(upload,/enqueueConsentedRecapAudio|enqueueConfirmedRecapAudio/u);
  assert.match(route,/enqueueConfirmedRecapAudio/u);
  assert.match(route,/confirmed:body.confirmed===true/u);
  assert.match(route,/privacyApproved:body.privacyApproved===true/u);
  assert.match(route,/billingApproved:body.billingApproved===true/u);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(route,/confirmed_at IS NOT NULL/u);
  assert.match(schema,/ADD COLUMN confirmed_at TEXT/u);
  assert.match(runner,/confirmed_at IS NOT NULL/u);
  assert.match(runner,/background:true,store:true/u);
  assert.match(runner,/getGmDriveAccessToken/u);
  assert.match(runner,/decryptGeminiUserKey/u);
  assert.match(runner,/status='submitting'/u);
  assert.match(runner,/submission_uncertain/u);
  assert.match(runner,/is_published=0/u);
  assert.match(runner,/redactJournalSecrets/u);
  assert.match(worker,/runRecapOnlyScheduledTick/u);
  assert.match(migration,/0049_recap_explicit_confirmation.sql/u);
  const gate=workflow.indexOf("node scripts/migrate-recap-manual-confirmation.mjs");
  assert.ok(gate>=0&&gate<workflow.indexOf("npx wrangler deploy"));
});

test("UI shows playable audio first, Auto Summarize button, and confirmation popup",async()=>{
  const [status,uploader,setup,manager,wizard]=await Promise.all([
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("app/api/account/recap-setup/route.ts"),
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/account/recap-auto-settings.tsx"),
  ]);
  assert.match(status,/SessionRecapAudioPlayer/u);
  assert.match(status,/Auto Summarize/u);
  assert.match(status,/Summarize again/u);
  assert.match(status,/Saved AI recap versions/u);
  assert.match(status,/role="alertdialog"/u);
  assert.match(status,/Confirm Auto Summarize/u);
  assert.match(status,/privacyApproved:true,billingApproved:true/u);
  assert.match(status,/onClick=\{\(\)=>setConfirmAsset\(null\)\}/u);
  assert.match(uploader,/Gemini has not been started/u);
  assert.match(uploader,/twe:recap-audio-attached/u);
  assert.match(setup,/ready:storageConnected/u);
  assert.match(manager,/Step 1: upload and play the recording/u);
  assert.match(wizard,/Every AI\s+request requires its own confirmation/u);
});
