import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { captionsToRecapTranscript } from "../lib/campaigns/recap-caption-import.ts";
test("Craig SRT converts multi-hour caption timestamps",()=>{
 const r=captionsToRecapTranscript("1\n01:24:15,000 --> 01:24:17,000\nGM: Welcome back!\n\n2\n01:24:18,000 --> 01:24:19,000\nPlayer: Let's go.","session.srt");
 assert.equal(r.count,2);
 assert.match(r.block,/\[01:24:15\] GM: Welcome back!/u);
});
test("Craig WebVTT voice tags retain speaker names",()=>{
 const r=captionsToRecapTranscript("WEBVTT\n\n00:04:02.000 --> 00:04:08.000\n<v Alice>We open the door.</v>","session.vtt");
 assert.equal(r.count,1);
 assert.match(r.block,/\[00:04:02\] Alice: We open the door\./u);
});
test("reject wrong extension and empty captions",()=>{
 assert.throws(()=>captionsToRecapTranscript("hello","note.txt"));
 assert.throws(()=>captionsToRecapTranscript("WEBVTT\n\nno cue","note.vtt"));
});
test("GM editor requires explicit review and save before publishing",async()=>{
 const source=await readFile(new URL("../app/campaigns/session-recap-manager.tsx",import.meta.url),"utf8");
 assert.match(source,/captionsToRecapTranscript\(await file\.text\(\),file\.name\)/u);
 assert.match(source,/Import Craig captions/u);
 assert.match(source,/setDraft\(current=>/u);
 assert.match(source,/30,000-character limit/u);
});
