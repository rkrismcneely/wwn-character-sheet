import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path,import.meta.url),"utf8");

test("Drive OAuth uses separate client, narrow scope, offline consent and short-lived one-use state",async()=>{
  const [core,start,callback,sql]=await Promise.all([
    read("../lib/account/recap-google-drive-oauth.ts"),
    read("../app/api/account/storage/google-drive/start/route.ts"),
    read("../app/api/account/storage/google-drive/callback/route.ts"),
    read("../drizzle/0036_recap_storage_oauth_states.sql"),
  ]);
  assert.match(core,/GOOGLE_DRIVE_CLIENT_ID/u);
  assert.match(core,/GOOGLE_DRIVE_CLIENT_SECRET/u);
  assert.match(core,/RECAP_STORAGE_ENCRYPTION_KEY/u);
  assert.match(core,/driveOAuthClient/u);
  assert.match(core,/GOOGLE_CLIENT_SECRET/u);
  assert.match(core,/https:\/\/www.googleapis.com\/auth\/drive\.file/u);
  assert.doesNotMatch(core,/https:\/\/www.googleapis.com\/auth\/drive["']/u);
  assert.match(core,/query\.set\("access_type", "offline"\)/u);
  assert.match(core,/query\.set\("prompt", "consent"\)/u);
  assert.match(core,/DELETE FROM user_recap_storage_oauth_states .* RETURNING user_id/u);
  assert.match(core,/DRIVE_STATE_LIFETIME_MS = 10 \* 60 \* 1000/u);
  assert.match(core,/HttpOnly; Secure; SameSite=Lax/u);
  assert.match(start,/getSessionActor\(request\)/u);
  assert.match(callback,/getSessionActor\(request\)/u);
  assert.match(callback,/consumeDriveState\(db, actor\.userId, state\)/u);
  assert.match(callback,/hasDriveStateCookie\(request, state\)/u);
  assert.match(sql,/REFERENCES user\(id\) ON DELETE CASCADE/u);
  assert.doesNotMatch(callback,/Response\.json\(\{\s*token|console\.log/u);
});

test("Drive OAuth tokens are encrypted and scoped to user and connection",async()=>{
  const [core,callback]=await Promise.all([
    read("../lib/account/recap-google-drive-oauth.ts"),
    read("../app/api/account/storage/google-drive/callback/route.ts"),
  ]);
  assert.match(core,/AES-GCM/u);
  assert.match(core,/new Uint8Array\(12\)/u);
  assert.match(core,/additionalData: associatedData\(userId, connectionId\)/u);
  assert.match(core,/crypto\.subtle\.encrypt/u);
  assert.match(core,/crypto\.subtle\.decrypt/u);
  assert.match(callback,/encryptDriveRefreshToken\(config, actor\.userId, connectionId, token\.refresh_token\)/u);
  assert.match(callback,/credential_ciphertext,credential_nonce,credential_version/u);
  assert.doesNotMatch(callback,/access_token\s*AS|refresh_token\s*AS/u);
});

test("Connection metadata and disconnect require authenticated owner; never delete cloud files",async()=>{
  const [status,disconnect,ui]=await Promise.all([
    read("../app/api/account/storage/google-drive/route.ts"),
    read("../app/api/account/storage/google-drive/disconnect/route.ts"),
    read("../app/account/recap-storage-connections.tsx"),
  ]);
  assert.match(status,/WHERE user_id = \?/u);
  assert.doesNotMatch(status,/credential_ciphertext AS|credential_nonce AS|remote_file_id AS/u);
  assert.match(disconnect,/getSessionActor\(request\)/u);
  assert.match(disconnect,/request\.headers\.get\("origin"\) !== CANONICAL_ORIGIN/u);
  assert.match(disconnect,/WHERE id=\? AND user_id=\?/u);
  assert.match(disconnect,/credential_ciphertext=NULL/u);
  assert.doesNotMatch(disconnect,/DELETE FROM campaign_recap_audio_assets|DELETE FROM google/u);
  assert.match(ui,/Connect Google Drive/u);
  assert.match(ui,/Confirm disconnect/u);
});

test("OAuth database setup is additive and migrates before deployment",async()=>{
  const [script,workflow]=await Promise.all([
    read("../scripts/migrate-recap-storage-oauth.mjs"),
    read("../.github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(script,/0036_recap_storage_oauth_states\.sql/u);
  assert.match(script,/0035_recap_user_audio_storage\.sql/u);
  assert.match(script,/DATABASE_ID/u);
  assert.match(workflow,/node scripts\/migrate-recap-storage-oauth\.mjs/u);
  assert.ok(workflow.indexOf("Apply and verify user-bound Drive OAuth state migration") < workflow.indexOf("Deploy production Worker"));
});
