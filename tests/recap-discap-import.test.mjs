import {test} from "node:test";
import assert from "node:assert/strict";
import {parseDiscapTranscript,parseDiscapTranscriptDocument} from "../lib/campaigns/recap-discap-import.ts";

test("Discap timestamp-first TXT preserves different Discord speaker labels",()=>{
 const text="[00:00:01] Game Master: You enter the tomb.\n"+
 "[00:00:07] Elidyr: I check the door.\n"+
 "[00:00:14] Game Master: You find an inscription.";
 const cues=parseDiscapTranscript(text,"discap-transcript.txt");
 assert.deepEqual(cues.map(c=>c.rawSpeaker),["Game Master","Elidyr","Game Master"]);
 assert.deepEqual(cues.map(c=>c.startMs),[1000,7000,14000]);
 assert.deepEqual(cues.map(c=>c.endMs),[7000,14000,19000]);
});
test("Discap accepts elapsed HH:MM:SS and MM:SS, speaker-first timestamps and continuation",()=>{
 const cues=parseDiscapTranscript(
   "Tonight's call transcript\n\n00:02 - Nug: I have a plan.\nA questionable plan.\n"+
   "Sven [01:02:03]: I cast the spell.\n","call.txt");
 assert.equal(cues[0].text,"I have a plan. A questionable plan.");
 assert.equal(cues[1].startMs,3723000);
 assert.equal(cues[1].rawSpeaker,"Sven");
});
test("Discap import fails closed on unrecognized timestamps or out-of-order lines",()=>{
 assert.throws(()=>parseDiscapTranscript(
   "[00:01:00] GM: Start\n[00:00:50] Player: Earlier","t.txt"),/out of order/);
 assert.throws(()=>parseDiscapTranscript(
   "[00:00:01] GM: Start\n[00:00:02] Unexpected speaker layout","t.txt"),/Unsupported timestamp/);
});
test("Discap refuses vague un-timestamped narrative rather than inventing cues",()=>{
 assert.throws(()=>parseDiscapTranscript("GM: You enter the dungeon.","discap.txt"),
 /No speaker-labeled timed dialogue/);
 assert.throws(()=>parseDiscapTranscript("[00:01] GM: ready","transcript.pdf"),/Discap .txt/);
});
test("Discap preserves every utterance in long recordings and bounded end cues",()=>{
 const lines=Array.from({length:100},(_,i)=>
   "["+String(Math.floor(i/60)).padStart(2,"0")+":"+
   String(i%60).padStart(2,"0")+"] Speaker: Line "+i);
 const cues=parseDiscapTranscript(lines.join("\n"),"session.txt");
 assert.equal(cues.length,100);
 assert.equal(cues[99].text,"Line 99");
 assert.ok(cues.every(c=>c.endMs>c.startMs));
});

test("real Discap TXT layout: title, ISO start, duration, participants, separator, minute timestamps",()=>{
 // Structure reproduced from a real user-provided Discap export; dialogue and identities are fictional.
 const input=[
  "Leaving Town for the Old Road",
  "",
  "Started: 2026-11-04T21:36:51.854Z",
  "Duration: 05:46",
  "Participants: GM (DM/Two Characters)",
  "",
  "----",
  "",
  "[00:00] GM (DM/Two Characters): The party gathers by the northern gate.",
  "[01:03] GM (DM/Two Characters): A cartographer gives you a map.",
  "[02:37] GM (DM/Two Characters): Should we head out? Yes, let's go.",
  "[03:57] GM (DM/Two Characters): We have several healing potions.",
  "[05:42] GM (DM/Two Characters): You leave the city.",
 ].join("\n");
 const result=parseDiscapTranscriptDocument(input,"2026-11-04-2136-leaving-town.txt");
 assert.equal(result.title,"Leaving Town for the Old Road");
 assert.equal(result.startedAt,"2026-11-04T21:36:51.854Z");
 assert.equal(result.durationMs,346000);
 assert.equal(result.participants,"GM (DM/Two Characters)");
 assert.equal(result.cues.length,5);
 assert.equal(result.cues[0].startMs,0);
 assert.equal(result.cues[4].startMs,342000);
 assert.equal(result.cues[4].endMs,346000);
 assert.deepEqual([...new Set(result.cues.map(c=>c.rawSpeaker))],["GM (DM/Two Characters)"]);
});
test("Discap retains multiple Discord source labels, not individual voices inside one source",()=>{
 const source=[
  "Game night","Started: 2026-11-04T21:36:51.854Z","Duration: 01:00",
  "Participants: DM, Player","----",
  "[00:01] DM: Where do you go?",
  "[00:04] Player: Into the tavern.",
  "[00:07] DM: The barkeep greets you.",
 ].join("\n");
 const result=parseDiscapTranscriptDocument(source,"session.txt");
 assert.deepEqual(result.cues.map(c=>c.rawSpeaker),["DM","Player","DM"]);
 assert.equal(result.cues[2].endMs,12000);
});
test("Discap rejects timestamps beyond declared recording duration",()=>{
 assert.throws(()=>parseDiscapTranscriptDocument(
  "Session\nDuration: 00:30\n[00:31] GM: After the recording ended.","session.txt"),
  /at or after the recording duration/);
});
