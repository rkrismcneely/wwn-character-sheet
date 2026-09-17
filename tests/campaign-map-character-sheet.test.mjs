import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign character sheets expose the shared map drawer from the side pullout tabs", async () => {
  const [page, sideTabs, events, launcher] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/characters/[characterId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-side-tabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterSideTabs campaigns=\{campaign\}/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.doesNotMatch(page, /CampaignCharacterMapControl/u);
  assert.match(sideTabs, /campaignMapOpenEvent/u);
  assert.match(sideTabs, /campaignMapStateEvent/u);
  assert.match(sideTabs, />\s*Map\s*</u);
  assert.match(sideTabs, />\s*Store\s*</u);
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
