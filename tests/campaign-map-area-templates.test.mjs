import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignMapAreaTemplateAffectedCells,
  campaignMapAreaTemplateContainsPoint,
  campaignMapAreaTemplateOutlinePath,
  campaignMapAreaTemplateSizeLabel,
  campaignMapGridSpacePixels,
  campaignMapSquareConeOverlapFraction,
  normalizeCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateOrigin,
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

test("square-grid cones use 50-percent coverage plus one cardinal tip square", () => {
  const east = { shape: "cone", x: 100, y: 100, sizeSpaces: 3, angleDegrees: 0 };
  const southeast = { ...east, angleDegrees: 45 };
  assert.deepEqual(
    keys(campaignMapAreaTemplateAffectedCells(east, squareGrid, 400, 400)),
    ["2:2", "3:1", "3:2", "4:1", "4:2"],
  );
  assert.deepEqual(
    keys(campaignMapAreaTemplateAffectedCells(southeast, squareGrid, 400, 400)),
    ["2:2", "2:3", "3:2", "3:3", "3:4", "4:3"],
  );
});

test("rotated cones also recalculate discrete coverage on hex grids", () => {
  const first = { shape: "cone", x: 150, y: 150, sizeSpaces: 3, angleDegrees: 0 };
  const rotated = { ...first, angleDegrees: 60 };
  assert.notDeepEqual(
    keys(campaignMapAreaTemplateAffectedCells(first, hexGrid, 500, 500)),
    keys(campaignMapAreaTemplateAffectedCells(rotated, hexGrid, 500, 500)),
  );
});

test("square-grid cone origins stay on grid intersections and exact 50-percent overlaps count", () => {
  const cone = { shape: "cone", x: 100, y: 100, sizeSpaces: 4, angleDegrees: 45 };
  const exactlyHalf = campaignMapSquareConeOverlapFraction(cone, { q: 2, r: 3 }, squareGrid);
  const belowHalf = campaignMapSquareConeOverlapFraction(cone, { q: 2, r: 4 }, squareGrid);
  assert.ok(Math.abs(exactlyHalf - 0.5) < 0.0001);
  assert.ok(belowHalf < 0.5);
  const covered = keys(campaignMapAreaTemplateAffectedCells(cone, squareGrid, 500, 500));
  assert.ok(covered.includes("2:3"));
  assert.ok(!covered.includes("2:4"));

  const line = { shape: "line", x: 100, y: 100, sizeSpaces: 4, widthSpaces: 1, angleDegrees: 0 };
  assert.ok(!keys(campaignMapAreaTemplateAffectedCells(line, squareGrid, 400, 400)).includes("2:2"));
});

test("cardinal cones add exactly one near-origin square below the 50-percent threshold", () => {
  const origin = { x: 300, y: 300 };
  const bonusCells = new Map([
    [0, "6:6"],
    [90, "5:6"],
    [180, "5:5"],
    [270, "6:5"],
  ]);
  for (const [angleDegrees, bonusKey] of bonusCells) {
    const template = { shape: "cone", ...origin, sizeSpaces: 4, angleDegrees };
    const cells = keys(campaignMapAreaTemplateAffectedCells(template, squareGrid, 1200, 1200));
    assert.equal(cells.length, 9);
    assert.ok(cells.includes(bonusKey));
    const [q, r] = bonusKey.split(":").map(Number);
    assert.ok(Math.abs(campaignMapSquareConeOverlapFraction(template, { q, r }, squareGrid) - 0.25) < 0.0001);
  }

  const diagonal = { shape: "cone", ...origin, sizeSpaces: 4, angleDegrees: 45 };
  assert.equal(campaignMapAreaTemplateAffectedCells(diagonal, squareGrid, 1200, 1200).length, 9);
});

test("non-cardinal cone coverage remains governed only by the 50-percent overlap rule", () => {
  const expectedCounts = new Map([
    [3, [5, 6]],
    [4, [9, 9]],
    [6, [19, 20]],
    [12, [73, 72]],
  ]);
  for (const [sizeSpaces, [cardinalCount, diagonalCount]] of expectedCounts) {
    const cardinal = { shape: "cone", x: 300, y: 300, sizeSpaces, angleDegrees: 0 };
    const diagonal = { ...cardinal, angleDegrees: 45 };
    assert.equal(campaignMapAreaTemplateAffectedCells(cardinal, squareGrid, 1200, 1200).length, cardinalCount);
    assert.equal(campaignMapAreaTemplateAffectedCells(diagonal, squareGrid, 1200, 1200).length, diagonalCount);
  }
});

test("grid-aware line length follows TWE diagonal movement distance", () => {
  const cardinal = { shape: "line", x: 125, y: 125, sizeSpaces: 4, widthSpaces: 1, angleDegrees: 0 };
  const diagonal = { ...cardinal, angleDegrees: 45 };
  const cardinalCells = campaignMapAreaTemplateAffectedCells(cardinal, squareGrid, 500, 500);
  const diagonalCells = campaignMapAreaTemplateAffectedCells(diagonal, squareGrid, 500, 500);

  assert.equal(cardinalCells.length, 4);
  assert.equal(diagonalCells.length, 3);
});

