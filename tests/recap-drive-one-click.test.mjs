import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Storage screen offers one-click Google consent and clean connection status",async()=>{
  const component=await read("app/account/recap-storage-connections.tsx");
  assert.match(component,/Google Drive Storage/u);
  assert.match(component,/Connect Google Drive/u);
  assert.match(component,/Reconnect Google Drive/u);
  assert.match(component,/ENDPOINT \+ "\/start"/u);
  assert.match(component,/Google asks your permission/u);
  assert.match(component,/Tales Without End/u);
  assert.match(component,/Connected/u);
  assert.match(component,/Confirm disconnect/u);
  assert.match(component,/role="status"/u);
  assert.doesNotMatch(component,/console\.cloud\.google\.com/u);
  assert.doesNotMatch(component,/GOOGLE_DRIVE_CLIENT_ID|RECAP_STORAGE_ENCRYPTION_KEY|redirect_uri|api\/account\/storage\/google-drive\/callback/u);
  assert.doesNotMatch(component,/<details>|<ol>|<li>/u);
});

test("Drive callback returns directly to recap setup, distinguishing user cancellation",async()=>{
  const callback=await read("app/api/account/storage/google-drive/callback/route.ts");
  assert.match(callback,/"connected" \| "error" \| "cancelled"/u);
  assert.match(callback,/params\.get\("error"\) === "access_denied"/u);
  assert.match(callback,/#recap-setup/u);
  assert.match(callback,/consumeDriveState\(db, actor\.userId, state\)/u);
  assert.match(callback,/encryptDriveRefreshToken/u);
  assert.doesNotMatch(callback,/console\.log\(|Response\.json\(\{.*refresh_token/u);
});

test("Connection screen removes one-time query result without losing Account anchor",async()=>{
  const component=await read("app/account/recap-storage-connections.tsx");
  assert.match(component,/currentUrl\.searchParams\.delete\("drive"\)/u);
  assert.match(component,/currentUrl\.pathname \+ currentUrl\.search \+ currentUrl\.hash/u);
  assert.match(component,/result\.connections/u);
  assert.match(component,/cache: "no-store"/u);
});
