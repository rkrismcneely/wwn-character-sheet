import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {test} from "node:test";
import {recapWorkflowObjectKey} from "../lib/campaigns/recap-stage-workflow.ts";
import {recapTranscriptObjectKey} from "../lib/campaigns/recap-full-transcript.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const publicId="cmp_"+ "A".repeat(22);
const internalId="38b3e79a-28ca-447d-900e-91f3896c04cb";
const recapId="11c88b53-20d8-496f-9951-a2fc91553730";

test("recap R2 keys accept a public campaign ID, not the internal DB UUID",()=>{
  assert.equal(recapWorkflowObjectKey(publicId,recapId),
    "recap-workflows/"+publicId+"/"+recapId+".json");
  assert.equal(recapTranscriptObjectKey(publicId,recapId),
    "recap-transcripts/"+publicId+"/"+recapId+".json");
  assert.throws(()=>recapWorkflowObjectKey(internalId,recapId),/Invalid recap workflow identifiers/);
  assert.throws(()=>recapTranscriptObjectKey(internalId,recapId),/Invalid recap transcript identifier/);
});

test("wizard GET and approval POST use public IDs for R2 and audio lookup",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/workflow/route.ts");
  assert.match(route,/campaignId:access\.campaign\.publicId,recapId:recap\.id/u);
  assert.match(route,/recapWorkflowObjectKey\(campaignId,recapId\)/u);
  assert.match(route,/recapTranscriptObjectKey\(campaignId,recapId\)/u);
  assert.match(route,/listRecapAudioForPlayer\(db,actor,campaignId,recapId\)/u);
  assert.doesNotMatch(route,/campaignId:access\.campaign\.id,recapId:recap\.id/u);
});

test("transcript creation, edits, and local/cloud transcription share the same public R2 key",async()=>{
  for(const path of [
    "app/api/campaigns/[id]/session-recaps/transcript/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts",
    "app/api/campaigns/[id]/session-recaps/transcript/local/route.ts",
    "app/api/campaigns/[id]/session-recaps/workflow/transcript-edit/route.ts",
  ]){
    const code=await read(path);
    assert.match(code,/recapTranscriptObjectKey\(access\.campaign\.publicId,recap\.id\)/u,path);
    assert.doesNotMatch(code,/recapTranscriptObjectKey\(access\.campaign\.id,recap\.id\)/u,path);
  }
});

test("recap writer uses public ID for R2 but internal ID for SQL campaign context",async()=>{
  const code=await read("app/api/campaigns/[id]/session-recaps/workflow/write/route.ts");
  assert.match(code,/recapWorkflowObjectKey\(access\.campaign\.publicId,recap\.id\)/u);
  assert.match(code,/recapTranscriptObjectKey\(access\.campaign\.publicId,recap\.id\)/u);
  assert.match(code,/publicCampaignId:access\.campaign\.publicId/u);
  assert.match(code,/campaignId:access\.campaign\.id/u);
  assert.match(code,/recapWorkflowObjectKey\(info\.publicCampaignId,info\.recapId\)/u);
  assert.match(code,/\.bind\(info\.campaignId,info\.recapId\)/u);
});

test("guided upload restores the saved selection and blocks uploads if state cannot load",async()=>{
  const code=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(code,/if\(ready\.length===1\)setSourceChoice\(ready\[0\]\.id\)/u);
  assert.match(code,/ready\.some\(asset=>asset\.id===previous\)/u);
  assert.match(code,/step===0&&data&&/u);
  assert.match(code,/step===0&&!data&&/u);
  assert.match(code,/disabled=\{busy\|\|!canVisit\(i\)\}/u);
  assert.match(code,/disabled=\{busy\|\|step===4\|\|!canVisit\(step\+1\)\}/u);
});

test("old recap tools stay in source but are hidden from ordinary editor",async()=>{
  const code=await read("app/campaigns/session-recap-manager.tsx");
  assert.match(code,/SHOW_LEGACY_RECAP_TOOLS&&<details/u);
  assert.match(code,/SHOW_LEGACY_RECAP_TOOLS&&editing\.isPublished&&<>/u);
  assert.match(code,/Earlier Auto Summarize jobs and experimental Groq pilot/u);
  assert.match(code,/<SessionRecapAutoStatus/u);
  assert.match(code,/<SessionRecapStagedWizard/u);
});
