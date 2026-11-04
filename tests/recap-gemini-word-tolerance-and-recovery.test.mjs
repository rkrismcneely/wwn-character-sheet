import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {geminiWordTime,normalizeGeminiWords} from "../lib/campaigns/recap-gemini-transcribe.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
function response(words,output_text="hello world"){
  return {status:"completed",output_text,steps:[{type:"model_output",content:[
    {type:"text",text:output_text,annotations:words.map(x=>({type:"word_info",...x}))},
  ]}]};
}
test("Gemini accepts official protobuf Duration offsets up to nanosecond precision",()=>{
  assert.equal(geminiWordTime("0.100s"),100);
  assert.equal(geminiWordTime("0.100123456s"),100);
  assert.equal(geminiWordTime("12s"),12000);
  assert.equal(geminiWordTime("1.23456789s"),1235);
  assert.throws(()=>geminiWordTime("12.3minutes"),/valid word timestamp/u);
});
test("correct word timings remain word-level; no section fallback added",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"0.100s",end_offset:"0.400s",text:"hello"},
    {start_offset:"0.500s",end_offset:"0.800s",text:"world"},
  ]),10000,5000);
  assert.deepEqual(cues,[{startMs:10100,endMs:10800,rawSpeaker:"",text:"hello world"}]);
});
test("one malformed annotation preserves full Gemini output with transparently coarse section timing",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"0.1s",end_offset:"0.3s",text:"hello"},
    {start_offset:"bad",end_offset:"0.8s",text:"world"},
  ]),20000,5000);
  assert.equal(cues.length,1);
  assert.equal(cues[0].startMs,20000);
  assert.equal(cues[0].endMs,25000);
  assert.match(cues[0].text,/Section-level timing only/u);
  assert.match(cues[0].text,/hello world/u);
});
test("submillisecond word times do not throw when both round to same millisecond",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"0.100000001s",end_offset:"0.100000002s",text:"hello"},
  ],"hello"),0,1000);
  assert.equal(cues[0].startMs,100);
  assert.equal(cues[0].endMs,101);
});
test("long section output is split into <=1500-character caption cues without invented word timestamps",()=>{
  const text="Dramatic events and decisions. ".repeat(200);
  const cues=normalizeGeminiWords(response([
    {start_offset:"9999s",end_offset:"10000s",text:"invalid"},
  ],text),3000,30000);
  assert.ok(cues.length>1);
  assert.ok(cues.every(c=>c.text.length<=1500&&c.startMs===3000&&c.endMs===33000));
  assert.ok(cues.map(c=>c.text.replace(/^\[Section-level timing only; word timestamps unavailable\] /u,"")).join(" ").includes("Dramatic events"));
});
test("unusable timestamps preserve complete annotated speech when output_text is missing",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"bad",end_offset:"0.2s",text:"hello"},
    {start_offset:"0.3s",end_offset:"0.5s",text:"world"},
  ],""),0,2000);
  assert.equal(cues.length,1);
  assert.equal(cues[0].text,"[Section-level timing only; word timestamps unavailable] hello world");
});
test("incomplete speech text remains cached instead of silently losing dialogue",()=>{
  assert.throws(()=>normalizeGeminiWords(response([
    {start_offset:"bad",end_offset:"0.2s",text:"hello"},
    {start_offset:"bad",end_offset:"0.4s",text:""},
  ],""),0,2000),/response is saved for recovery/u);
});
test("absolute word timestamps in a later clip map back to the recording timeline",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"120.1s",end_offset:"120.4s",text:"hello"},
    {start_offset:"120.5s",end_offset:"120.8s",text:"world"},
  ],""),120000,5000);
  assert.deepEqual(cues,[{startMs:120100,endMs:120800,rawSpeaker:"",text:"hello world"}]);
});
test("word ending fractionally beyond clip boundary is safely clamped",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"4.95s",end_offset:"5.02s",text:"ending"},
  ],""),10000,5000);
  assert.deepEqual(cues,[{startMs:14950,endMs:15000,rawSpeaker:"",text:"ending"}]);
});
test("out-of-order or out-of-range word times return complete speech with honest coarse timing",()=>{
  const cues=normalizeGeminiWords(response([
    {start_offset:"1s",end_offset:"2s",text:"first"},
    {start_offset:"9999s",end_offset:"10000s",text:"second"},
  ],""),20000,5000);
  assert.equal(cues.length,1);
  assert.match(cues[0].text,/first second/u);
  assert.match(cues[0].text,/Section-level timing only/u);
  assert.equal(cues[0].endMs,25000);
});
test("completed provider response is saved before parsing and reused without another Gemini request",async()=>{
  const code=await read("app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts");
  const cache=code.indexOf("const cached=await env.BUCKET.get(rawKey)");
  const call=code.indexOf("transcription=await runGemini(apiKey,uri,mime,model)");
  const put=code.indexOf("await env.BUCKET.put(rawKey,raw");
  const parse=code.indexOf("normalizeGeminiWords(transcription,startMs,durationMs)");
  assert.ok(cache>0&&cache<call&&call<put&&put<parse);
  assert.match(code,/if\(cached\)\{/u);
  assert.match(code,/if\(prior.item\?\.processedClips\?\.includes\(receipt\)\)/u);
  assert.match(code,/await env\.BUCKET\.delete\(rawKey\)\.catch/u);
  assert.match(code,/rawKey=key\.replace\(\/\\\.json\$\/u,""\)/u);
});
