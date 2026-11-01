import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const direct=readFileSync("lib/campaigns/recap-only-runner.ts","utf8");
const segments=readFileSync("lib/campaigns/recap-long-audio-runner.ts","utf8");

test("direct recap excludes out-of-game talk without dropping character roleplay",()=>{
  assert.match(direct,/out-of-character table talk anywhere in the recording/);
  assert.match(direct,/opening chatter, breaks, and mid-session tangents/);
  assert.match(direct,/do not discard genuine in-character roleplay/);
});
test("segmented extraction and final synthesis both filter table talk",()=>{
  assert.match(segments,/Exclude out-of-game table talk throughout this section/);
  assert.match(segments,/Do not give excluded chatter scene notes or timestamps/);
  assert.match(direct,/Exclude all out-of-game table talk, including opening chatter and mid-session breaks/);
});
