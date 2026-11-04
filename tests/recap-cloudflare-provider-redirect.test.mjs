import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("Groq worker fetch uses supported manual redirect and rejects a 3xx before reading result",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts");
  assert.match(route,/body:upload,redirect:"manual",signal:deadline/u);
  assert.doesNotMatch(route,/redirect:"error"/u);
  assert.match(route,/provider.status>=300&&provider.status<400/u);
  assert.match(route,/No redirect was followed/u);
  assert.ok(route.indexOf("provider.status>=300&&provider.status<400") <
    route.indexOf("if(!provider.ok)"));
  assert.match(route,/GROQ_TRANSCRIPTION_TIMEOUT_MS=180_000/u);
});
test("Gemini audio/file and interaction requests use supported manual redirects and reject all 3xx",async()=>{
  const route=await read("app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts");
  assert.equal(route.split('redirect:"manual"').length-1,3);
  assert.doesNotMatch(route,/redirect:"error"/u);
  assert.match(route,/start.status>=300&&start.status<400/u);
  assert.match(route,/response.status>=300&&response.status<400/u);
  assert.match(route,/upload-redirect/u);
  assert.match(route,/interaction-redirect/u);
  assert.match(route,/parsed.hostname!=="generativelanguage.googleapis.com"/u);
  assert.match(route,/parsed.protocol!=="https:"/u);
});
test("no browser redirect is followed with personal provider credentials",async()=>{
  const routes=await Promise.all([
    read("app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts"),
    read("app/api/campaigns/[id]/session-recaps/transcript/transcribe/route.ts"),
  ]);
  for(const route of routes){
    assert.doesNotMatch(route,/redirect:"follow"/u);
    assert.doesNotMatch(route,/redirect:"error"/u);
    assert.match(route,/redirect:"manual"/u);
  }
});
