import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("standalone character pages expose authorized campaign maps", async () => {
  const [page, control, launcher] = await Promise.all([
    readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-map-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterMapControl/u);
  assert.match(page, /payload\.campaigns/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(control, /campaigns: CharacterMapCampaign\[\]/u);
  assert.match(control, /<select/u);
  assert.match(control, />\s*Map\s*</u);
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