test("area templates snap origins and directions to the active grid", () => {
  assert.deepEqual(
    snapCampaignMapAreaTemplateOrigin({ x: 121, y: 137 }, squareGrid, "radius", 4, 300, 300),
    { x: 125, y: 125 },
  );
  assert.deepEqual(
    snapCampaignMapAreaTemplateOrigin({ x: 91, y: 113 }, squareGrid, "cube", 2, 300, 300),
    { x: 100, y: 100 },
  );
  assert.deepEqual(
    snapCampaignMapAreaTemplateOrigin({ x: 121, y: 137 }, squareGrid, "cone", 4, 300, 300),
    { x: 100, y: 150 },
  );
  assert.deepEqual(
    snapCampaignMapAreaTemplateOrigin({ x: 121, y: 137 }, squareGrid, "line", 4, 300, 300),
    { x: 100, y: 150 },
  );
  assert.deepEqual(
    snapCampaignMapAreaTemplateOrigin({ x: 162, y: 142 }, hexGrid, "cone", 3, 400, 400),
    { x: 150, y: 150 },
  );
  assert.equal(snapCampaignMapAreaTemplateAngle(22, squareGrid), 0);
  assert.equal(snapCampaignMapAreaTemplateAngle(23, squareGrid), 45);
  assert.equal(snapCampaignMapAreaTemplateAngle(31, hexGrid), 60);
  assert.equal(snapCampaignMapAreaTemplateAngle(359, hexGrid), 0);
});

test("square-grid cone outline traces the included squares instead of the perfect triangle", () => {
  const template = { shape: "cone", x: 100, y: 100, sizeSpaces: 4, angleDegrees: 0 };
  const outline = campaignMapAreaTemplateOutlinePath(template, squareGrid);
  assert.match(outline, /^M /u);
  assert.ok((outline.match(/ L /gu) ?? []).length > 4);
  assert.doesNotMatch(outline, / A /u);
  assert.equal(campaignMapAreaTemplateAffectedCells(template, squareGrid, 500, 500).length, 9);
});

test("line templates support explicit WWN-style widths instead of assuming one grid space", () => {
  const narrow = { shape: "line", x: 125, y: 125, sizeSpaces: 4, widthSpaces: 1, angleDegrees: 0 };
  const wide = { ...narrow, widthSpaces: 3 };
  const narrowCells = keys(campaignMapAreaTemplateAffectedCells(narrow, squareGrid, 400, 400));
  const wideCells = keys(campaignMapAreaTemplateAffectedCells(wide, squareGrid, 400, 400));
  assert.ok(wideCells.length > narrowCells.length);
  assert.ok(!narrowCells.includes("3:3"));
  assert.ok(wideCells.includes("3:3"));
  assert.notEqual(
    campaignMapAreaTemplateOutlinePath(narrow, squareGrid),
    campaignMapAreaTemplateOutlinePath(wide, squareGrid),
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
  const [migration, widthMigration, model, service, route, controller, launcher, css, migrationScript, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0028_campaign_map_area_templates.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0029_campaign_map_area_template_width.sql", import.meta.url), "utf8"),
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
  assert.match(widthMigration, /ADD COLUMN `width_spaces`/u);
  assert.match(widthMigration, /width_spaces.*between 1 and 60/isu);
  assert.match(model, /campaignMapAreaTemplateContainsPoint/u);
  assert.match(model, /gridCellCenter/u);
  assert.match(model, /local\.x \/ 2/u);
  assert.match(model, /campaignMapAreaTemplateAffectedCells/u);
  assert.match(model, /campaignMapAreaTemplateAffectedPath/u);
  assert.match(model, /snapCampaignMapAreaTemplateOrigin/u);
  assert.match(model, /snapCampaignMapAreaTemplateAngle/u);
  assert.match(model, /widthSpaces/u);
  assert.match(model, /campaignMapSquareConeOverlapFraction/u);
  assert.match(model, /clipPolygonAtAxis/u);
  assert.match(model, /polygonArea/u);
  assert.match(model, /squareConeCardinalBonusCell/u);
  assert.match(model, /squareCellBoundaryPath/u);
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
  assert.match(controller, /Line width/u);
  assert.match(controller, /one near-origin square is also included at 0°, 90°, 180°, and 270°/u);
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
  assert.match(migrationScript, /0029_campaign_map_area_template_width\.sql/u);
  assert.match(migrationScript, /campaign_map_area_templates_map_created_idx/u);
  assert.match(workflow, /0028_campaign_map_area_templates\.sql/u);
  assert.match(workflow, /0029_campaign_map_area_template_width\.sql/u);
  assert.match(deploy, /0028_campaign_map_area_templates/u);
  assert.match(deploy, /0029_campaign_map_area_template_width/u);
});
