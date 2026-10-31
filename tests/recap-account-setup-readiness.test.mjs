import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  driveConfiguration,driveOAuthClient,authorizationUrl,DRIVE_CALLBACK,
} from "../lib/account/recap-google-drive-oauth.ts";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
const secret={RECAP_STORAGE_ENCRYPTION_KEY:"A".repeat(43)};
test("existing Google sign-in OAuth client can be used for separate explicit Drive consent",()=>{
  const settings={...secret,GOOGLE_CLIENT_ID:"id.apps.googleusercontent.com",GOOGLE_CLIENT_SECRET:"mysecret"};
  assert.equal(driveConfiguration(settings),true);
  assert.equal(driveOAuthClient(settings)?.clientId,settings.GOOGLE_CLIENT_ID);
  const url=new URL(authorizationUrl(settings,"teststate"));
  assert.equal(url.searchParams.get("redirect_uri"),DRIVE_CALLBACK);
  assert.equal(url.searchParams.get("access_type"),"offline");
  assert.equal(url.searchParams.get("scope"),"https://www.googleapis.com/auth/drive.file");
  assert.ok(!url.searchParams.get("scope").includes("https://www.googleapis.com/auth/drive "));
  assert.equal(driveConfiguration({...settings,RECAP_STORAGE_ENCRYPTION_KEY:""}),false);
  assert.equal(driveConfiguration({...settings,GOOGLE_DRIVE_CLIENT_ID:"incomplete"}),false);
  const dedicated={...settings,GOOGLE_DRIVE_CLIENT_ID:"drive-client",GOOGLE_DRIVE_CLIENT_SECRET:"drive-secret"};
  assert.equal(driveOAuthClient(dedicated)?.clientId,"drive-client");
});

test("Gemini migration runs after prerequisites and before deploy",async()=>{
  const [migration,workflow]=await Promise.all([
    read("scripts/migrate-recap-gemini-schema.mjs"),
    read(".github/workflows/migrate-session-recaps.yml"),
  ]);
  for(const version of ["0040","0041","0042","0043","0044","0045","0046"]){
    assert.match(migration,new RegExp(version+"_recap_"));
    assert.match(workflow,new RegExp("drizzle/"+version+"_recap_"));
  }
  assert.match(migration,/DATABASE_ID/u);
  assert.match(migration,/--remote/u);
  assert.match(migration,/PRAGMA table_info\(user_recap_ai_connections\)/u);
  assert.ok(workflow.indexOf("node scripts/migrate-recap-gemini-schema.mjs")>=0);
  assert.ok(workflow.indexOf("node scripts/migrate-recap-gemini-schema.mjs")<
    workflow.indexOf("npx wrangler deploy"));
});

test("recap setup endpoint is user scoped and exposes only redacted readiness",async()=>{
  const [api,ui,account,drive,gemini]=await Promise.all([
    read("app/api/account/recap-setup/route.ts"),
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/account/account-page.tsx"),
    read("app/account/recap-storage-connections.tsx"),
    read("app/account/recap-ai-connections.tsx"),
  ]);
  assert.match(api,/getSessionActor\(request\)/u);
  assert.equal((api.match(/\.bind\(actor\.userId\)/gu)||[]).length,3);
  assert.match(api,/driveConfiguration\(config\)/u);
  assert.match(api,/recapAIEncryptionReady\(config\)/u);
  assert.match(api,/ready:storageConnected&&aiConnected/u);
  assert.doesNotMatch(api,/credential_ciphertext|key_ciphertext|refresh_token|apiKey/u);
  assert.match(ui,/Configure Automatic Recap/u);
  assert.match(ui,/\/account#recap-setup/u);
  assert.match(ui,/recapSetup==="ready"/u);
  assert.match(account,/id="recap-setup"/u);
  assert.match(drive,/Connect Google Drive/u);
  assert.match(drive,/https:\/\/taleswithoutend.com\/api\/account\/storage\/google-drive\/callback/u);
  assert.match(gemini,/Get a Gemini API key from Google AI Studio/u);
  assert.match(gemini,/aistudio.google.com\/api-keys/u);
  assert.match(gemini,/readAccountReply/u);
});

test("Gemini GET responds with safe JSON on errors and key test does not require one model",async()=>{
  const api=await read("app/api/account/recap-ai/gemini/route.ts");
  assert.match(api,/try\{[\s\S]*Gemini account status is temporarily unavailable/u);
  assert.match(api,/generativelanguage.googleapis.com\/v1beta\/models\?pageSize=1/u);
  assert.doesNotMatch(api,/models\/gemini-3\.5-transcribe/u);
  assert.match(api,/Array\.isArray\(modelList\.models\)/u);
});
