import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {checkGeminiModelAccess} from "../lib/account/recap-gemini-verification.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const fakeKey="AIzaTEST_PRIVATE_GM_KEY_NOT_REAL_123456";

test("Gemini verification uses a Cloudflare-compatible, non-following read-only models request",async()=>{
  let called=0;
  const outcome=await checkGeminiModelAccess(fakeKey,async(url,init)=>{
    called++;
    assert.equal(String(url),"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1");
    assert.equal(init.method,"GET");
    assert.equal(init.redirect,"manual"); // Workers rejects redirect:"error" before HTTP!
    assert.equal(init.headers["x-goog-api-key"],fakeKey);
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.body,undefined);
    return Response.json({models:[{name:"models/gemini-test"}]});
  });
  assert.equal(called,1);
  assert.deepEqual(outcome,{kind:"verified"});
});

test("Unexpected redirects are blocked and not followed or re-requested",async()=>{
  let calls=0;
  const result=await checkGeminiModelAccess(fakeKey,async(_url,init)=>{
    calls++;
    assert.equal(init.redirect,"manual");
    return Response.redirect("https://example.com/not-google",302);
  });
  assert.deepEqual(result,{kind:"provider_redirect"});
  assert.equal(calls,1);
});

test("Gemini verification categorizes Google rejection without revealing upstream bodies",async()=>{
  for(const [status,kind] of [
    [400,"invalid_key"],[401,"invalid_key"],[403,"permission_denied"],
    [429,"rate_limited"],[500,"service_unavailable"],[503,"service_unavailable"],
  ]){
    const outcome=await checkGeminiModelAccess(fakeKey,async()=>Response.json({
      error:{message:"TOKEN_OR_PRIVATE_DATA_HERE",details:"secret"}},{status}));
    assert.deepEqual(outcome,{kind});
    assert.doesNotMatch(JSON.stringify(outcome),/TOKEN_OR_PRIVATE_DATA_HERE|secret/u);
  }
});

test("Timeout, network errors, invalid JSON and unexpected model lists are not invalid credentials",async()=>{
  assert.deepEqual(await checkGeminiModelAccess(fakeKey,async()=>{
    throw new DOMException("timed out","TimeoutError");
  }),{kind:"timeout"});
  assert.deepEqual(await checkGeminiModelAccess(fakeKey,async()=>{
    throw new TypeError("private upstream URL");
  }),{kind:"network_error"});
  assert.deepEqual(await checkGeminiModelAccess(fakeKey,async()=>new Response("not json")),
    {kind:"invalid_response"});
  assert.deepEqual(await checkGeminiModelAccess(fakeKey,async()=>Response.json({models:[]})),
    {kind:"invalid_response"});
});

test("Account checks keep owner isolation and do not disable saved keys for temporary errors",async()=>{
  const [route,helper]=await Promise.all([
    read("app/api/account/recap-ai/gemini/route.ts"),
    read("lib/account/recap-gemini-verification.ts"),
  ]);
  assert.match(route,/checkGeminiModelAccess\(plain\)/u);
  assert.match(route,/result\.kind==="invalid_key"\|\|result\.kind==="permission_denied"/u);
  assert.match(route,/WHERE id=\? AND user_id=\? AND key_fingerprint=\?/u);
  assert.match(route,/decryptGeminiUserKey\(config\(\),who\.id,row\.id/u);
  assert.match(helper,/redirect:"manual"/u);
  assert.doesNotMatch(helper,/redirect:"error"\s*,|console\.(log|error)|generateContent|interactions|upload\/v1beta\/files/u);
  assert.doesNotMatch(route,/console\.(log|error)/u);
});
