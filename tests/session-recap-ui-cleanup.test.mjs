import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("legacy Craig and transcription tools remain implemented but hidden by default",async()=>{
  const manager=await read("app/campaigns/session-recap-manager.tsx");
  assert.match(manager,/SHOW_LEGACY_RECAP_TOOLS=process\.env\.NEXT_PUBLIC_TWE_RECAP_ADVANCED_TOOLS==="true"/u);
  assert.match(manager,/SHOW_LEGACY_RECAP_TOOLS&&<details/u);
  for(const component of [
    "SessionRecapRecordingSetup","SessionRecapTranscriptionOptions",
    "SessionRecapFullTranscriptManager","SessionRecapAIWriter"
  ])assert.match(manager,new RegExp("<"+component+"\\b","u"));
  assert.match(manager,/setShowAdvanced\(event\.currentTarget\.open\)/u);
  assert.doesNotMatch(manager,/Step 1: upload and play the recording/u);
  assert.doesNotMatch(manager,/These older tools remain available/u);
});

test("recap page keeps only actionable upload and summarization guidance",async()=>{
  const [manager,uploader,status]=await Promise.all([
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("app/campaigns/session-recap-auto-status.tsx"),
  ]);
  assert.match(manager,/Create a private draft, then attach your audio/u);
  assert.match(uploader,/Keep this page open until the upload completes/u);
  assert.match(uploader,/busy&&!awaitingVerification/u);
  assert.match(uploader,/assets\.filter\(asset=>asset\.status!=="ready"\|\|asset\.canRecover\)/u);
  assert.match(status,/<h4>AI recap<\/h4>/u);
  assert.doesNotMatch(status,/Long compatible recordings are divided and summarized automatically/u);
  assert.match(status,/Saved AI recap versions/u);
  assert.match(status,/Retry failed section only/u);
  assert.match(status,/currentDiagnosis\?\.value\.title/u);
  assert.match(status,/<summary>More options and diagnostics<\/summary>/u);
  assert.match(status,/Copy diagnostics/u);
});

test("privacy, cost, optional AI use, version safety and publishing controls remain visible",async()=>{
  const [manager,status,progress]=await Promise.all([
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-progress.tsx"),
  ]);
  assert.match(status,/Google may use free-tier content to improve its products/u);
  assert.match(status,/I approve sending this recording and campaign context to Gemini/u);
  assert.match(status,/I understand this request could use my quota or incur provider charges/u);
  assert.match(status,/disabled=\{starting\|\|!privacy\|\|!billing\}/u);
  assert.match(status,/Your published recap will not change/u);
  assert.match(status,/Saved AI recap versions/u);
  assert.match(manager,/Only publishing makes this recap visible to players/u);
  assert.match(progress,/recapProgress\(job\)/u);
  assert.match(progress,/showTransfer&&!analysisFailure/u);
  assert.doesNotMatch(progress,/recap-ai-progress__steps/u);
});
