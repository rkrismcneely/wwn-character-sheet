import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Groq and Gemini recap writing use supported manual redirects and reject provider 3xx",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/workflow/write/route.ts");
  const block=route.slice(route.indexOf("async function remoteWrite("),route.indexOf("function fail("));
  assert.equal(block.split('redirect:"manual"').length-1,2);
  assert.doesNotMatch(block,/redirect:"error"|"redirect":"follow"/u);
  assert.match(block,/response.status>=300&&response.status<400/u);
  assert.match(block,/No redirect was followed/u);
  assert.ok(block.indexOf("response.status>=300&&response.status<400")<block.indexOf("if(!response.ok)"));
  assert.match(block,/https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/u);
  assert.match(block,/generativelanguage\.googleapis\.com/u);
});
test("changing recap writer prevents stale saved provider from generating a recap",async()=>{
  const wizard=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(wizard,/const writerChoiceSaved=Boolean\(savedWriter&&savedWriter\.provider===writerProvider&&/u);
  assert.match(wizard,/savedWriter\.model===writerModel&&savedWriter\.detail===detail/u);
  assert.match(wizard,/savedWriter&&writerChoiceSaved&&<div/u);
  assert.match(wizard,/Writer choice has changed but is not saved/u);
  assert.match(wizard,/disabled=\{busy\|\|writerChoiceSaved\}/u);
  assert.match(wizard,/Save writer choice \(no AI request\)/u);
});
test("existing draft versions remain visible regardless of writer choice selection",async()=>{
  const wizard=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(wizard,/\{savedDrafts\.length>0&&<div/u);
  assert.match(wizard,/savedDrafts\.map\(d=>/u);
  assert.match(wizard,/onClick=\{\(\)=>void approveDraft\(d\.id\)\}/u);
});
