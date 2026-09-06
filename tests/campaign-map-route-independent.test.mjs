import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("standalone character pages expose authorized campaign maps in the signed-in header", async () => {
  const [page, control, launcher, header] = await Promise.all([
    readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-map-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app-header.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterMapControl/u);
  assert.match(page, /payload\.campaigns/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(control, /campaigns: CharacterMapCampaign\[\]/u);
  assert.match(control, /document\.querySelector\("\.app-header \.app-header-utilities"\)/u);
  assert.match(control, /document\.querySelector\("\.topbar \.status"\)/u);
  assert.match(control, /new MutationObserver/u);
  assert.match(control, /if \(refreshHost\(\)\) observer\.disconnect\(\)/u);
  assert.match(header, /className="app-header-utilities"/u);
  assert.match(control, /<select/u);
  assert.match(control, /mapIsOpen \? "Close Map" : "Map"/u);
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
