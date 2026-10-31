import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {geminiAudioMime} from "../lib/campaigns/recap-gemini-audio-mime.ts";
import {classifyRecapInteraction} from "../lib/campaigns/recap-interaction-status.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("normalize M4A and other supported audio without modifying original Drive metadata",()=>{
  for(const source of ["audio/mp4","audio/m4a","audio/x-m4a","audio/mp4; codecs=mp4a.40.2"])
    assert.equal(geminiAudioMime(source),"audio/m4a");
  for(const source of ["audio/mp3","audio/mpeg"])
    assert.equal(geminiAudioMime(source),"audio/mpeg");
  assert.equal(geminiAudioMime("audio/wave"),"audio/wav");
  assert.equal(geminiAudioMime("audio/flac"),"audio/flac");
  assert.throws(()=>geminiAudioMime("application/json"),/Unsupported/u);
});
test("all provider outcomes halt, save or wait without another billable submission",()=>{
  assert.deepEqual(classifyRecapInteraction("in_progress"),{kind:"waiting"});
  assert.deepEqual(classifyRecapInteraction("completed"),{kind:"complete"});
  for(const [status,code,partial] of [
    ["failed","interaction_failed",false],
    ["cancelled","interaction_cancelled",false],
    ["incomplete","interaction_incomplete",true],
    ["requires_action","interaction_requires_action",false],
    ["requires_continuation","interaction_requires_continuation",true],
    ["a_future_status","interaction_unknown_status",false],
  ]){
    assert.deepEqual(classifyRecapInteraction(status),{kind:"attention",code,keepPartial:partial});
  }
});
test("the Worker handles terminal interaction state, fair scheduling, and no silent resubmission",async()=>{
  const runner=await read("lib/campaigns/recap-only-runner.ts");
  assert.match(runner,/geminiAudioMime\(original\.mimeType\)/u);
  assert.match(runner,/classifyRecapInteraction\(result\.status\)/u);
  assert.match(runner,/status='needs_attention',error_code=\?,generated_markdown=\?/u);
  assert.match(runner,/interaction_invalid_output/u);
  assert.match(runner,/ORDER BY updated_at ASC,id ASC LIMIT 1/u);
  assert.doesNotMatch(runner,/WHEN 'submitted' THEN 0 WHEN 'uploaded' THEN 1/u);
  assert.match(runner,/WHERE id=\? AND status='submitted'/u);
  assert.doesNotMatch(runner,/await submit\(env,job\);\s*await submit/u);
});
