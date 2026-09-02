import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampTokenSizeCells,
  snapTokenCenter,
  tokenRadius,
} from "../lib/campaigns/map-grid.ts";

test("token sizes use bounded whole grid-cell increments", () => {
  assert.equal(clampTokenSizeCells(0), 1);
  assert.equal(clampTokenSizeCells(1.4), 1);
  assert.equal(clampTokenSizeCells(2.6), 3);
  assert.equal(clampTokenSizeCells(99), 12);
  assert.equal(tokenRadius(64, 2), 55.04);
});

test("token center snapping accounts for odd and even token footprints", () => {
  assert.equal(snapTokenCenter(90, 0, 64, 1, 512), 96);
  assert.equal(snapTokenCenter(130, 0, 64, 2, 512), 128);
  assert.equal(snapTokenCenter(500, 0, 64, 2, 512), 448);
  assert.equal(snapTokenCenter(130, 16, 64, 2, 512), 144);
});

test("campaign maps persist hidden-grid snapping and per-token sizes", async () => {
  const [migration, service, route, launcher, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0015_campaign_map_interactions.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-interactions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/interactions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_map_preferences`/u);
  assert.match(migration, /`snap_enabled` integer NOT NULL DEFAULT 0/u);
  assert.match(migration, /CREATE TABLE `campaign_map_token_sizes`/u);
  assert.match(migration, /`size_cells` integer NOT NULL DEFAULT 1/u);
  assert.match(service, /setCampaignMapSnapPreference/u);
  assert.match(service, /resizeCampaignMapToken/u);
  assert.match(service, /snapTokenCenter/u);
  assert.match(route, /body\.action === "set_snap"/u);
  assert.match(route, /body\.action === "resize"/u);
  assert.match(launcher, /Snap tokens to grid/u);
  assert.match(launcher, /Snapping works whether or not the grid lines are visible/u);
  assert.match(launcher, /if \(snapToGrid\)/u);
  assert.match(launcher, /gridTokenRadius\(map\.grid\.size, sizeCells\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells - 1\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells \+ 1\)/u);
  assert.match(workflow, /0015_campaign_map_interactions\.sql/u);
  assert.match(deploy, /5_campaign_map_interactions/u);
});
