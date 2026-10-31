import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  classifyDriveAboutError, DriveConnectionFailure,
} from "../lib/account/recap-drive-errors.ts";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("Drive API failure classification uses structured reason codes only",()=>{
  assert.equal(classifyDriveAboutError(403,{
    error:{details:[{"@type":"type.googleapis.com/google.rpc.ErrorInfo",reason:"SERVICE_DISABLED",
      metadata:{service:"drive.googleapis.com"}}]},
  }),"drive_api_disabled");
  assert.equal(classifyDriveAboutError(403,{error:{errors:[{reason:"accessNotConfigured"}]}}),
    "drive_api_disabled");
  assert.equal(classifyDriveAboutError(403,{error:{message:"Service disabled"} }),
    "drive_access_denied");
  assert.equal(classifyDriveAboutError(401,null),"drive_access_denied");
  assert.equal(classifyDriveAboutError(429,null),"drive_api_unavailable");
  assert.equal(classifyDriveAboutError(500,null),"drive_api_unavailable");
  assert.equal(classifyDriveAboutError(403,{error:{details:[{reason:"arbitraryValue"}]}}),
    "drive_access_denied");
  assert.equal(classifyDriveAboutError(403,{error:{details:"SERVICE_DISABLED"}}),
    "drive_access_denied");
});

test("Drive connection errors expose fixed codes rather than provider messages",()=>{
  const error=new DriveConnectionFailure("token_exchange");
  assert.equal(error.code,"token_exchange");
  const callback=read("app/api/account/storage/google-drive/callback/route.ts");
  return callback.then(source=>{
    assert.match(source,/url\.searchParams\.set\("drive_error", reason\)/u);
    assert.match(source,/if \(error instanceof DriveConnectionFailure\)/u);
    assert.match(source,/return end\("error", "state_cookie_missing"\)/u);
    assert.match(source,/return end\("error", "state_expired"\)/u);
    assert.match(source,/return end\("error", "database_error"\)/u);
    assert.doesNotMatch(source,/error\.message|console\.log|token\.access_token\s*\+|params\.get\("code"\).*searchParams\.set/u);
  });
});

test("Google token exchange and Drive check classify distinct failure paths",async()=>{
  const [oauth,ui]=await Promise.all([
    read("lib/account/recap-google-drive-oauth.ts"),
    read("app/account/recap-storage-connections.tsx"),
  ]);
  for (const code of ["token_exchange","missing_refresh_token","missing_scope"]) {
    assert.match(oauth,new RegExp("DriveConnectionFailure\\(\""+code+"\"\\)","u"));
  }
  assert.match(oauth,/classifyDriveAboutError\(response\.status, reason\)/u);
  for (const code of ["drive_api_disabled","state_cookie_missing","database_error","token_exchange"]) {
    assert.match(ui,new RegExp(code+":","u"));
  }
  assert.match(ui,/currentUrl\.searchParams\.delete\("drive_error"\)/u);
  assert.doesNotMatch(ui,/setError\(errorCode\)|setError\(.*searchParams\.get\("drive_error"\)\)/u);
});
