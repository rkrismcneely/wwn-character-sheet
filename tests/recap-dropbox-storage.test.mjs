import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {dropboxConfigured,dropboxCookie,hasDropboxCookie,
  encryptDropboxRefreshToken,decryptDropboxRefreshToken,dropboxAuthorizationUrl} from "../lib/account/recap-dropbox-oauth.ts";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const config={DROPBOX_APP_KEY:"test_public_app_key",DROPBOX_APP_SECRET:"test_secret",
  RECAP_STORAGE_ENCRYPTION_KEY:"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"};

test("Dropbox OAuth is disabled until the app and storage encryption are configured",()=>{
  assert.equal(dropboxConfigured(config),true);
  assert.equal(dropboxConfigured({...config,DROPBOX_APP_SECRET:undefined}),false);
  assert.equal(dropboxConfigured({...config,RECAP_STORAGE_ENCRYPTION_KEY:"bad"}),false);
  const url=new URL(dropboxAuthorizationUrl(config,"some-long-state"));
  assert.equal(url.origin,"https://www.dropbox.com");
  assert.equal(url.searchParams.get("token_access_type"),"offline");
  assert.match(url.searchParams.get("redirect_uri")??"",/\/api\/account\/storage\/dropbox\/callback$/u);
  for(const scope of ["files.content.read","files.content.write","files.metadata.read","account_info.read"])
    assert.ok((url.searchParams.get("scope")??"").includes(scope));
});

test("OAuth cookie is scoped and not readable by client code",()=>{
  const state="a".repeat(43);
  const cookie=dropboxCookie(state);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Lax/u);
  assert.match(cookie,/Path=\/api\/account\/storage\/dropbox/u);
  assert.equal(hasDropboxCookie(new Request("https://taleswithoutend.com",{headers:{cookie}}),state),true);
  assert.equal(hasDropboxCookie(new Request("https://taleswithoutend.com",{headers:{cookie}}),"b".repeat(43)),false);
  assert.match(dropboxCookie("",true),/Max-Age=0/u);
});

test("Dropbox refresh token is confidential and bound to user + connection",async()=>{
  const row=await encryptDropboxRefreshToken(config,"user-A","connection-A","secret-refresh");
  assert.notEqual(row.ciphertext,"secret-refresh");
  assert.equal(await decryptDropboxRefreshToken(config,"user-A","connection-A",row),"secret-refresh");
  await assert.rejects(()=>decryptDropboxRefreshToken(config,"user-B","connection-A",row));
  await assert.rejects(()=>decryptDropboxRefreshToken(config,"user-A","connection-B",row));
});

test("Dropbox audio is bound to GM, selected asset, and original recorder",async()=>{
  const service=await read("lib/campaigns/recap-dropbox-audio.ts");
  const playback=await read("lib/campaigns/recap-drive-playback.ts");
  const editor=await read("app/campaigns/session-recap-audio-uploader.tsx");
  const wizard=await read("app/campaigns/session-recap-staged-wizard.tsx");
  assert.match(service,/canManageCampaignContent/u);
  assert.match(service,/getCampaignSessionRecap/u);
  assert.match(service,/storage_owner_user_id/u);
  assert.match(service,/filePath\(asset\)/u);
  assert.match(service,/validMetadata\(data,asset\)/u);
  assert.match(service,/upload_session\/append_v2/u);
  assert.match(service,/upload_session\/finish/u);
  assert.match(service,/create_folder_v2/u);
  assert.match(playback,/getGmDropboxAccessToken/u);
  assert.match(playback,/getCampaignSessionRecap/u);
  assert.match(playback,/audio\.provider==="dropbox"/u);
  assert.match(playback,/validateAudioRangeHeader/u);
  assert.match(editor,/uploadRecordingToDropbox/u);
  assert.match(editor,/upload\/dropbox\/recover/u);
  assert.match(wizard,/Dropbox/u);
});

test("Dropbox account connection and routing never expose stored OAuth credentials",async()=>{
  const callback=await read("app/api/account/storage/dropbox/callback/route.ts");
  const account=await read("app/api/account/storage/dropbox/route.ts");
  const connect=await read("app/account/recap-dropbox-connection.tsx");
  assert.match(callback,/consumeDropboxState/u);
  assert.match(callback,/encryptDropboxRefreshToken/u);
  assert.doesNotMatch(account,/credential_ciphertext/u);
  assert.match(connect,/Reconnect Dropbox/u);
});
