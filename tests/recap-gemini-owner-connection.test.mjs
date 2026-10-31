import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  recapAIEncryptionReady,encryptGeminiUserKey,decryptGeminiUserKey,
  validateGeminiUserKey,fingerprintGeminiKey,
} from "../lib/account/recap-gemini-key.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const raw="AIzaSyDUMMYTEST_KEY_FOR_OWNER_GM_PROJECT_12345";
const secret={RECAP_STORAGE_ENCRYPTION_KEY:""};
function b64url(bytes){return Buffer.from(bytes).toString("base64url");}
test("AES-GCM encrypts user-owned keys and binds ciphertext to user and connection",async()=>{
  const config={...secret,RECAP_STORAGE_ENCRYPTION_KEY:b64url(crypto.getRandomValues(new Uint8Array(32)))};
  assert.equal(recapAIEncryptionReady(config),true);
  assert.equal(recapAIEncryptionReady(secret),false);
  const id="d9e1c237-8868-44bb-8111-21539a56d310";
  const protectedKey=await encryptGeminiUserKey(config,"user-1",id,raw);
  assert.equal(protectedKey.version,1);
  assert.ok(!JSON.stringify(protectedKey).includes(raw));
  assert.notEqual(protectedKey.ciphertext,raw);
  assert.equal(await decryptGeminiUserKey(config,"user-1",id,protectedKey),raw);
  await assert.rejects(decryptGeminiUserKey(config,"user-2",id,protectedKey));
  await assert.rejects(decryptGeminiUserKey(config,"user-1",
    "d9e1c237-8868-44bb-8111-21539a56d311",protectedKey));
  const tampered={...protectedKey,ciphertext:protectedKey.ciphertext.slice(0,-2)+"Aa"};
  await assert.rejects(decryptGeminiUserKey(config,"user-1",id,tampered));
  assert.equal((await fingerprintGeminiKey(raw)).length,12);
});
test("invalid Gemini keys and missing encryption config fail closed",async()=>{
  assert.throws(()=>validateGeminiUserKey("not-an-api-key"),/valid/);
  assert.throws(()=>validateGeminiUserKey("x".repeat(1000)),/valid/);
  await assert.rejects(encryptGeminiUserKey(secret,"user-1",
    "d9e1c237-8868-44bb-8111-21539a56d310",raw),/not configured/);
});
test("Gemini account endpoints never display the key and enforce owner and origin",async()=>{
  const code=await read("../app/api/account/recap-ai/gemini/route.ts");
  for(const fragment of [
    "getSessionActor(request)","who.id","originOk(request)",
    "encryptGeminiUserKey","decryptGeminiUserKey","readBoundedJson",
    "user_recap_ai_connections","ON CONFLICT(user_id,provider)",
    "key_ciphertext=NULL","key_nonce=NULL","key_version=NULL",
    "x-goog-api-key","generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe",
    "private, no-store",
  ])assert.ok(code.includes(fragment),"Missing owner-secret boundary: "+fragment);
  assert.doesNotMatch(code,/console\.log|process\.env\.GEMINI_API_KEY|openai\.com|script:eval/u);
  assert.ok(!code.includes('return Response.json({apiKey'));
});
test("D1 connection schema stores ciphertext, is unique per user and disconnect wipes secrets",async()=>{
  const sql=await read("../drizzle/0040_recap_ai_connections.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS user_recap_ai_connections/u);
  assert.match(sql,/REFERENCES user\(id\) ON DELETE CASCADE/u);
  assert.match(sql,/UNIQUE\(user_id,provider\)/u);
  assert.match(sql,/key_ciphertext TEXT/u);
  assert.match(sql,/key_nonce TEXT/u);
  assert.match(sql,/status='disconnected' AND key_ciphertext IS NULL/u);
  assert.doesNotMatch(sql,/api_key_plaintext|secret_key TEXT/u);
});
test("Account manages Gemini access, explicitly informs of billing and no false background claims",async()=>{
  const [ui,page]=await Promise.all([
    read("../app/account/recap-ai-connections.tsx"),read("../app/account/account-page.tsx"),
  ]);
  assert.match(ui,/type="password"/u);
  assert.match(ui,/autoComplete="off"/u);
  assert.match(ui,/approved/u);
  assert.match(ui,/Test connection/u);
  assert.match(ui,/Disconnect/u);
  assert.match(ui,/Unattended processing after you close the browser is still under development/u);
  assert.doesNotMatch(ui,/localStorage|sessionStorage/u);
  assert.match(page,/RecapAIConnections/u);
});

test("Gemini transcription consumes only invoking GM's own encrypted account connection",async()=>{
  const [api,client]=await Promise.all([
    read("../app/api/campaigns/[id]/session-recaps/transcript/gemini/route.ts"),
    read("../app/campaigns/session-recap-groq-transcriber.tsx"),
  ]);
  assert.match(api,/WHERE user_id=\? AND provider='gemini'/u);
  assert.match(api,/\.bind\(actor\.userId\)/u);
  assert.match(api,/decryptGeminiUserKey/u);
  assert.match(api,/row\.status!=="connected"/u);
  assert.match(api,/actor\.userId,row\.id/u);
  assert.doesNotMatch(api,/sharedGeminiKey|SITE_OWNER_GEMINI_KEY|process\.env\.GOOGLE_API_KEY/u);
  assert.match(client,/connectedGemini/u);
  assert.match(client,/api\/account\/recap-ai\/gemini/u);
  assert.ok(client.includes('(!key.trim()&&!connectedGemini)'));
  assert.match(client,/if\(key\.trim\(\)\)form\.set\("apiKey",key\.trim\(\)\)/u);
});
