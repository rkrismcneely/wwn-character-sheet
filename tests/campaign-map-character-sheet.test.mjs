import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign character sheets expose the shared map modal from the map-docked side tabs", async () => {
  const [page, sideTools, sideToolsCss, events, launcher] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/characters/[characterId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-side-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-side-tools.css", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterSideTools campaigns=\{campaigns\}/u);
  assert.doesNotMatch(page, /CampaignCharacterMapControl/u);
  assert.doesNotMatch(page, /CampaignCharacterStoreControl/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(sideTools, /twe:campaign-map:drawer-dock/u);
  assert.match(sideTools, /rail\.classList\.toggle\("is-left", dock === "left"\)/u);
  assert.match(sideTools, /rail\.classList\.toggle\("is-right", dock === "right"\)/u);
  assert.match(sideTools, /if \(mapIsOpen \|\| storeIsOpen\) return null/u);
  assert.match(sideTools, />\s*Map\s*<\/button>/u);
  assert.match(sideTools, /campaignMapOpenEvent/u);
  assert.match(sideTools, /campaignMapStateEvent/u);
  assert.match(sideToolsCss, /\.campaign-character-side-tools\.is-left\{[^}]*left:0/su);
  assert.match(sideToolsCss, /\.campaign-character-side-tools\.is-right\{[^}]*right:0/su);
  assert.match(events, /twe:campaign-map-open/u);
  assert.match(launcher, /window\.addEventListener\(campaignMapOpenEvent/u);
});

test("live map changes refresh without replacing the visible map with the loading state", async () => {
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");

  assert.match(launcher, /showLoading = true/u);
  assert.match(launcher, /if \(showLoading\) setLoading\(true\)/u);
  assert.match(launcher, /if \(showLoading\) setLoading\(false\)/u);
  assert.match(launcher, /loadMap\(true, requestedMapId, false\)/u);
  assert.match(launcher, /Loading campaign map…/u);
});
