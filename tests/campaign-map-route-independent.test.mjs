import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("standalone character pages expose authorized campaign maps from the side pull tabs", async () => {
  const [page, sideTools, launcher] = await Promise.all([
    readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-side-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterSideTools/u);
  assert.doesNotMatch(page, /CampaignCharacterMapControl/u);
  assert.doesNotMatch(page, /CampaignCharacterStoreControl/u);
  assert.match(page, /payload\.campaigns/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(page, /listAuthorizedCharacterCampaigns\(db, actor, publicId\)/u);
  assert.match(sideTools, /campaignMapOpenEvent/u);
  assert.match(sideTools, /campaignMapStateEvent/u);
  assert.match(sideTools, /Open Map/u);
  assert.match(sideTools, /Open Store/u);
  assert.match(sideTools, /campaigns\.length > 1/u);
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
