import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseRecapTranscript } from "../lib/campaigns/recap-transcript-display.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("timestamped transcript blocks support long sessions and speaker names",()=>{
  const transcript=parseRecapTranscript("Prose 00:05:00 nobody\n\`\`\`transcript\n[00:42:15] GM: The door opens.\n01:20:07 Hero: We run.\n\`\`\`");
  assert.equal(transcript.length,2);
  assert.deepEqual(transcript.map(line=>line.seconds),[2535,4807]);
  assert.deepEqual(transcript.map(line=>line.speaker),["GM","Hero"]);
});
test("invalid timestamps and untagged prose are ignored",()=>{
  assert.deepEqual(parseRecapTranscript("## 10:05 Normal heading\n\`\`\`transcript\n00:99:00 GM: no\n00:02 GM: yes\n\`\`\`").map(line=>line.text),["yes"]);
});
test("transcript search and seek remain inside authorized private recording player",async()=>{
  const player=await read("../app/campaigns/session-recap-audio-player.tsx");
  assert.match(player,/parseRecapTranscript\(content\?\?""\)/u);
  assert.match(player,/aria-label="Search transcript"/u);
  assert.match(player,/onClick=\{\(\)=>seekTo\(line.seconds\)\}/u);
  assert.match(player,/audio\.currentTime=/u);
  assert.doesNotMatch(player,/refresh_token|GOOGLE_DRIVE_CLIENT_SECRET/u);
});
