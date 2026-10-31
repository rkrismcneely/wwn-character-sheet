import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  canDispatchGeminiJob,validateGeminiQuotaMode,validateGeminiJobTransition,
  safeGeminiJobSummary,planGeminiAudioChunks,GEMINI_BACKGROUND_MAX_TRACKS,GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM,
} from "../lib/campaigns/recap-gemini-background.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const input={enabled:true,accountConnected:true,audioReady:true,humanApproved:true,
  userNotPaused:true,status:"queued",nextEligibleAt:null,now:"2026-10-30T21:00:00.000Z",
  freeQuotaVerified:true,quotaMode:"provider-free-only",maxCostMicrousd:0};
test("Gemini cannot dispatch without all consent, source, connected account, quota and owner guards",()=>{
  assert.equal(canDispatchGeminiJob(input),true);
  for(const key of ["enabled","accountConnected","audioReady","humanApproved","userNotPaused","freeQuotaVerified"]){
    assert.equal(canDispatchGeminiJob({...input,[key]:false}),false,key);
  }
  assert.equal(canDispatchGeminiJob({...input,status:"awaiting_source"}),false);
  assert.equal(canDispatchGeminiJob({...input,status:"cancelled"}),false);
  assert.equal(canDispatchGeminiJob({...input,nextEligibleAt:"2026-10-31T21:00:00.000Z"}),false);
  assert.equal(canDispatchGeminiJob({...input,quotaMode:"gm-owned-paid-allowed",maxCostMicrousd:0}),false);
  assert.equal(canDispatchGeminiJob({...input,quotaMode:"gm-owned-paid-allowed",maxCostMicrousd:500000}),true);
});
test("Gemini background queue only accepts explicit GM-owned preferences and valid transitions",()=>{
  assert.equal(validateGeminiQuotaMode("provider-free-only"),"provider-free-only");
  assert.equal(validateGeminiQuotaMode("gm-owned-paid-allowed"),"gm-owned-paid-allowed");
  for(const bad of ["owner-funded","unlimited",null,undefined])assert.throws(()=>validateGeminiQuotaMode(bad));
  assert.equal(validateGeminiJobTransition("awaiting_source","pause"),"pause");
  assert.equal(validateGeminiJobTransition("queued","resume"),"resume");
  assert.equal(validateGeminiJobTransition("transcribing","cancel"),"cancel");
  assert.throws(()=>validateGeminiJobTransition("cancelled","resume"));
  assert.throws(()=>validateGeminiJobTransition("completed","pause"));
  assert.throws(()=>validateGeminiJobTransition("queued","start"));
  assert.equal(GEMINI_BACKGROUND_MAX_TRACKS,16);
  assert.equal(GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM,2);
});
test("GM-facing job summaries omit all secret keys, private audio locators and other users",()=>{
  const row={id:"job",recapId:"recap",status:"awaiting_source",quotaMode:"provider-free-only",
    completedChunks:0,totalChunks:0,failedChunks:0,speakerTracks:4,nextEligibleAt:null,
    pausedAt:null,failureCode:null,createdAt:"now",updatedAt:"now",requestedBy:"secret-owner",
    providerConnectionId:"secret-connection",sourceManifestKey:"recap-private-key"};
  const summary=safeGeminiJobSummary(row);
  assert.equal(summary.status,"awaiting_source");
  assert.equal(summary.speakerTracks,4);
  assert.equal("requestedBy" in summary,false);
  assert.equal("providerConnectionId" in summary,false);
  assert.equal("sourceManifestKey" in summary,false);
});
test("registration belongs to GM and recap, requires confirmed Craig tracks, personal key and explicit consent",async()=>{
  const src=await read("../app/api/campaigns/[id]/session-recaps/background-gemini/route.ts");
  for(const phrase of ["getSessionActor(request)","canManageCampaignContent","getCampaignSessionRecap",
    "getCraigRecordingForDownloadJob","recap-track-speakers/",
    "imported.sessionDate!==recap.date","status='connected' AND key_ciphertext IS NOT NULL",
    "user_id=? AND provider='gemini'","approvedShare","approvedBilling",
    "source_lane,status,provider","'awaiting_source'","ON CONFLICT(import_id) DO NOTHING",
    "GEMINI_BACKGROUND_MAX_ACTIVE_JOBS_PER_GM","actor.userId",
    "private, no-store","paused_at","cancelled_at","UPDATE campaign_recap_processing_jobs"]){
      assert.ok(src.includes(phrase),"Missing: "+phrase);
    }
  assert.doesNotMatch(src,/apiKey|api\.groq\.com|generativelanguage\.googleapis\.com|ai\.run\(/u);
  assert.match(src,/Only the GM who connected Gemini may control this job/u);
});
test("background migration is additive and Drizzle models stay aligned",async()=>{
  const [sql,schema]=await Promise.all([
    read("../drizzle/0041_recap_gemini_background_jobs.sql"),read("../db/schema.ts"),
  ]);
  for(const column of ["recap_id","provider_connection_id","quota_mode","next_eligible_at",
    "paused_at","cancelled_at","source_manifest_key","audio_key","audio_mime_type",
    "audio_bytes","source_digest"]){
    assert.ok(sql.includes("ADD COLUMN "+column),"Missing migration "+column);
  }
  for(const prop of ["recapId: text(","providerConnectionId: text(","quotaMode: text(",
    "pausedAt: text(","sourceManifestKey: text(","audioKey: text(",
    "sourceDigest: text("]){
    assert.ok(schema.includes(prop),"Missing typed schema "+prop);
  }
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|UPDATE .*status='queued'/u);
});

test("a five-speaker three-hour session gets 45 independently encodable 20-minute clips",()=>{
  const plan=planGeminiAudioChunks(Array.from({length:5},(_,trackIndex)=>({
    trackIndex,startMs:0,durationMs:3*60*60*1000,
  })));
  assert.equal(plan.length,45);
  assert.equal(plan.filter(row=>row.trackIndex===0).length,9);
  assert.deepEqual(plan[0],{trackIndex:0,chunkIndex:0,startMs:0,endMs:20*60*1000});
  assert.equal(plan.at(-1).endMs,3*60*60*1000);
  for(const row of plan){
    assert.ok(row.endMs-row.startMs<=20*60*1000);
    assert.ok(row.endMs>row.startMs);
  }
  assert.throws(()=>planGeminiAudioChunks([{trackIndex:0,startMs:0,durationMs:9*60*60*1000}]));
  assert.throws(()=>planGeminiAudioChunks([{trackIndex:0,startMs:0,durationMs:10_000},
    {trackIndex:0,startMs:20000,durationMs:10_000}]));
});
test("leases are atomic and forbid automatic retries after ambiguous provider results",async()=>{
  const src=await read("../lib/campaigns/recap-gemini-leases.ts");
  for(const required of ["canDispatchGeminiJob","verifySource","WHERE job_id=?",
    "status='pending'","status='leased'","lease_token=?","attempts<25",
    "connectionStatus","sourceDigest","status='completed'",
    "reason===\"uncertain_result\"","status='failed'","quarantineExpiredGeminiLeases",
    "lease_expires_at<=?","AND j.paused_at IS NULL",
  ])assert.ok(src.includes(required),"Missing lease guard: "+required);
  assert.doesNotMatch(src,/generativelanguage\.googleapis\.com|apiKey|fetch\(/u);
});
