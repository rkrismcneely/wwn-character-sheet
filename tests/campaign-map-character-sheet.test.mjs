import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("campaign character sheets expose the shared map modal", async () => {
  const [page, control, events, launcher] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/characters/[characterId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-character-map-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CampaignCharacterMapControl campaignId=\{id\}/u);
  assert.match(control, /document\.querySelector\("\.topbar \.status"\)/u);
  assert.match(control, /aria-label="Open campaign map"/u);
  assert.match(control, />\s*Map\s*</u);
  assert.match(control, /campaignMapOpenEvent/u);
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
