import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("standalone character pages expose authorized campaign maps from the shared side pullout tabs", async () => {
  const [page, sideTabs, launcher] = await Promise.all([
    readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-side-tabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterSideTabs/u);
  assert.match(page, /payload\.campaigns/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(page, /listAuthorizedCharacterCampaigns\(db, actor, publicId\)/u);
  assert.doesNotMatch(page, /CampaignCharacterMapControl/u);
  assert.match(sideTabs, /campaigns: CharacterCampaignSideTab\[\]/u);
  assert.match(sideTabs, /campaignMapOpenEvent/u);
  assert.match(sideTabs, /campaignStoreOpenEvent/u);
  assert.match(sideTabs, />\s*Map\s*</u);
  assert.match(sideTabs, />\s*Store\s*</u);
  assert.match(sideTabs, /drawerDockStorageKey/u);
  assert.match(sideTabs, /is-left/u);
  assert.match(sideTabs, /is-right/u);
  assert.match(launcher, /showFloatingButton/u);
});

test("token dragging converts browser pointer coordinates through the SVG transform", async () => {
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");

  assert.match(launcher, /getScreenCTM\(\)/u);
  assert.match(launcher, /matrixTransform\(matrix\.inverse\(\)\)/u);
  assert.match(launcher, /pointerMapX/u);
  assert.match(launcher, /pointerMapY/u);
  assert.match(launcher, /drag\.x \+ \(pointer\.x - drag\.pointerMapX\)/u);
  assert.match(launcher, /drag\.y \+ \(pointer\.y - drag\.pointerMapY\)/u);
});

test("visible campaign map grid is neutral grey at fifty percent opacity", async () => {
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  assert.match(css, /\.campaign-map-svg pattern path\s*\{[^}]*stroke:\s*rgba\(128, 128, 128, \.5\)/su);
});
