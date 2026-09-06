import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignMapDrawerDefaultWidth,
  campaignMapDrawerMinWidth,
  clampCampaignMapDrawerWidth,
  resizedCampaignMapDrawerWidth,
} from "../lib/campaigns/map-drawer.ts";

test("side drawer resizing remains edge-anchored and only respects the viewport", () => {
  assert.equal(campaignMapDrawerDefaultWidth, 400);
  assert.equal(clampCampaignMapDrawerWidth(40, 1600), campaignMapDrawerMinWidth);
  assert.equal(clampCampaignMapDrawerWidth(900, 1600), 900);
  assert.equal(clampCampaignMapDrawerWidth(500, 400), 368);

  assert.equal(resizedCampaignMapDrawerWidth({
    dock: "right",
    startWidth: 400,
    startClientX: 1000,
    clientX: 880,
    viewportWidth: 1600,
  }), 520);
  assert.equal(resizedCampaignMapDrawerWidth({
    dock: "left",
    startWidth: 400,
    startClientX: 300,
    clientX: 420,
    viewportWidth: 1600,
  }), 520);
});

test("map drawer presents compact grouped controls and supports both docks", async () => {
  const [launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(launcher, /mapDrawerDockStorageKey/u);
  assert.match(launcher, /mapDrawerWidthStorageKey/u);
  assert.match(launcher, /handleDrawerResizeStart/u);
  assert.match(launcher, /Resize map side drawer/u);
  assert.match(launcher, /Dock<\/span>/u);
  assert.match(launcher, />Left<\/button>/u);
  assert.match(launcher, />Right<\/button>/u);
  assert.match(launcher, /campaign-map-control-label">Map/u);
  assert.match(launcher, /campaign-map-control-label">Table/u);
  assert.match(launcher, /<option value="pip">Picture-in-Picture<\/option>/u);
  assert.doesNotMatch(launcher, /<summary>Window<\/summary>|Separate Window|Split panel|Floating window/u);
  assert.match(css, /campaign-map-drawer-left/u);
  assert.match(css, /campaign-map-drawer-right/u);
  assert.match(css, /campaign-map-drawer-resize-handle/u);
  assert.match(css, /empty\s+outer\s+gutter/u);
  assert.match(css, /campaign-map-collapsed-drawer/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.campaign-map-dock-control\s*\{\s*display: none/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?campaign-map-drawer-resize-handle\s*\{\s*display: none/u);

  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /data-campaign-map-drawer="right"/u);
  assert.match(globals, /data-campaign-map-drawer="left"/u);
  assert.match(globals, /var\(--campaign-map-drawer-space\)/u);
});
