import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Groq Whisper is given a bounded, realistic long-section response window",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts");
  assert.match(route,/GROQ_TRANSCRIPTION_TIMEOUT_MS=180_000/u);
  assert.match(route,/AbortSignal\.timeout\(GROQ_TRANSCRIPTION_TIMEOUT_MS\)/u);
  assert.match(route,/signal:deadline/u);
  assert.doesNotMatch(route,/AbortSignal\.timeout\(45000\)/u);
  assert.match(route,/if\(deadline\.aborted\)/u);
  assert.match(route,/within 3 minutes/u);
  assert.match(route,/return reply\("Groq did not return a transcription within 3 minutes/u);
});

test("an uncertain Groq result is never auto-retried or mistaken for provider quota",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts");
  assert.match(route,/check your Groq usage and saved transcript before explicitly retrying/u);
  assert.match(route,/Groq reported a timeout/u);
  assert.match(route,/temporarily unavailable \(provider error/u);
  assert.match(route,/provider\.status===429/u);
  assert.match(route,/previousTranscript\(key\)/u);
  assert.match(route,/processedClips\?\.includes\(receipt\)/u);
  const request=route.slice(route.indexOf('provider=await fetch("https://api.groq.com/openai/v1/audio/transcriptions"'),route.indexOf('if(!provider.ok)'));
  assert.doesNotMatch(request,/retry|setTimeout|while\(/u);
});

test("Step 3 distinguishes transfer completion from provider verification",async()=>{
  const ui=await read("app/campaigns/session-recap-staged-transcriber.tsx");
  assert.match(ui,/transferred\. TWE is verifying audio and awaiting/u);
  assert.doesNotMatch(ui,/transferred and verified\. Waiting for/u);
  assert.match(ui,/No automatic retry was made/u);
  assert.match(ui,/setSavedReceipts\(previous=>/u);
  assert.match(ui,/setCompleted\(i\+1\)/u);
});
