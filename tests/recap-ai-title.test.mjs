import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  parseGeneratedRecapTitle,isPlaceholderRecapTitle,RECORDING_WORKING_TITLE,
} from "../lib/campaigns/recap-ai-title.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Gemini recap H1 becomes a separate clean session title, without removing chapter headings",()=>{
  const ai="# The Midnight Bargain at Blackwater\n\nThe party uncovered a sealed pact.\n\n## 00:23:10 — The gate\nDetails.";
  assert.deepEqual(parseGeneratedRecapTitle(ai),{
    title:"The Midnight Bargain at Blackwater",
    content:"The party uncovered a sealed pact.\n\n## 00:23:10 — The gate\nDetails.",
  });
  assert.deepEqual(parseGeneratedRecapTitle("#   The   Secret   Below   Rotthold  \n\nEvents."),{
    title:"The Secret Below Rotthold",content:"Events.",
  });
});

test("existing AI versions and ordinary scene headings are backward compatible",()=>{
  for(const content of [
    "## 00:05:10 — The Harbor\n"+ "Details".repeat(30),
    "A prose introduction.\n\n## 00:05:10 — The Harbor",
    "# 00:00:10 — Scene title\nThe scene details.",
    "# 24-10-31 — Scene title\nThe scene details.",
    "# "+ "X".repeat(121)+"\nThe scene details.",
    "# A Title Without Content\n\n",
  ]){
    assert.deepEqual(parseGeneratedRecapTitle(content),{title:null,content});
  }
});

test("working titles are replaceable placeholders, real GM titles are protected",()=>{
  assert.equal(RECORDING_WORKING_TITLE,"Session recording");
  for(const title of ["Session recording"," session recording ","UNTITLED","Untitled session","New session"])
    assert.equal(isPlaceholderRecapTitle(title),true);
  for(const title of ["The Keep Falls","Our first session","Session 2: The Gate"])
    assert.equal(isPlaceholderRecapTitle(title),false);
});

test("AI output contract, server persistence and Journal title synchronization",async()=>{
  const [runner,manager,status,recaps]=await Promise.all([
    read("lib/campaigns/recap-only-runner.ts"),
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("lib/campaigns/session-recaps.ts"),
  ]);
  assert.match(runner,/First line: # A distinctive, inventive episode title/u);
  assert.match(runner,/const suggestion=parseGeneratedRecapTitle\(markdown\)/u);
  assert.match(runner,/SET status='ready',generated_markdown=\?/u);
  assert.match(runner,/AND is_published=0/u);
  assert.match(runner,/lower\(trim\(title\)\) IN/u);
  assert.match(runner,/content='\*Recording awaiting a GM-approved recap\.\*'/u);
  assert.match(manager,/draft\.title\.trim\(\)\|\|RECORDING_WORKING_TITLE/u);
  assert.match(manager,/Working title \(optional\)/u);
  assert.match(manager,/isPlaceholderRecapTitle\(current\.title\)/u);
  assert.match(manager,/onSuggestedTitle=\{title=>setDraft/u);
  assert.match(status,/parseGeneratedRecapTitle\(version\.generatedMarkdown!\)/u);
  assert.match(status,/Use AI title/u);
  assert.match(status,/Copy this version into editor/u);
  assert.match(recaps,/draft\.date\.slice\(2\)\+" — "\+draft\.title/u);
});
