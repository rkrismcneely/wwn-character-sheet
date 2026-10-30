import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptDriveRefreshToken, decryptDriveRefreshToken,
  authorizationUrl, driveConfiguration,
} from "../lib/account/recap-google-drive-oauth.ts";

const key = new Uint8Array(32).fill(19);
const settings = {
  GOOGLE_DRIVE_CLIENT_ID:"drive-client-id",
  GOOGLE_DRIVE_CLIENT_SECRET:"drive-client-secret",
  RECAP_STORAGE_ENCRYPTION_KEY:Buffer.from(key).toString("base64url"),
};

test("encrypts each GM Drive refresh token with unique nonce and authenticated ownership",async()=>{
  assert.ok(driveConfiguration(settings));
  const a = await encryptDriveRefreshToken(settings,"gm-a","connection-a","test-refresh-token");
  const b = await encryptDriveRefreshToken(settings,"gm-a","connection-a","test-refresh-token");
  assert.notEqual(a.nonce,b.nonce);
  assert.notEqual(a.ciphertext,b.ciphertext);
  assert.doesNotMatch(a.ciphertext,/test-refresh-token/u);
  assert.equal(await decryptDriveRefreshToken(settings,"gm-a","connection-a",a),"test-refresh-token");
  await assert.rejects(()=>decryptDriveRefreshToken(settings,"gm-b","connection-a",a));
  await assert.rejects(()=>decryptDriveRefreshToken(settings,"gm-a","connection-b",a));
  await assert.rejects(()=>decryptDriveRefreshToken(settings,"gm-a","connection-a",{...a,ciphertext:b.ciphertext}));
});
test("the Drive grant requests only drive.file and does not reuse the login redirect",()=>{
  const url = new URL(authorizationUrl(settings,"test-state"));
  assert.equal(url.origin,"https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"),"https://www.googleapis.com/auth/drive.file");
  assert.equal(url.searchParams.get("access_type"),"offline");
  assert.equal(url.searchParams.get("prompt"),"consent");
  assert.equal(url.searchParams.get("state"),"test-state");
  assert.match(url.searchParams.get("redirect_uri"),/\/api\/account\/storage\/google-drive\/callback$/u);
});
