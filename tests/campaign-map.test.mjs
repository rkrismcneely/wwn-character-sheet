import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isMapBackgroundContentType,
  mapImageDimensions,
  validMapBackgroundObjectKey,
} from "../lib/campaigns/map-images.ts";

function png(width, height) {
  const data = new Uint8Array(24);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data.buffer;
}

function jpeg(width, height) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x07,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
  ]).buffer;
}

test("campaign map backgrounds accept only validated JPG and PNG dimensions", () => {
  assert.equal(isMapBackgroundContentType("image/png"), true);
  assert.equal(isMapBackgroundContentType("image/jpeg"), true);
  assert.equal(isMapBackgroundContentType("image/svg+xml"), false);
  assert.deepEqual(mapImageDimensions(png(2048, 1024), "image/png"), { width: 2048, height: 1024 });
  assert.deepEqual(mapImageDimensions(jpeg(1600, 900), "image/jpeg"), { width: 1600, height: 900 });
  assert.equal(mapImageDimensions(png(20000, 1000), "image/png"), null);
  assert.equal(mapImageDimensions(new Uint8Array([1, 2, 3]).buffer, "image/png"), null);
});

test("campaign map object keys remain opaque and scoped", () => {
  assert.equal(validMapBackgroundObjectKey("campaign-maps/cmp_example/random-id.png"), true);
  assert.equal(validMapBackgroundObjectKey("portraits/cmp_example/image.png"), false);
  assert.equal(validMapBackgroundObjectKey("campaign-maps/../secret.png"), false);
});

test("campaign map foundation persists one map per campaign and keeps backgrounds private", async () => {
  const [migration, service, route, backgroundRoute, launcher, campaignPage, gmPage, characterPage, css] = await Promise.all([
    readFile(new URL("../drizzle/0014_campaign_map_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/background/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/[id]/gm/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/[id]/characters/[characterId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_maps`/u);
  assert.match(migration, /CREATE UNIQUE INDEX `campaign_maps_campaign_unique`/u);
  assert.match(service, /canManageCampaignContent/u);
  assert.match(service, /version = version \+ 1/u);
  assert.match(route, /readCampaignMap/u);
  assert.match(route, /updateCampaignMapSettings/u);
  assert.match(backgroundRoute, /env\.BUCKET\.put/u);
  assert.match(backgroundRoute, /cache-control", "private, no-store"/u);
  assert.match(backgroundRoute, /x-content-type-options/u);
  assert.match(launcher, /<svg/u);
  assert.match(launcher, /patternUnits="userSpaceOnUse"/u);
  assert.match(launcher, /onPointerMove/u);
  assert.match(launcher, /Replace Map Image/u);
  assert.match(launcher, /Save Grid/u);
  assert.match(campaignPage, /CampaignMapLauncher/u);
  assert.match(gmPage, /CampaignMapLauncher/u);
  assert.match(characterPage, /CampaignMapLauncher/u);
  assert.match(css, /campaign-map-dialog/u);
  assert.match(css, /100dvh/u);
});

test("campaign map tokens are durable, permissioned, encounter-placeable, and realtime-invalidated", async () => {
  const [migration, service, tokenRoute, launcher, liveTypes, liveHook, durable, css] = await Promise.all([
    readFile(new URL("../drizzle/0014_campaign_map_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_map_tokens`/u);
  assert.match(migration, /campaign_map_tokens_source_unique/u);
  assert.match(service, /You can move only your own campaign character token/u);
  assert.match(service, /WHERE campaign_id = \? AND id = \? AND version = \?/u);
  assert.match(service, /placeCampaignMapEncounterTokens/u);
  assert.match(tokenRoute, /action === "place_encounter"/u);
  assert.match(tokenRoute, /announceMapChanged/u);
  assert.match(launcher, /Place Active Encounter/u);
  assert.match(launcher, /handleTokenPointerMove/u);
  assert.match(launcher, /action: "move"/u);
  assert.match(launcher, /token\.canMove/u);
  assert.match(liveTypes, /session\.map-changed/u);
  assert.match(liveHook, /campaignMapChangedEvent/u);
  assert.match(durable, /announceMapChanged/u);
  assert.match(css, /campaign-map-token-disc/u);
  assert.match(css, /campaign-map-token-npc/u);
});
