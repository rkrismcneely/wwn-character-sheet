import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampTokenSizeCells,
  gridMovementDistanceFeet,
  snapTokenCenter,
  tokenRadius,
} from "../lib/campaigns/map-grid.ts";

test("token sizes use bounded whole grid-cell increments", () => {
  assert.equal(clampTokenSizeCells(0), 1);
  assert.equal(clampTokenSizeCells(1.4), 1);
  assert.equal(clampTokenSizeCells(2.6), 3);
  assert.equal(clampTokenSizeCells(99), 12);
  assert.equal(tokenRadius(64, 2), 64);
});

test("token center snapping accounts for odd and even token footprints", () => {
  assert.equal(snapTokenCenter(90, 0, 64, 1, 512), 96);
  assert.equal(snapTokenCenter(130, 0, 64, 2, 512), 128);
  assert.equal(snapTokenCenter(500, 0, 64, 2, 512), 448);
  assert.equal(snapTokenCenter(130, 16, 64, 2, 512), 144);
});

test("grid movement uses alternating five and ten foot diagonals", () => {
  const cell = 64;
  assert.equal(gridMovementDistanceFeet(0, 0, cell, 0, cell), 5);
  assert.equal(gridMovementDistanceFeet(0, 0, cell, cell, cell), 5);
  assert.equal(gridMovementDistanceFeet(0, 0, cell * 2, cell * 2, cell), 15);
  assert.equal(gridMovementDistanceFeet(0, 0, cell * 3, cell * 3, cell), 20);
  assert.equal(gridMovementDistanceFeet(0, 0, cell * 4, cell * 4, cell), 30);
  assert.equal(gridMovementDistanceFeet(0, 0, cell * 3, cell, cell), 15);
  assert.equal(gridMovementDistanceFeet(0, 0, cell * 6, 0, cell), 30);
});

test("campaign maps persist hidden-grid snapping and per-token sizes", async () => {
  const [migration, service, route, tokenRoute, launcher, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0015_campaign_map_interactions.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-interactions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/interactions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_map_preferences`/u);
  assert.match(migration, /`snap_enabled` integer NOT NULL DEFAULT 0/u);
  assert.match(migration, /SELECT `id`, `campaign_id`, `grid_enabled`, `updated_at` FROM `campaign_maps`/u);
  assert.match(migration, /CREATE TABLE `campaign_map_token_sizes`/u);
  assert.match(migration, /`size_cells` integer NOT NULL DEFAULT 1/u);
  assert.match(service, /setCampaignMapSnapPreference/u);
  assert.match(service, /resizeCampaignMapToken/u);
  assert.match(service, /snapCampaignMapTokenMove/u);
  assert.match(service, /snapTokenCenter/u);
  assert.match(route, /body\.action === "set_snap"/u);
  assert.match(route, /body\.action === "resize"/u);
  assert.match(tokenRoute, /snapCampaignMapTokenMove/u);
  assert.match(launcher, /Snap tokens to grid/u);
  assert.match(launcher, /Snapping works whether or not the grid lines are visible/u);
  assert.match(launcher, /if \(snapToGrid\)/u);
  assert.match(launcher, /gridTokenRadius\(map\.grid\.size, sizeCells\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells - 1\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells \+ 1\)/u);
  assert.match(workflow, /0015_campaign_map_interactions\.sql/u);
  assert.match(deploy, /5_campaign_map_interactions/u);
});

test("token dragging shows a live white distance label until release", async () => {
  const [launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(launcher, /gridMovementDistanceFeet/u);
  assert.match(launcher, /setTokenDragMeasurement/u);
  assert.match(launcher, /campaign-map-token-distance/u);
  assert.match(launcher, /tokenDragMeasurement\?\.tokenId === token\.id/u);
  assert.match(launcher, /setTokenDragMeasurement\(null\)/u);
  assert.match(css, /\.campaign-map-token-distance/u);
  assert.match(css, /fill:\s*#fff/u);
});

test("token dragging leaves a fifty-percent origin ghost until release", async () => {
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");

  assert.match(launcher, /type TokenDragOrigin = \{ tokenId: string; x: number; y: number \}/u);
  assert.match(launcher, /setTokenDragOrigin\(\{ tokenId: token\.id, x: token\.x, y: token\.y \}\)/u);
  assert.match(launcher, /campaign-map-token-drag-origin/u);
  assert.match(launcher, /translate\(\$\{tokenDragOrigin\.x\} \$\{tokenDragOrigin\.y\}\)/u);
  assert.match(launcher, /opacity=\{0\.5\}/u);
  assert.match(launcher, /pointerEvents="none"/u);
  assert.match(launcher, /setTokenDragOrigin\(null\)/u);
});
