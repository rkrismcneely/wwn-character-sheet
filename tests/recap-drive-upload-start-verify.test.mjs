import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("only GM may prepare uploads using their own encrypted Drive connection",async()=>{
  const [service,token]=await Promise.all([
    read("../lib/campaigns/recap-drive-upload-service.ts"),
    read("../lib/campaigns/recap-drive-token.ts"),
  ]);
  assert.match(service,/canManageCampaignContent\(actor,data\.campaign,data\.membership\)/u);
  assert.match(service,/requireActiveCampaign\(data\.campaign\)/u);
  assert.match(service,/getCampaignSessionRecap\(db,actor,campaignId,input\.recapId\)/u);
  assert.match(service,/getGmDriveAccessToken\(db,settings,actor!\.userId,input\.connectionId\)/u);
  assert.match(token,/WHERE id=\? AND user_id=\? AND provider='google-drive'/u);
  assert.match(token,/decryptDriveRefreshToken\(settings,userId,connectionId/u);
  assert.match(token,/grant_type:"refresh_token"/u);
  assert.doesNotMatch(service,/R2Bucket|BUCKET\.put|audioBytes|arrayBuffer\(\)/u);
});
test("session start verifies host, binds file marker and does not return GM OAuth token",async()=>{
  const service=await read("../lib/campaigns/recap-drive-upload-service.ts");
  assert.match(service,/redirect:"manual"/u);
  assert.match(service,/validateDriveSessionUrl\(location\)/u);
  assert.match(service,/tweAudioAssetId:assetId,tweCampaignId:campaign\.id/u);
  assert.match(service,/x-upload-content-length/u);
  assert.match(service,/status='preparing'|,'preparing'/u);
  assert.match(service,/return \{assetId,uploadSessionUrl,chunkBytes:/u);
  const returned=service.slice(service.indexOf("return {assetId,uploadSessionUrl"));
  assert.doesNotMatch(returned.slice(0,110),/accessToken|refreshToken/u);
});
test("upload completion checks Google file attributes before marking asset ready",async()=>{
  const service=await read("../lib/campaigns/recap-drive-upload-service.ts");
  assert.match(service,/WHERE id=\? AND campaign_id=\? AND storage_owner_user_id=\?/u);
  assert.match(service,/file\.size!==String\(asset\.byteSize\)/u);
  assert.match(service,/file\.mimeType!==asset\.mimeType/u);
  assert.match(service,/file\.appProperties\?\.tweAudioAssetId!==asset\.id/u);
  assert.match(service,/file\.appProperties\?\.tweCampaignId!==campaign\.id/u);
  assert.match(service,/WHERE id=\? AND campaign_id=\? AND storage_owner_user_id=\? AND status='preparing'/u);
  assert.match(service,/remote_file_id=\?,status='ready'/u);
});
test("browser cannot finish an asset from another origin or without sign-in",async()=>{
  const [start,finish]=await Promise.all([
    read("../app/api/campaigns/[id]/session-recaps/audio/upload/start/route.ts"),
    read("../app/api/campaigns/[id]/session-recaps/audio/upload/finish/route.ts"),
  ]);
  for(const source of [start,finish]){
    assert.match(source,/getSessionActor\(request\)/u);
    assert.match(source,/request\.headers\.get\("origin"\)!==CANONICAL_ORIGIN/u);
    assert.match(source,/readBoundedJson\(request,/u);
    assert.match(source,/cache-control":"private, no-store"/u);
    assert.doesNotMatch(source,/export async function GET/u);
  }
});
