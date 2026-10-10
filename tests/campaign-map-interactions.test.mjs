import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  clampTokenSizeCells,
  gridCellsInRectangle,
  gridMovementDistanceLabel,
  gridMovementDistanceFeet,
  hexMovementDistanceKilometers,
  hexPatternPaths,
  hexPatternSize,
  snapTokenCenterOnGrid,
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

test("hex grids snap to real adjacent hexes and measure movement in ten-kilometre steps", () => {
  const hex = { type: "hex", size: 60, offsetX: 30, offsetY: 30 };
  const first = snapTokenCenterOnGrid({ x: 31, y: 31 }, hex, 1, 1200, 900);
  const east = snapTokenCenterOnGrid({ x: 83, y: 31 }, hex, 1, 1200, 900);
  const southeast = snapTokenCenterOnGrid({ x: 58, y: 75 }, hex, 1, 1200, 900);

  assert.deepEqual(first, { x: 30, y: 30 });
  assert.equal(hexMovementDistanceKilometers(first.x, first.y, east.x, east.y, hex), 10);
  assert.equal(hexMovementDistanceKilometers(first.x, first.y, southeast.x, southeast.y, hex), 10);
  assert.equal(gridMovementDistanceLabel(first.x, first.y, east.x, east.y, hex), "10 km");
  assert.equal(gridMovementDistanceLabel(0, 0, 64, 0, { type: "square", size: 64, offsetX: 0, offsetY: 0 }), "5 ft");
  assert.equal(hexPatternPaths(hex.size).length, 6);
  assert.deepEqual(hexPatternSize(hex.size), { width: Math.sqrt(3) * 60, height: 90 });
});

test("fog selections keep rectangular square groups and complete hexes", () => {
  const square = { type: "square", size: 50, offsetX: 0, offsetY: 0 };
  assert.deepEqual(
    gridCellsInRectangle({ x: 25, y: 25 }, { x: 125, y: 75 }, square),
    [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 }],
  );

  const hex = { type: "hex", size: 60, offsetX: 30, offsetY: 30 };
  const cells = gridCellsInRectangle({ x: 30, y: 30 }, { x: 84, y: 76 }, hex);
  assert.deepEqual(cells, [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }]);
});

test("campaign maps persist hidden-grid snapping and per-token sizes", async () => {
  const [migration, gridMigration, fogMigration, service, route, tokenRoute, launcher, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0015_campaign_map_interactions.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0022_action_bundle_10_grid_types.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0023_action_bundle_10_map_fog.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-interactions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/interactions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/tokens/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_map_preferences`/u);
  assert.match(gridMigration, /ADD COLUMN `grid_type` text NOT NULL DEFAULT 'square'/u);
  assert.match(fogMigration, /CREATE TABLE `campaign_map_fog_cells`/u);
  assert.match(migration, /`snap_enabled` integer NOT NULL DEFAULT 0/u);
  assert.match(migration, /SELECT `id`, `campaign_id`, `grid_enabled`, `updated_at` FROM `campaign_maps`/u);
  assert.match(migration, /CREATE TABLE `campaign_map_token_sizes`/u);
  assert.match(migration, /`size_cells` integer NOT NULL DEFAULT 1/u);
  assert.match(service, /setCampaignMapSnapPreference/u);
  assert.match(service, /resizeCampaignMapToken/u);
  assert.match(service, /snapCampaignMapTokenMove/u);
  assert.match(service, /snapTokenCenterOnGrid/u);
  assert.match(route, /body\.action === "set_snap"/u);
  assert.match(route, /body\.action === "resize"/u);
  assert.match(route, /body\.action === "set_fog"/u);
  assert.match(tokenRoute, /snapCampaignMapTokenMove/u);
  assert.match(launcher, /Snap tokens to grid/u);
  assert.match(launcher, /Hex · 10 km per hex/u);
  assert.match(launcher, /aria-label="Fog actions"/u);
  assert.match(launcher, /setFogMode\("hide"\)/u);
  assert.match(launcher, /setFogMode\("reveal"\)/u);
  assert.match(launcher, /gridCellsInRectangle/u);
  assert.match(launcher, /gridMovementDistanceLabel/u);
  assert.match(launcher, /Snapping works whether or not grid lines are visible/u);
  assert.match(launcher, /if \(snapToGrid\)/u);
  assert.match(launcher, /gridTokenRadius\(map\.grid\.size, sizeCells\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells - 1\)/u);
  assert.match(launcher, /resizeToken\(token, sizeCells \+ 1\)/u);
  assert.match(workflow, /0022_action_bundle_10_grid_types\.sql/u);
  assert.match(workflow, /0023_action_bundle_10_map_fog\.sql/u);
  assert.match(deploy, /0022_action_bundle_10_grid_types/u);
  assert.match(deploy, /0023_action_bundle_10_map_fog/u);
});

test("token dragging shows a live white distance label until release", async () => {
  const [launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(launcher, /gridMovementDistanceLabel/u);
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
