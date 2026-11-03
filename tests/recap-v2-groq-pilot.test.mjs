import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {mintPilotCapability,verifyPilotCapability,V2_PILOT_SOURCE_TTL_SECONDS}
  from "../lib/campaigns/recap-v2-pilot-capability.ts";
import {excerptRequestedRange} from "../lib/campaigns/recap-v2-pilot-range.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const identity={
 campaignId:"cmp_"+"a".repeat(22),
 recapId:"00000000-0000-4000-8000-000000000001",
 assetId:"00000000-0000-4000-8000-000000000002",
 ownerId:"test-gm-user",
};
const settings={RECAP_STORAGE_ENCRYPTION_KEY:Buffer.alloc(32,12).toString("base64url")};
test("private excerpt access is HMAC-bound to GM, campaign, recap and asset",async()=>{
  const now=Date.parse("2026-11-03T10:00:00.000Z");
  const signed=await mintPilotCapability(settings,identity,now);
  assert.equal(signed.expires,Math.floor(now/1000)+V2_PILOT_SOURCE_TTL_SECONDS);
  assert.equal(await verifyPilotCapability(settings,signed,now),true);
  assert.equal(await verifyPilotCapability(settings,signed,
    now+(V2_PILOT_SOURCE_TTL_SECONDS+1)*1000),false);
  assert.equal(await verifyPilotCapability(settings,{...signed,assetId:identity.recapId},now),false);
  assert.equal(await verifyPilotCapability(settings,{...signed,ownerId:"another-user"},now),false);
  assert.equal(await verifyPilotCapability(settings,{...signed,recapId:identity.assetId},now),false);
  assert.equal(await verifyPilotCapability(settings,{...signed,signature:"A".repeat(43)},now),false);
  assert.equal(await verifyPilotCapability(settings,{...signed,expires:signed.expires+900},now),false);
  await assert.rejects(()=>mintPilotCapability(settings,{...identity,assetId:"bad"},now));
});
test("virtual signed audio supports bounded GET/HEAD byte-range behavior",()=>{
  assert.deepEqual(excerptRequestedRange(null,1000),{start:0,end:999,status:200});
  assert.deepEqual(excerptRequestedRange("bytes=0-99",1000),{start:0,end:99,status:206});
  assert.deepEqual(excerptRequestedRange("bytes=500-",1000),{start:500,end:999,status:206});
  assert.deepEqual(excerptRequestedRange("bytes=-50",1000),{start:950,end:999,status:206});
  assert.deepEqual(excerptRequestedRange("bytes=800-5000",1000),{start:800,end:999,status:206});
  for(const invalid of ["bytes=0-1,3-4","bytes=1000-","bytes=999-1","items=0-10"])
    assert.throws(()=>excerptRequestedRange(invalid,1000),RangeError);
});
test("V2 pilot is disabled by default and guarded by explicit GM consent",async()=>{
  const [pilot,source,route,migrate]=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/v2-pilot/route.ts"),
    read("lib/campaigns/recap-v2-pilot-source.ts"),
    read("app/api/recap-v2/pilot-source/[assetId]/route.ts"),
    read("scripts/migrate-recap-writer.mjs"),
  ]);
  assert.match(pilot,/TWE_RECAP_V2_PILOT_ENABLED!=="true"/u);
  assert.match(source,/TWE_RECAP_V2_PILOT_ENABLED!=="true"/u);
  assert.match(pilot,/body\.approvedShare!==true\|\|body\.approvedQuota!==true/u);
  assert.match(pilot,/canManageCampaignContent/u);
  assert.match(pilot,/a\.storage_owner_user_id=\?/u);
  assert.match(pilot,/INSERT OR IGNORE INTO campaign_recap_v2_pilots/u);
  assert.match(pilot,/if\(inserted\.meta\.changes!==1\)/u);
  assert.match(pilot,/status='uncertain'/u);
  assert.match(pilot,/whisper-large-v3/u);
  assert.match(pilot,/form\.set\("url",url\.toString\(\)\)/u);
  assert.match(pilot,/response_format","verbose_json"/u);
  assert.match(pilot,/normalizeGroqAudioSegments/u);
  assert.doesNotMatch(pilot,/generativelanguage\.googleapis/u);
  assert.match(source,/verifyPilotCapability/u);
  assert.match(source,/s\.status='connected' AND s\.provider='google-drive'/u);
  assert.match(source,/new ReadableStream/u);
  assert.match(route,/handlePilotExcerpt/u);
  assert.match(migrate,/0059_recap_v2_pilot\.sql/u);
});
test("no existing recap or Gemini job is modified by V2 pilot",async()=>{
  const pilot=await read("app/api/campaigns/[id]/session-recaps/v2-pilot/route.ts");
  assert.doesNotMatch(pilot,/UPDATE campaign_recap_audio_summary_jobs/u);
  assert.doesNotMatch(pilot,/UPDATE campaign_session_recaps/u);
  assert.doesNotMatch(pilot,/UPDATE campaign_recap_audio_assets/u);
  assert.doesNotMatch(pilot,/Gemini.*POST/u);
  const schema=await read("drizzle/0059_recap_v2_pilot.sql");
  assert.match(schema,/UNIQUE\(campaign_id,recap_id,audio_asset_id,requested_by\)/u);
});

test("V2 pilot UI is opt-in, makes readiness GET before inference POST, and requires consent",async()=>{
  const [screen,ui,pilot,source]=await Promise.all([
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-v2-pilot.tsx"),
    read("app/api/campaigns/[id]/session-recaps/v2-pilot/route.ts"),
    read("lib/campaigns/recap-v2-pilot-source.ts"),
  ]);
  assert.match(screen,/NEXT_PUBLIC_TWE_RECAP_V2_PILOT_ENABLED==="true"/u);
  assert.match(screen,/SessionRecapV2Pilot/u);
  assert.match(ui,/Check pilot readiness \(no AI request\)/u);
  assert.match(ui,/approvedShare:true,approvedQuota:true/u);
  assert.match(ui,/!share\|\|!quota/u);
  assert.match(ui,/window\.confirm\(/u);
  assert.match(ui,/planM4aPilotExcerpt\(/u);
  assert.match(ui,/validatePilotM4aPlan\(/u);
  assert.match(pilot,/validatePilotM4aPlan\(body\.m4aPlan/u);
  assert.match(source,/p\.status='submitting'/u);
  assert.doesNotMatch(source,/planM4aPilotExcerpt/u);

  assert.match(ui,/if\(!response\.ok\|\|!data\.success\)/u);
  assert.doesNotMatch(ui,/generativelanguage\\.googleapis/u);
});
