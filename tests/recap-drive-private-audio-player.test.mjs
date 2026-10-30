import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateAudioRangeHeader, audioPlaybackHeaders } from "../lib/campaigns/recap-drive-playback-range.ts";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("audio player permits common browser seek patterns within a recording",()=>{
  const bytes=900_000_000;
  assert.equal(validateAudioRangeHeader(null,bytes),null);
  assert.equal(validateAudioRangeHeader("bytes=0-",bytes),"bytes=0-");
  assert.equal(validateAudioRangeHeader("bytes=0-1",bytes),"bytes=0-1");
  assert.equal(validateAudioRangeHeader("bytes=100-999",bytes),"bytes=100-999");
  assert.equal(validateAudioRangeHeader("bytes=-65536",bytes),"bytes=-65536");
  assert.equal(validateAudioRangeHeader("bytes=899999999-900000001",bytes),"bytes=899999999-899999999");
});
test("malformed/multiple ranges do not trigger unbounded Drive downloads",()=>{
  const bytes=1000;
  for(const bad of ["bytes=1000-","bytes=-0","bytes=0-99,300-399","bytes=900-100",
    "bytes=abc-def","bytes=0-NaN","bytes=0-999999999999999999999","bytes=2-1","items=1-2"]){
    assert.throws(()=>validateAudioRangeHeader(bad,bytes),RangeError);
  }
});
test("audio stream forwarding is private and preserves seeking metadata",()=>{
  const headers=audioPlaybackHeaders("audio/mp4",new Headers({
    "content-range":"bytes 0-999/2000","content-length":"1000",etag:"abc123",
  }));
  assert.equal(headers.get("content-range"),"bytes 0-999/2000");
  assert.equal(headers.get("content-length"),"1000");
  assert.equal(headers.get("cache-control"),"private, no-store");
  assert.equal(headers.get("accept-ranges"),"bytes");
  assert.equal(headers.get("content-type"),"audio/mp4");
});
test("recap streaming enforces campaign and specific recap access, never shares cloud keys",async()=>{
  const [service,route,player,panel]=await Promise.all([
    read("../lib/campaigns/recap-drive-playback.ts"),
    read("../app/api/campaigns/[id]/session-recaps/audio/[assetId]/stream/route.ts"),
    read("../app/campaigns/session-recap-audio-player.tsx"),
    read("../app/campaigns/session-recap-panel.tsx"),
  ]);
  assert.match(service,/loadCampaignAccess\(db,actor,campaignId\)/u);
  assert.match(service,/getCampaignSessionRecap\(db,actor,campaignId,audio\.recapId\)/u);
  assert.match(service,/WHERE a\.id=\? AND a\.campaign_id=\?/u);
  assert.match(service,/s\.id=a\.connection_id AND s\.user_id=a\.storage_owner_user_id/u);
  assert.match(service,/getGmDriveAccessToken\(db,settings,audio\.ownerUserId,audio\.connectionId\)/u);
  assert.match(service,/redirect:"manual"/u);
  assert.match(service,/https:\/\/www.googleapis.com\/drive\/v3\/files\//u);
  assert.match(service,/\?alt=media/u);
  assert.match(service,/new Response\(upstream\.body/u);
  assert.doesNotMatch(service,/arrayBuffer\(\)|await upstream\.text\(\)|await upstream\.json\(\)/u);
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/request\.headers\.get\("range"\)/u);
  assert.match(route,/status:416/u);
  assert.match(player,/<audio key=\{selected\.id\} controls preload="metadata"/u);
  assert.match(player,/\/stream/u);
  assert.match(panel,/<SessionRecapAudioPlayer key=\{selected\.id\}/u);
  assert.doesNotMatch(player,/remote_file_id|refresh_token|access_token|GOOGLE_DRIVE_CLIENT_SECRET/u);
});
