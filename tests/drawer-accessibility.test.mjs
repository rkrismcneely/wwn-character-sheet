import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("non-modal Map and Store drawers move focus in and restore it without trapping Tab", async () => {
  const runtime = await source("app/map-ui-runtime.tsx");

  assert.match(runtime, /campaignMapOpenEvent/u);
  assert.match(runtime, /campaignMapStateEvent/u);
  assert.match(runtime, /campaignStoreOpenEvent/u);
  assert.match(runtime, /campaignStoreStateEvent/u);
  assert.match(runtime, /rememberReturnFocus/u);
  assert.match(runtime, /restoreDrawerFocus/u);
  assert.match(runtime, /focusDrawerControl\("\.campaign-map-drawer-collapse"\)/u);
  assert.match(runtime, /focusDrawerControl\("\.campaign-store-close"\)/u);
  assert.doesNotMatch(runtime, /event\.key\s*===\s*["']Tab["']/u);
});

test("Escape closes only the side-drawer Map presentation through the existing map event", async () => {
  const runtime = await source("app/map-ui-runtime.tsx");

  assert.match(runtime, /event\.key !== "Escape"/u);
  assert.match(runtime, /document\.querySelector\("\.campaign-map-host-drawer"\)/u);
  assert.match(runtime, /new CustomEvent<CampaignMapOpenDetail>\(campaignMapOpenEvent/u);
  assert.match(runtime, /action: "close"/u);
});

test("mobile and coarse-pointer drawer controls keep at least 44px touch targets", async () => {
  const [css, layout] = await Promise.all([
    source("app/drawer-accessibility.css"),
    source("app/layout.tsx"),
  ]);

  assert.match(layout, /import "\.\/drawer-accessibility\.css";/u);
  assert.match(css, /campaign-map-mobile-launcher-button[\s\S]*?min-height:\s*44px/u);
  assert.match(css, /campaign-store-header \.campaign-store-close[\s\S]*?width:\s*44px[\s\S]*?height:\s*44px/u);
  assert.match(css, /@media \(max-width: 820px\), \(pointer: coarse\)/u);
  assert.match(css, /campaign-character-side-tools \.campaign-character-side-tool[\s\S]*?min-height:\s*44px/u);
});
