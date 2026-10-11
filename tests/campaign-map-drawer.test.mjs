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


test("the compact drawer keeps its map selector left of the action buttons", async () => {
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  assert.match(launcher, /id="campaign-map-title" className="campaign-map-picker"/u);
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar \{\s*display: flex;\s*flex-wrap: wrap;/u);
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar-primary \{\s*order: 0;/u);
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar-actions \{\s*order: 1;/u);
  assert.match(css, /\.campaign-map-quick-tooltip\[data-tooltip\]:is\(:hover, :focus-visible, :focus-within\)::after/u);
});


test("the drawer map selector stays ahead of the tools without legacy layout overrides", async () => {
  const [launcher, css, polish] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
    readFile(new URL("../app/map-layout-polish.css", import.meta.url), "utf8"),
  ]);

  assert.ok(launcher.indexOf('className="campaign-map-toolbar-primary"') < launcher.indexOf('className="campaign-map-toolbar-actions"'));
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar \{\s*display: flex;\s*flex-wrap: wrap;/u);
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar-primary \{\s*order: 0;/u);
  assert.match(css, /\.campaign-map-host-drawer \.campaign-map-toolbar-actions \{\s*order: 1;/u);
  assert.doesNotMatch(polish, /\.campaign-map-host-drawer \.campaign-map-toolbar/u,
    "global layout polish must not flatten the drawer toolbar into display: contents");
});

