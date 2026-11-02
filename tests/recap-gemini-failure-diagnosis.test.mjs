import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {summarizeRecapGeminiFailure}
  from "../lib/campaigns/recap-gemini-failure-diagnosis.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("recognizes provider rate limit and daily quota from Gemini's documented error codes",()=>{
  const rate=summarizeRecapGeminiFailure({
    status:"failed",errors:[{code:"https://google.dev/errors/rate_limit_exceeded",message:"try again"}],
    usage:{total_input_tokens:249110},
  });
  assert.equal(rate.kind,"minute_rate_limit");
  assert.equal(rate.inputTokens,249110);
  assert.equal(summarizeRecapGeminiFailure({
    errors:[{code:"quota_exceeded",message:"Daily quota reached"}],
  }).kind,"daily_quota");
  assert.equal(summarizeRecapGeminiFailure({
    errors:[{code:"out_of_range",message:"Out of range"}],
  }).kind,"input_limit");
});

test("recognizes oversized-audio errors and service / permission errors without leaking messages",()=>{
  const confidential="my-private-password-and-session-character";
  const large=summarizeRecapGeminiFailure({
    errors:[{code:"",message:"Input tokens exceed the maximum tokens limit. "+confidential}],
  });
  assert.equal(large.kind,"input_limit");
  assert.equal(JSON.stringify(large).includes(confidential),false);
  assert.equal(summarizeRecapGeminiFailure({errors:[{code:"api_error"}]}).kind,"server_error");
  assert.equal(summarizeRecapGeminiFailure({errors:[{code:"payment_required"}]}).kind,"permission");
  assert.equal(summarizeRecapGeminiFailure({errors:[{code:"safety_blocked"}]}).kind,"content_blocked");
  assert.equal(summarizeRecapGeminiFailure({errors:[{code:"invalid_request"}]}).kind,"request_rejected");
});

test("a bare failed state or malformed provider response never fabricates a cause",()=>{
  assert.equal(summarizeRecapGeminiFailure({status:"failed"}).kind,"unknown");
  assert.equal(summarizeRecapGeminiFailure(null).kind,"unknown");
  assert.equal(summarizeRecapGeminiFailure({
    status:"failed",errors:[{code:"nonsense",message:"Something happened"}],
    usage:{total_input_tokens:-1},
  }).inputTokens,null);
  assert.equal(summarizeRecapGeminiFailure({
    usage:{total_input_tokens:12.5},
  }).inputTokens,null);
});

test("the diagnose route only reads existing GM-owned failed interaction",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/auto-recap/diagnose/route.ts");
  const ui=await read("app/campaigns/session-recap-auto-status.tsx");
  assert.match(route,/export async function POST\(/u);
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/canManageCampaignContent/u);
  assert.match(route,/getCampaignSessionRecap/u);
  assert.match(route,/requested_by=\? AND confirmed_at IS NOT NULL/u);
  assert.match(route,/\["interaction_failed","segment_interaction_failed"\]/u);
  assert.match(route,/request\.headers\.get\("origin"\)!==CANONICAL_ORIGIN/u);
  assert.match(route,/method:"GET"/u);
  assert.match(route,/\/v1beta\/interactions\//u);
  assert.doesNotMatch(route,/method:"POST"[^\n]*fetch\(/u);
  assert.doesNotMatch(route,/\/upload\/v1beta\/files|\/v1beta\/interactions",\{/u);
  assert.match(route,/summarizeRecapGeminiFailure\(detail\)/u);
  assert.match(route,/resubmitted:false/u);
  assert.match(ui,/Recheck Gemini error \(no AI request\)/u);
  assert.match(ui,/endpoint\+"\/diagnose"/u);
});

test("nested Gemini errors and sanitized fingerprints",()=>{
  const secret="private-audio-token-123";
  const result=summarizeRecapGeminiFailure({
    status:"failed",response:{error:{status:"SERVICE_UNAVAILABLE",message:secret}},
  });
  assert.equal(result.kind,"server_error");
  assert.equal(result.providerCode,"service_unavailable");
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.match(result.diagnosticFingerprint,/gemini-v2:/);
  assert.equal(summarizeRecapGeminiFailure({
    failure:{details:[{reason:"RESOURCE_EXHAUSTED"}]},
  }).kind,"minute_rate_limit");
});

test("diagnosis distinguishes final recap writing from combined audio processing",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/auto-recap/diagnose/route.ts");
  const ui=await read("app/campaigns/session-recap-auto-status.tsx");
  assert.match(route,/processing_mode AS processingMode/u);
  assert.match(route,/job\.processingMode==="segmented"\?"final_recap_writing"/u);
  assert.match(route,/job\.processingMode==="single"\?"combined_audio_and_recap"/u);
  assert.match(route,/processingMode:job\.processingMode,resubmitted:false/u);
  assert.match(ui,/Processing mode:/u);
  assert.match(ui,/processingMode:data\.processingMode/u);
});
