import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {GEMINI_TRANSCRIPTION_MODELS,DEFAULT_GEMINI_TRANSCRIPTION_MODEL,
  parseGeminiTranscriptionModel} from "../lib/campaigns/recap-gemini-models.ts";

const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("dedicated Gemini Transcribe is recommended; only supported audio models are offered",()=>{
  assert.equal(DEFAULT_GEMINI_TRANSCRIPTION_MODEL,"gemini-3.5-transcribe");
  assert.ok(GEMINI_TRANSCRIPTION_MODELS.some(m=>m.id==="gemini-3.8-flash"));
  assert.equal(GEMINI_TRANSCRIPTION_MODELS.filter(m=>m.recommended).length,1);
  for(const model of GEMINI_TRANSCRIPTION_MODELS)
    assert.equal(parseGeminiTranscriptionModel(model.id),model.id);
  for(const invalid of ["gemini-3.5-transcribe-live","gemini-3.1-flash-tts-preview",
    "gemini-unverified","",null,{}]){
    assert.throws(()=>parseGeminiTranscriptionModel(invalid));
  }
});

test("staged gateway validates Gemini model and forwards it through receipt and provider form",async()=>{
  const stage=await source("lib/campaigns/recap-staged-audio.ts");
  assert.match(stage,/parseGeminiTranscriptionModel\(body\.model\)/u);
  assert.match(stage,/form\.set\("model",model\)/u);
  assert.match(stage,/recapCloudClipReceipt\(fileBytes,provider/u);
  assert.doesNotMatch(stage,/provider==="gemini"\?GEMINI_TRANSCRIBE_MODEL/u);
});

test("Gemini request uses the dedicated transcription config only for the dedicated model",async()=>{
  const route=await source("app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts");
  assert.match(route,/parseGeminiTranscriptionModel\(form\.get\("model"\)/u);
  assert.match(route,/model===GEMINI_TRANSCRIBE_MODEL/u);
  assert.match(route,/timestamp_granularities:\["word"\]/u);
  assert.match(route,/Transcribe every audible spoken word/u);
  assert.match(route,/recapCloudClipReceipt\(await audio\.arrayBuffer\(\),"gemini"/u);
  assert.match(route,/transcription=await runGemini\(apiKey,uri,mime,model\)/u);
});

test("switching models preserves prior Gemini section receipts and requires explicit consent",async()=>{
  const ui=await source("app/campaigns/session-recap-staged-transcriber.tsx");
  assert.match(ui,/GEMINI_TRANSCRIPTION_MODELS\.map\(option=>/u);
  assert.match(ui,/for\(const alternative of GEMINI_TRANSCRIPTION_MODELS\)/u);
  assert.match(ui,/if\(alreadySaved\)\{setCompleted\(i\+1\);continue;\}/u);
  assert.match(ui,/cloud&&\(!share\|\|!billing\)/u);
  assert.match(ui,/No automatic paid fallback occurs/u);
});
