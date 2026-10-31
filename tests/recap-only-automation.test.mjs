import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {cleanGeneratedRecap,RECAP_ONLY_MAX_AUDIO_BYTES,RECAP_ONLY_MODEL} from "../lib/campaigns/recap-only-runner.ts";
import {enqueueConsentedRecapAudio} from "../lib/campaigns/recap-only-jobs.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

function eligible({approved=true,published=0}={}){
  let writes=0;
  const db={
    prepare(sql){
      return {bind(...params){return {
        async first(){
          if(sql.includes("user_recap_auto_preferences"))return approved?
            {enabled:1,approved:1,consentAt:"2026-10-31T12:00:00Z",detail:"detailed"}:null;
          if(sql.includes("user_recap_ai_connections"))return approved?{ok:1}:null;
          if(sql.includes("campaign_session_recaps"))return {published};
          throw Error("Unexpected query "+sql);
        },
        async run(){writes++;return {meta:{changes:1}};},
      };}};
    },
  };
  return {db,get writes(){return writes;}};
}
const input={campaignId:"campaign",recapId:"recap",audioAssetId:"asset",userId:"gm",byteSize:4_000_000};
test("Gemini summarization requires GM's ongoing explicit provider/privacy/billing consent",async()=>{
  const missing=eligible({approved:false});
  assert.equal(await enqueueConsentedRecapAudio(missing.db,input),false);
  assert.equal(missing.writes,0);
  const published=eligible({published:1});
  assert.equal(await enqueueConsentedRecapAudio(published.db,input),false);
  assert.equal(published.writes,0);
  const okay=eligible();
  assert.equal(await enqueueConsentedRecapAudio(okay.db,input),true);
  assert.equal(okay.writes,1);
});
test("oversize recordings remain saved but cannot be sent to Gemini",async()=>{
  const okay=eligible();
  assert.equal(await enqueueConsentedRecapAudio(okay.db,{...input,byteSize:RECAP_ONLY_MAX_AUDIO_BYTES+1}),true);
  assert.equal(RECAP_ONLY_MAX_AUDIO_BYTES,2*1024**3);
});
test("recap output validation rejects empty, script/control characters and oversized outputs",()=>{
  assert.equal(RECAP_ONLY_MODEL,"gemini-3.6-flash");
  assert.throws(()=>cleanGeneratedRecap("short"),/incomplete/);
  assert.throws(()=>cleanGeneratedRecap("A".repeat(30001)),/oversized/);
  assert.throws(()=>cleanGeneratedRecap("A".repeat(90)+"\x00"),/incomplete/);
  assert.equal(cleanGeneratedRecap("## 00:05:10 — Harbor arrival\n"+"A".repeat(90)).startsWith("##"),true);
});
test("recording pipeline is private, hosted on GM accounts, and never auto-publishes",async()=>{
  const [schema,runner,route,workflow,worker,upload]=await Promise.all([
    read("drizzle/0048_recap_only_automation.sql"),read("lib/campaigns/recap-only-runner.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read(".github/workflows/migrate-session-recaps.yml"),read("worker/index.ts"),
    read("lib/campaigns/recap-drive-upload-service.ts"),
  ]);
  assert.match(schema,/UNIQUE\(audio_asset_id\)/u);
  assert.match(schema,/consent_at/u);
  assert.match(schema,/generated_markdown/u);
  assert.match(runner,/getGmDriveAccessToken/u);
  assert.match(runner,/decryptGeminiUserKey/u);
  assert.match(runner,/background:true,store:true/u);
  assert.match(runner,/status='submitting'/u);
  assert.match(runner,/submission_uncertain/u);
  assert.match(runner,/is_published=0/u);
  assert.match(runner,/redactJournalSecrets/u);
  assert.doesNotMatch(runner,/UPDATE campaign_session_recaps SET[^;]*is_published\s*=\s*1|(?:shared|siteOwner)GeminiKey/u);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(upload,/enqueueConsentedRecapAudio/u);
  assert.match(worker,/runRecapOnlyScheduledTick/u);
  const migrate=workflow.indexOf("node scripts/migrate-recap-only-automation.mjs");
  assert.ok(migrate>=0&&migrate<workflow.indexOf("npx wrangler deploy"));
});
test("onboarding includes clear costs, privacy, ready gate, and a GM-only review",async()=>{
  const [wizard,account,manager,status,setup]=await Promise.all([
    read("app/account/recap-auto-settings.tsx"),read("app/account/account-page.tsx"),
    read("app/campaigns/session-recap-manager.tsx"),read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/api/account/recap-setup/route.ts"),
  ]);
  assert.match(account,/RecapAutoSettings/u);
  assert.match(wizard,/billingApproved/u);
  assert.match(wizard,/privacyApproved/u);
  assert.match(wizard,/Gemini project may incur charges/u);
  assert.match(wizard,/48 hours/u);
  assert.match(setup,/ready:storageConnected&&aiConnected&&automationEnabled/u);
  assert.match(manager,/SessionRecapAutoStatus/u);
  assert.match(status,/not published/u);
  assert.match(status,/Generate recap from this recording/u);
  assert.match(manager,/Publish approved recap/u);
});
