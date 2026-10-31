import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  appendGeminiAssemblyDraft,validateCompleteGeminiAssembly,
  validateGeminiFragment,geminiAssemblyObjectKey,geminiFragmentObjectKey,
  GEMINI_ASSEMBLY_BATCH_SIZE,
} from "../lib/campaigns/recap-gemini-assembly.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const jobId="34f861e2-cbf6-4300-a682-662d5d8cc190";
const recapId="c88d321b-fce9-469c-b463-807b0acb809d";
const campaignId="cmp_"+ "A".repeat(22);
function part(trackIndex,chunkIndex,startMs,endMs,text){
  const identity={jobId,recapId,trackIndex,chunkIndex,startMs,endMs};
  const speaker={index:trackIndex,discordName:trackIndex===0?"GM":"Player 1",
    displayName:trackIndex===0?"Game Master":"Player 1",role:trackIndex===0?"gm":"player",
    characterName:trackIndex===0?null:"Tyrvelg"};
  const fragment={version:1,provider:"gemini",jobId,recapId,
    trackIndex,chunkIndex,startMs,endMs,speaker,
    cues:text?[{startMs:startMs+500,endMs:startMs+1500,rawSpeaker:speaker.discordName,
      text}]:[]};
  return {identity,fragment};
}
test("multi-track Gemini fragments assemble in global time order, preserving roles and characters",()=>{
  const first=appendGeminiAssemblyDraft(null,{jobId,recapId,totalChunks:3},
    [part(1,0,0,30000,"The door is locked."),
      part(0,0,0,30000,"Roll initiative.")],"2026-10-30T21:00:00Z");
  assert.equal(first.fragmentsProcessed,2);
  assert.deepEqual(first.cues.map(c=>c.text),["Roll initiative.","The door is locked."]);
  assert.equal(first.cues[1].characterName,"Tyrvelg");
  assert.equal(first.cues[0].role,"gm");
  const done=appendGeminiAssemblyDraft(first,{jobId,recapId,totalChunks:3},
    [part(0,1,30000,60000,"An enemy appears.")],"2026-10-30T21:05:00Z");
  assert.equal(done.fragmentsProcessed,3);
  assert.equal(validateCompleteGeminiAssembly(done,jobId,recapId,3),done);
  assert.equal(done.published,false);
  assert.equal(done.cues.length,3);
});
test("silent timed tracks count as completed without inventing dialogue",()=>{
  const draft=appendGeminiAssemblyDraft(null,{jobId,recapId,totalChunks:2},
    [part(0,0,0,30000,""),part(1,0,0,30000,"Hello.")],"now");
  assert.equal(draft.fragmentsProcessed,2);
  assert.equal(draft.cues.length,1);
  assert.doesNotThrow(()=>validateCompleteGeminiAssembly(draft,jobId,recapId,2));
  const silent=appendGeminiAssemblyDraft(null,{jobId,recapId,totalChunks:1},
    [part(0,0,0,30000,"")],"now");
  assert.throws(()=>validateCompleteGeminiAssembly(silent,jobId,recapId,1),/No speech/u);
});
test("fragment provenance, speaker IDs and session-relative timestamps cannot be faked",()=>{
  const item=part(1,0,0,30000,"Hello.");
  assert.equal(validateGeminiFragment(item.fragment,item.identity).length,1);
  assert.throws(()=>validateGeminiFragment({...item.fragment,jobId:"someone else"},item.identity));
  assert.throws(()=>validateGeminiFragment({...item.fragment,
    speaker:{...item.fragment.speaker,index:3}},item.identity));
  assert.throws(()=>validateGeminiFragment({...item.fragment,
    cues:[{...item.fragment.cues[0],rawSpeaker:"Unknown voice"}]},item.identity));
  assert.throws(()=>validateGeminiFragment({...item.fragment,
    cues:[{...item.fragment.cues[0],endMs:32000}]},item.identity));
  assert.throws(()=>validateGeminiFragment({...item.fragment,
    speaker:{...item.fragment.speaker,role:"owner"}},item.identity));
  assert.throws(()=>appendGeminiAssemblyDraft(null,{jobId,recapId,totalChunks:1},
    Array.from({length:GEMINI_ASSEMBLY_BATCH_SIZE+1},()=>item),"now"));
  assert.equal(geminiFragmentObjectKey(campaignId,jobId,1,0),
    "recap-transcript-chunks/"+campaignId+"/"+jobId+"/1-0.json");
  assert.equal(geminiAssemblyObjectKey(campaignId,jobId),
    "recap-gemini-assembled/"+campaignId+"/"+jobId+".json");
});
test("private assembly uses monotonic cursor, bounded R2 writes, lease ownership, and no player publishing",async()=>{
  const src=await read("../lib/campaigns/recap-gemini-assembly-runner.ts");
  for(const term of ["GEMINI_ASSEMBLY_BATCH_SIZE","assembly_lease_token",
    "assembly_lease_expires_at","status='awaiting_review'","completed_chunks=total_chunks",
    "assembly_cursor","assembly_cursor<=?","geminiFragmentObjectKey",
    "previous.etag","etagMatches","If-None-Match","validateCompleteGeminiAssembly",
    "assembly_needs_review","assembled_at"]){
    assert.ok(src.includes(term),"Missing assembly safety guard: "+term);
  }
  assert.doesNotMatch(src,/recapTranscriptObjectKey|published:true|generativelanguage\.googleapis|api\.groq\.com/u);
});
test("GM-only assembled route must fail on existing published transcript or unexpected concurrent edits",async()=>{
  const route=await read("../app/api/campaigns/[id]/session-recaps/background-gemini/assembled/route.ts");
  for(const term of ["getSessionActor(request)","canManageCampaignContent",
    "getCampaignSessionRecap","job.requestedBy!==actor.userId",
    'status!=="awaiting_review"',"validateCompleteGeminiAssembly",
    "prior.value?.published","body.replace!==true","prior.value.updatedAt!==body.expectedUpdatedAt",
    "etagMatches","If-None-Match","published:false","cues:draft.cues",
    "cache-control","private, no-store"]){
    assert.ok(route.includes(term),"Missing GM review/import guard: "+term);
  }
  assert.doesNotMatch(route,/generativelanguage\.googleapis|publish.*automatically|return.*apiKey/u);
});
test("recap UI previews assembled speech and reuses existing review/publish screen",async()=>{
  const [runner,staging,options,manager]=await Promise.all([
    read("../lib/campaigns/recap-gemini-scheduler.ts"),
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
    read("../app/campaigns/session-recap-transcription-options.tsx"),
    read("../app/campaigns/session-recap-manager.tsx"),
  ]);
  assert.match(runner,/assembleOneReadyGeminiJob/u);
  assert.match(staging,/Check assembled transcript/u);
  assert.match(staging,/Replace existing private transcript after confirmation/u);
  assert.match(staging,/window\.confirm/u);
  assert.match(staging,/Load into private transcript for review/u);
  assert.match(staging,/onSaved\(\)/u);
  assert.match(options,/SessionRecapGeminiStaging campaignId=\{campaignId\} recapId=\{recapId\} onSaved=\{onSaved\}/u);
  assert.match(manager,/setTranscriptRefresh\(n=>n\+1\)/u);
});
test("assembly migration is additive and matches typed schema",async()=>{
  const [migration,schema]=await Promise.all([
    read("../drizzle/0045_recap_gemini_fragment_assembly.sql"),read("../db/schema.ts"),
  ]);
  for(const field of ["assembled_transcript_key","assembled_at","assembly_cursor",
    "assembly_lease_token","assembly_lease_expires_at"]){
    assert.ok(migration.includes("ADD COLUMN "+field),"Missing assembly column: "+field);
    assert.ok(schema.includes('"'+field+'"'),"Missing schema column: "+field);
  }
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM/u);
});
