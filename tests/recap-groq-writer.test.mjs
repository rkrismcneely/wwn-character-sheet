import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { planTranscriptRecap, validateRecapNotes, boundedGroqResponse,
  MAX_RECAP_REQUEST_CHARS, MAX_RECAP_AI_PARTS, selectGroqRecapModel } from "../lib/campaigns/recap-groq-writer.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
function cue(i,text="A player speaks.") {
  return {startMs:i*2000,endMs:i*2000+1000,rawSpeaker:"Discord GM",
    speakerName:"Storyteller",role:"gm",characterName:null,text};
}
test("recap planner covers full multi-hour transcript without silently skipping dialogue",()=>{
  const entries=Array.from({length:1200},(_,i)=>cue(i,"An important event with a character and several details. "+i));
  const plan=planTranscriptRecap(entries);
  assert.ok(plan.parts.length>1);
  assert.equal(plan.requests,plan.parts.length+1);
  assert.ok(plan.parts.every(part=>part.length<=MAX_RECAP_REQUEST_CHARS));
  assert.equal(plan.parts.join("").match(/An important event/g)?.length,entries.length);
});
test("planner fails closed for impossible provider request counts",()=>{
  assert.throws(()=>planTranscriptRecap([]));
  assert.throws(()=>planTranscriptRecap(Array.from({length:MAX_RECAP_AI_PARTS+1},
    (_,i)=>cue(i,"x".repeat(MAX_RECAP_REQUEST_CHARS-100)))));
});
test("only currently supported Groq models are selectable",()=>{
  assert.equal(selectGroqRecapModel("openai/gpt-oss-120b"),"openai/gpt-oss-120b");
  assert.equal(selectGroqRecapModel("openai/gpt-oss-20b"),"openai/gpt-oss-20b");
  assert.throws(()=>selectGroqRecapModel("llama-3.3-70b-versatile"));
});
test("final recap requires every section note and bounds model outputs",()=>{
  assert.deepEqual(validateRecapNotes(["A specific session event."],1),["A specific session event."]);
  assert.throws(()=>validateRecapNotes([],1));
  assert.throws(()=>validateRecapNotes(["too short"],1));
  assert.equal(boundedGroqResponse({choices:[{message:{content:"A coherent recap."}}]}),"A coherent recap.");
  assert.throws(()=>boundedGroqResponse({choices:[]}));
});
test("server requires GM, transcript, consent and personal key; never stores key",async()=>{
  const route=await read("../app/api/campaigns/[id]/session-recaps/generate/route.ts");
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(route,/visibility=\x27players\x27/u);
  assert.match(route,/getCampaignSessionRecap\(db,actor,id,recapId\)/u);
  assert.match(route,/recapTranscriptObjectKey/u);
  assert.match(route,/body\?\.consent!==true/u);
  assert.match(route,/body\?\.billingAcknowledged!==true/u);
  assert.match(route,/api\.groq\.com\/openai\/v1\/chat\/completions/u);
  assert.match(route,/body\.apiKey/u);
  assert.match(route,/selectGroqRecapModel\(body\.model\)/u);
  assert.match(route,/AbortSignal\.timeout\(25000\)/u);
  assert.match(route,/status===429/u);
  assert.match(route,/private, no-store/u);
  assert.doesNotMatch(route,/BUCKET\.put|INSERT INTO|UPDATE user_|process\.env\.GROQ_API_KEY/u);
});
test("client only launches on explicit consent; AI text becomes editable GM draft",async()=>{
 const [writer,editor]=await Promise.all([
   read("../app/campaigns/session-recap-ai-writer.tsx"),
   read("../app/campaigns/session-recap-manager.tsx"),
 ]);
 assert.match(writer,/type="password" autoComplete="off"/u);
 assert.match(writer,/!shareApproved/u);
 assert.match(writer,/billingApproved/u);
 assert.match(writer,/GPT-OSS 120B/u);
 assert.match(writer,/onDraft\(generated\)/u);
 assert.match(writer,/Review generated Markdown/u);
 assert.match(writer,/Keep this page open/u);
 assert.match(editor,/<SessionRecapAIWriter/u);
 assert.match(editor,/setDraft\(current=>\(\{\.\.\.current,content\}\)\)/u);
 assert.match(editor,/Replace the unsaved Markdown editor text/u);
 assert.doesNotMatch(writer,/localStorage|sessionStorage/u);
});
