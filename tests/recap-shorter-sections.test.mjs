import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {LONG_AUDIO_THRESHOLD_MS,SEGMENT_TARGET_MS,SEGMENT_MAX_MS} from "../lib/campaigns/recap-long-audio-plan.ts";
const read=p=>readFileSync(p,"utf8");
test("MP3/WAV retain 60-minute sections while M4A uses safer 35-minute sections",()=>{
  assert.equal(LONG_AUDIO_THRESHOLD_MS,60*60_000);
  assert.equal(SEGMENT_TARGET_MS,60*60_000);
  assert.equal(SEGMENT_MAX_MS,60*60_000);
  assert.match(read("lib/campaigns/recap-m4a-remux.ts"),/MAX_PART_MS=35\*60_000/);
  assert.match(read("lib/campaigns/recap-m4a-browser-preflight.ts"),/durationMs<=60\*60_000/);
  assert.match(read("app/campaigns/session-recap-auto-status.tsx"),/confirmAsset\?\.mimeType==="audio\/mp4"\?35:60/);
});
