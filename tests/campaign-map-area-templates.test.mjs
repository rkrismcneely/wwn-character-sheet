import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignMapAreaTemplateAffectedCells,
  campaignMapAreaTemplateContainsPoint,
  campaignMapAreaTemplateOutlinePath,
  campaignMapAreaTemplateSizeLabel,
  campaignMapGridSpacePixels,
  normalizeCampaignMapAreaTemplateAngle,
} from "../lib/campaigns/map-area-template-model.ts";

const squareGrid = { type: "square", size: 50, offsetX: 0, offsetY: 0 };
const hexGrid = { type: "hex", size: 60, offsetX: 150, offsetY: 150 };

function keys(cells) {
  return cells.map(cell => `${cell.q}:${cell.r}`).sort();
}

test("spell radius coverage uses deterministic cell-center inclusion on square grids", () => {
  const template = { shape: "radius", x: 125, y: 125, sizeSpaces: 1, angleDegrees: 0 };
  assert.deepEqual(
    keys(campaignMapAreaTemplateAffectedCells(template, squareGrid, 300, 300)),
    ["1:2", "2:1", "2:2", "2:3", "3:2"],
  );
  assert.equal(campaignMapAreaTemplateContainsPoint(template, { x: 175, y: 125 }, squareGrid), true);
  assert.equal(campaignMapAreaTemplateContainsPoint(template, { x: 175, y: 175 }, squareGrid), false);
  assert.equal(campaignMapAreaTemplateSizeLabel(4, squareGrid), "20 ft · 4 squares");
});

test("one-space spell radius covers the origin hex and all six adjacent hexes", () => {
  const template = { shape: "radius", x: 150, y: 150, sizeSpaces: 1, angleDegrees: 0 };
  const cells = campaignMapAreaTemplateAffectedCells(template, hexGrid, 400, 400);
  assert.equal(cells.length, 7);
  assert.deepEqual(keys(cells), ["-1:0", "-1:1", "0:-1", "0:0", "0:1", "1:-1", "1:0"]);
  assert.ok(Math.abs(campaignMapGridSpacePixels(hexGrid) - Math.sqrt(3) * 30) < 0.0001);
});

test("cone coverage recalculates affected squares when the template rotates", () => {
  const east = { shape: "cone", x: 125, y: 125, sizeSpaces: 2, angleDegrees: 0 };
  const south = { ...east, angleDegrees: 90 };
  const eastCells = keys(campaignMapAreaTemplateAffectedCells(east, squareGrid, 350, 350));
  const southCells = keys(campaignMapAreaTemplateAffectedCells(south, squareGrid, 350, 350));
  assert.notDeepEqual(eastCells, southCells);
  assert.ok(eastCells.includes("4:2"));
  assert.ok(!eastCells.includes("2:4"));
  assert.ok(southCells.includes("2:4"));
  assert.ok(!southCells.includes("4:2"));
});

test("rotated cones also recalculate discrete coverage on hex grids", () => {
  const first = { shape: "cone", x: 150, y: 150, sizeSpaces: 3, angleDegrees: 0 };
  const rotated = { ...first, angleDegrees: 60 };
  assert.notDeepEqual(
    keys(campaignMapAreaTemplateAffectedCells(first, hexGrid, 500, 500)),
    keys(campaignMapAreaTemplateAffectedCells(rotated, hexGrid, 500, 500)),
  );
});

test("cube and line outlines rotate in continuous map space", () => {
  const cube0 = campaignMapAreaTemplateOutlinePath(
    { shape: "cube", x: 100, y: 100, sizeSpaces: 2, angleDegrees: 0 },
    squareGrid,
  );
  const cube45 = campaignMapAreaTemplateOutlinePath(
    { shape: "cube", x: 100, y: 100, sizeSpaces: 2, angleDegrees: 45 },
    squareGrid,
  );
  assert.notEqual(cube0, cube45);
  assert.match(campaignMapAreaTemplateOutlinePath(
    { shape: "line", x: 100, y: 100, sizeSpaces: 3, angleDegrees: 0 },
    squareGrid,
  ), /^M /u);
  assert.equal(normalizeCampaignMapAreaTemplateAngle(-15), 345);
  assert.equal(normalizeCampaignMapAreaTemplateAngle(375), 15);
});

test("spell area templates are durable, shared, owner-editable, and wired through the campaign map", async () => {
  const [migration, model, service, route, controller, launcher, css, migrationScript, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0028_campaign_map_area_templates.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-area-template-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-area-templates.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/templates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate-campaign-map-foundation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE .*campaign_map_area_templates/u);
  assert.match(migration, /creator_user_id/u);
  assert.match(migration, /'radius', 'cube', 'cone', 'line'/u);
  assert.match(migration, /size_spaces.*between 1 and 60/isu);
  assert.match(model, /campaignMapAreaTemplateContainsPoint/u);
  assert.match(model, /gridCellCenter/u);
  assert.match(model, /local\.x \/ 2/u);
  assert.match(model, /campaignMapAreaTemplateAffectedCells/u);
  assert.match(model, /campaignMapAreaTemplateAffectedPath/u);
  assert.match(service, /access\.canManage \|\| creatorUserId === actor\.userId/u);
  assert.match(service, /You can only edit your own area templates/u);
  assert.match(service, /You can only remove your own area templates/u);
  assert.match(service, /100-area-template limit/u);
  assert.match(service, /missingAreaTemplateTable/u);
  assert.match(route, /body\.action === "create"/u);
  assert.match(route, /body\.action === "update"/u);
  assert.match(route, /body\.action === "delete"/u);
  assert.match(route, /announceMapChanged/u);
  assert.match(controller, /"radius", "cube", "cone", "line"/u);
  assert.match(controller, />Place</u);
  assert.match(controller, />Select</u);
  assert.match(controller, /beginRotate/u);
  assert.match(controller, /Rotation recalculates coverage immediately/u);
  assert.match(controller, /centre lies inside the true area/u);
  assert.match(controller, /campaignMapAreaTemplateAffectedPath/u);
  assert.match(controller, /campaignMapAreaTemplateDirectionPoint/u);
  assert.match(launcher, />Area</u);
  assert.match(launcher, />Spell Area</u);
  assert.match(launcher, /CampaignMapAreaTemplatePalette/u);
  assert.match(launcher, /CampaignMapAreaTemplateLayer/u);
  assert.match(launcher, /areaTemplates\.handlePointerDown/u);
  assert.match(css, /\.campaign-map-area-affected/u);
  assert.match(css, /fill-opacity:\s*\.22/u);
  assert.match(css, /\.campaign-map-area-rotate-handle/u);
  assert.match(migrationScript, /0028_campaign_map_area_templates\.sql/u);
  assert.match(migrationScript, /campaign_map_area_templates_map_created_idx/u);
  assert.match(workflow, /0028_campaign_map_area_templates\.sql/u);
  assert.match(deploy, /0028_campaign_map_area_templates/u);
});
