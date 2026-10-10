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
  const campaignCss = await readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8");
  const headerCss = await readFile(new URL("../app/app-header.css", import.meta.url), "utf8");

  assert.match(launcher, /mapDrawerDockStorageKey/u);
  assert.match(launcher, /mapDrawerWidthStorageKey/u);
  assert.match(launcher, /handleDrawerResizeStart/u);
  assert.match(launcher, /Resize map side drawer/u);
  assert.match(launcher, /aria-label="Side drawer position"/u);
  assert.match(launcher, />Left<\/button>/u);
  assert.match(launcher, />Right<\/button>/u);
  assert.match(launcher, /aria-label="Map view and window controls"/u);
  assert.match(launcher, /campaign-map-quick-actions/u);
  assert.match(launcher, />\+ Add</u);
  assert.match(launcher, />Fog</u);
  assert.match(launcher, />Measure</u);
  assert.match(launcher, /<option value="pip">Picture-in-Picture<\/option>/u);
  assert.match(launcher, /campaign-map-drawer-collapse/u);
  assert.match(launcher, /aria-label="Close map; drag horizontally to resize side drawer"/u);
  assert.match(launcher, /source: "divider" \| "collapse"/u);
  assert.match(launcher, /suppressDrawerCollapseClickRef/u);
  assert.match(launcher, /onPointerDown=\{event => handleDrawerResizeStart\(event, "collapse"\)\}/u);
  assert.match(launcher, /campaign-map-drawer-collapse-label">Close Map<\/span>/u);
  assert.match(launcher, /dataset\.campaignMapPane/u);
  assert.match(launcher, /remainingWidth < 760 \? "narrow" : remainingWidth < 1120 \? "compact" : "wide"/u);
  assert.doesNotMatch(launcher, /<summary>Window<\/summary>|Separate Window|Split panel|Floating window/u);
  assert.match(css, /campaign-map-drawer-left/u);
  assert.match(css, /campaign-map-drawer-right/u);
  assert.match(css, /campaign-map-drawer-resize-handle/u);
  assert.match(css, /campaign-map-host-drawer \.campaign-map-toolbar-primary[\s\S]*?flex-direction: column/u);
  assert.match(css, /campaign-map-host-drawer \.campaign-map-mode-controls[\s\S]*?width: 100%/u);
  assert.match(css, /\.campaign-map-dialog[\s\S]*?--text: #f4ead8/u);
  assert.match(css, /\.campaign-map-toolbar \.campaign-kicker[\s\S]*?color: #d5a65b/u);
  assert.match(css, /empty\s+outer\s+gutter/u);
  assert.match(css, /campaign-map-collapsed-drawer/u);
  assert.match(css, /campaign-map-drawer-collapse-left[\s\S]*?left: var\(--campaign-map-drawer-space\)[\s\S]*?border-left: 0/u);
  assert.match(css, /campaign-map-drawer-collapse-right[\s\S]*?right: var\(--campaign-map-drawer-space\)[\s\S]*?border-right: 0/u);
  assert.match(css, /campaign-map-drawer-collapse[\s\S]*?cursor: ew-resize[\s\S]*?touch-action: none/u);
  assert.match(css, /campaign-map-drawer-collapse-label[\s\S]*?writing-mode: vertical-rl/u);
  assert.match(css, /campaign-map-drawer-collapse[\s\S]*?transition: left \.24s ease, right \.24s ease/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.campaign-map-dock-control\s*\{\s*display: none/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.campaign-map-mobile-launcher-button[\s\S]*?z-index: 520/u);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?campaign-map-drawer-resize-handle\s*\{\s*display: none/u);
  assert.match(campaignCss, /html\[data-campaign-map-drawer\][\s\S]*?campaign-encounter-npc-row>\.campaign-encounter-npc-combat[\s\S]*?grid-column:2\/-2/u);
  assert.match(campaignCss, /html\[data-campaign-map-drawer\][\s\S]*?campaign-encounter-friendly-actions[\s\S]*?grid-row:3/u);

  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /data-campaign-map-drawer="right"/u);
  assert.match(globals, /data-campaign-map-drawer="left"/u);
  assert.match(globals, /var\(--campaign-map-drawer-space\)/u);
  assert.match(globals, /data-campaign-map-drawer="right"[\s\S]*?\.site-shell[\s\S]*?width:calc\(100% - var\(--campaign-map-drawer-space\)\)/u);
  assert.match(globals, /site-shell\{width:100%;[\s\S]*?transition:width \.24s ease,margin-left \.24s ease,margin-right \.24s ease/u);
  assert.ok(headerCss.includes(`html[data-campaign-map-drawer][data-campaign-map-pane="compact"] .app-header`));
  assert.ok(headerCss.includes(`html[data-campaign-map-drawer][data-campaign-map-pane="narrow"] .app-header`));
});
