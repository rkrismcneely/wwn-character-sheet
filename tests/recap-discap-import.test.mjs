import {test} from "node:test";
import assert from "node:assert/strict";
import {parseDiscapTranscript} from "../lib/campaigns/recap-discap-import.ts";

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
