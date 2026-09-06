import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Action Bundle 10 persists grid type and sparse fog through the existing campaign-map release path", async () => {
  const [gridMigration, fogMigration, service, route, migrationScript, workflow, deploy] = await Promise.all([
    read("drizzle/0022_action_bundle_10_grid_types.sql"),
    read("drizzle/0023_action_bundle_10_map_fog.sql"),
    read("lib/campaigns/map.ts"),
    read("app/api/campaigns/[id]/map/interactions/route.ts"),
    read("scripts/migrate-campaign-map-foundation.mjs"),
    read(".github/workflows/migrate-campaign-map-foundation.yml"),
    read(".github/workflows/deploy-production.yml"),
  ]);

  assert.match(gridMigration, /grid_type.*'square'.*'hex'/su);
  assert.match(fogMigration, /CREATE TABLE `campaign_map_fog_cells`/u);
  assert.match(fogMigration, /PRIMARY KEY \(`map_id`, `cell_q`, `cell_r`\)/u);
  assert.match(service, /setCampaignMapFogCells/u);
  assert.match(service, /campaignMapFogCells/u);
  assert.match(service, /fogCells: await campaignMapFogCells/u);
  assert.match(route, /body\.action === "set_fog"/u);
  assert.match(migrationScript, /0022_action_bundle_10_grid_types\.sql/u);
  assert.match(migrationScript, /0023_action_bundle_10_map_fog\.sql/u);
  assert.match(workflow, /0023_action_bundle_10_map_fog\.sql/u);
  assert.match(deploy, /0023_action_bundle_10_map_fog/u);
});

test("Action Bundle 10 uses one authenticated workspace controller across desktop hosts and a standalone pop-out", async () => {
  const [launcher, standalone, css] = await Promise.all([
    read("app/campaigns/campaign-map-launcher.tsx"),
    read("app/campaigns/[id]/map/page.tsx"),
    read("app/campaigns/campaign-map.css"),
  ]);

  assert.match(launcher, /type MapPresentation = "fullscreen" \| "split" \| "drawer" \| "floating" \| "pip" \| "standalone"/u);
  assert.match(launcher, /export function CampaignMapWorkspace/u);
  assert.match(launcher, /useCampaignLiveSession\(campaignId, open\)/u);
  assert.match(launcher, /new BroadcastChannel\(`twe:campaign-map:\$\{campaignId\}`\)/u);
  assert.match(launcher, /publishMapInvalidation/u);
  assert.match(launcher, /createPortal\(/u);
  assert.match(launcher, /documentPictureInPicture/u);
  assert.match(launcher, /openMapPopout/u);
  assert.match(launcher, /Split panel/u);
  assert.match(launcher, /Side drawer/u);
  assert.match(launcher, /Floating window/u);
  assert.match(launcher, /mapViewStorageKey/u);
  assert.match(standalone, /initialPresentation="standalone"/u);
  assert.match(standalone, /loadCampaignAccess/u);
  assert.match(css, /\.campaign-map-host-split/u);
  assert.match(css, /\.campaign-map-host-drawer/u);
  assert.match(css, /\.campaign-map-host-floating/u);
  assert.match(css, /\.campaign-map-pip-host/u);
});