test("a wide drawer uses one compact row instead of squeezing and stacking controls", async () => {
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");
  const desktopDrawer = css.slice(css.indexOf("/* Drawer toolbar: use the actual drawer width"), css.indexOf("/* Use our own mouseover labels:"));
  assert.match(desktopDrawer, /\.campaign-map-host-drawer \.campaign-map-title-block \{[\s\S]*?flex-direction: row;[\s\S]*?flex-wrap: nowrap;/u);
  assert.match(desktopDrawer, /\.campaign-map-host-drawer \.campaign-map-quick-actions \{[\s\S]*?flex-wrap: nowrap;/u);
  assert.match(desktopDrawer, /\.campaign-map-host-drawer \.campaign-map-toolbar-actions \{[\s\S]*?flex: 0 0 auto;/u);
  assert.match(desktopDrawer, /min-height: 2\.35rem;\s*padding: \.45rem \.75rem;\s*font-size: \.82rem;/u);
  assert.doesNotMatch(desktopDrawer, /grid-template-columns|max-width: 13rem|max-width: 12\.5rem/u);
  assert.match(launcher, /className="campaign-map-picker"[\s\S]*?className="campaign-map-sharing is-visible"/u);
});

test("map header button outlines have consistent thickness and shape", async () => {
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  assert.match(css, /Unified border geometry for map selector/u);
  assert.match(css, /\.campaign-map-toolbar \.campaign-map-quick-actions > button,/u);
  assert.match(css, /\.campaign-map-toolbar \.campaign-map-quick-actions > \.campaign-map-menu-wrap > button \{\s*border: 1px solid rgba\(209, 173, 121, \.55\);\s*border-radius: 7px;/u);
  assert.match(css, /border-color: #efc57c;/u);
});


test("Edit Map keeps distinct functional tabs, separates tasks, and tucks destructive actions away", async () => {
  const [launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /className="campaign-map-edit-tabs" aria-label="Map editor sections"/u);
  assert.match(launcher, /aria-pressed=\{editSection === section\} onClick=\{\(\) => setEditSection\(section\)\}/u);
  for (const section of ["maps", "grid", "tokens"]) {
    assert.ok(launcher.includes(`editSection === "${section}" && <div className="campaign-map-edit-panel"`));
  }
  assert.match(launcher, /<strong>\{editSection === "maps" \? "Manage maps"/u);
  assert.match(launcher, /<h4>Available maps<\/h4>/u);
  assert.match(launcher, /<h4>Selected map<\/h4>/u);
  assert.match(launcher, /<h4>Map artwork<\/h4>/u);
  assert.match(launcher, /<h4>Display options<\/h4>/u);
  assert.match(launcher, /<h4>Grid alignment<\/h4>/u);
  assert.match(launcher, /<h4>Place tokens<\/h4>/u);
  assert.match(launcher, /<h4>On this map<\/h4>/u);
  assert.match(launcher, /<summary>Advanced actions<\/summary>/u);
  const advanced = launcher.slice(launcher.indexOf('<details className="campaign-map-maintenance">'), launcher.indexOf("</details>", launcher.indexOf('<details className="campaign-map-maintenance">')));
  assert.match(advanced, /onClick=\{\(\) => void deleteMap\(\)\}/u);
  assert.match(advanced, /onClick=\{\(\) => void annotations\.clearAnnotations\(\)\}/u);
  assert.match(launcher, /onClick=\{\(\) => void renameMap\(\)\}/u);
  assert.match(launcher, /onClick=\{\(\) => void showToPlayers\(\)\}/u);
  assert.match(launcher, /onClick=\{\(\) => void saveGrid\(\)\}/u);
  assert.match(launcher, /onClick=\{\(\) => void tokenAction\(\{ action: "place_encounter" \}\)\}/u);
  assert.match(css, /\.campaign-map-edit-panel \{/u);
  assert.match(css, /\.campaign-map-edit-panel > \* \{ order: 0; \}/u);
  assert.match(css, /\.campaign-map-grid-fields \{/u);
  assert.match(css, /@media \(max-width: 600px\)/u);
});


test("Grid tab can analyze baked-in square lines without overwriting saved alignment", async () => {
  const [launcher, css, detector] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-grid-auto-align.ts", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /async function autoAlignGrid\(\)/u);
  assert.match(launcher, /onClick=\{\(\) => void autoAlignGrid\(\)\}/u);
  assert.match(launcher, /Auto Align Grid/u);
  assert.match(launcher, /grid\.type !== "square"/u);
  assert.match(launcher, /detectSquareGrid\(pixels, width, height, image\.naturalWidth, image\.naturalHeight\)/u);
  assert.match(launcher, /selectedMapIdRef\.current !== mapId/u);
  assert.match(launcher, /setGrid\(current => \(\{ \.\.\.current, type: "square", size: estimate\.size,/u);
  assert.match(launcher, /setAutoAlignPreview\(true\)/u);
  assert.match(launcher, /showAutoAlignOverlay && <rect/u);
  assert.match(launcher, /aria-label="Grid auto-alignment preview"/u);
  assert.match(launcher, /Discard preview/u);
  assert.match(launcher, /setGrid\(gridFor\(map\)\)/u);
  assert.match(launcher, /Save alignment/u);
  assert.match(launcher, /setAutoAlignPreview\(false\); setAutoAlignNotice\(""\)/u);
  assert.match(css, /\.campaign-map-auto-align \{/u);
  assert.match(detector, /periodic|findPeriods/u);
});


test("Auto Align offers a reviewable scale selector including nine-by-nine coarse squares", async () => {
  const [launcher, detector, api, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-grid-auto-align.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /aria-label="Scale detected grid"/u);
  assert.match(launcher, /autoGridScaleOptions\.map\(factor =>/u);
  assert.match(launcher, /setDetectedGridScale\(Number\(event\.target\.value\)\)/u);
  assert.match(launcher, /setGrid\(current => \(\{ \.\.\.current, size \}\)\)/u);
  assert.match(launcher, /setAutoAlignDetected\(estimate\)/u);
  assert.match(launcher, /setAutoAlignScale\(1\)/u);
  assert.match(launcher, /Use 9× to group a 9-by-9 block/u);
  assert.match(launcher, /disabled=\{scaledDetectedGridSize\(autoAlignDetected\.size, factor\) === null\}/u);
  assert.match(detector, /MAX_CAMPAIGN_MAP_GRID_SIZE/u);
  assert.match(api, /finiteNumber\(input\.gridSize, "Grid size", 8, MAX_CAMPAIGN_MAP_GRID_SIZE\)/u);
  assert.match(launcher, /max=\{MAX_CAMPAIGN_MAP_GRID_SIZE\}/u);
  assert.match(css, /\.campaign-map-auto-align-scale \{/u);
});
