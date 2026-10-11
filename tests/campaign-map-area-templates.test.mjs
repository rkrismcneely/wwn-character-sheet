import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignMapAreaTemplateAffectedCells,
  campaignMapAreaTemplateContainsPoint,
  campaignMapAreaTemplateMotionDefaultColors,
  campaignMapAreaTemplateDefaultColor,
  campaignMapAreaTemplateMotionEffects,
  parseCampaignMapAreaDistanceDraft,
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

test("Flip Tip swaps only the cardinal near-origin exception square", () => {
  const origin = { x: 300, y: 300 };
  const cases = [
    { angleDegrees: 0, defaultKey: "6:6", flippedKey: "6:5" },
    { angleDegrees: 90, defaultKey: "5:6", flippedKey: "6:6" },
    { angleDegrees: 180, defaultKey: "5:5", flippedKey: "5:6" },
    { angleDegrees: 270, defaultKey: "6:5", flippedKey: "5:5" },
  ];
  for (const { angleDegrees, defaultKey, flippedKey } of cases) {
    const base = { shape: "cone", ...origin, sizeSpaces: 4, angleDegrees };
    const normal = keys(campaignMapAreaTemplateAffectedCells({ ...base, tipFlip: false }, squareGrid, 1200, 1200));
    const flipped = keys(campaignMapAreaTemplateAffectedCells({ ...base, tipFlip: true }, squareGrid, 1200, 1200));
    assert.equal(normal.length, 9);
    assert.equal(flipped.length, 9);
    assert.ok(normal.includes(defaultKey));
    assert.ok(!normal.includes(flippedKey));
    assert.ok(flipped.includes(flippedKey));
    assert.ok(!flipped.includes(defaultKey));
  }

  const diagonal = { shape: "cone", ...origin, sizeSpaces: 4, angleDegrees: 45 };
  assert.deepEqual(
    keys(campaignMapAreaTemplateAffectedCells({ ...diagonal, tipFlip: false }, squareGrid, 1200, 1200)),
    keys(campaignMapAreaTemplateAffectedCells({ ...diagonal, tipFlip: true }, squareGrid, 1200, 1200)),
  );
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
  const [migration, widthMigration, tipFlipMigration, model, service, route, controller, launcher, css, migrationScript, workflow, deploy] = await Promise.all([
    readFile(new URL("../drizzle/0028_campaign_map_area_templates.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0029_campaign_map_area_template_width.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0030_campaign_map_area_template_tip_flip.sql", import.meta.url), "utf8"),
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
  assert.match(tipFlipMigration, /ADD COLUMN `tip_flip`/u);
  assert.match(tipFlipMigration, /tip_flip.*IN \(0, 1\)/isu);
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
  assert.match(model, /template\.tipFlip === true/u);
  assert.match(model, /squareCellBoundaryPath/u);
  assert.match(service, /access\.canManage \|\| creatorUserId === actor\.userId/u);
  assert.match(service, /You can only edit your own area templates/u);
  assert.match(service, /You can only remove your own area templates/u);
  assert.match(service, /100-area-template limit/u);
  assert.match(service, /tip_flip AS tipFlip/u);
  assert.match(service, /Cone tip flip is invalid/u);
  assert.match(service, /missingAreaTemplateTable/u);
  assert.match(route, /body\.action === "create"/u);
  assert.match(route, /body\.action === "update"/u);
  assert.match(route, /body\.action === "delete"/u);
  assert.match(route, /announceMapChanged/u);
  assert.match(controller, /<option value="radius">Radius<\/option>/u);
  assert.match(controller, /<option value="cone">Cone<\/option>/u);
  assert.match(controller, /aria-label="Create spell area"/u);
  assert.match(controller, /campaign-map-creation-field/u);
  assert.match(controller, /beginRotate/u);
  assert.match(controller, /Line width/u);
  assert.match(controller, /AreaTemplateConeTipControl/u);
  assert.match(controller, /Flip Tip/u);
  assert.match(controller, /tipFlip: template\.tipFlip/u);
  assert.match(controller, /campaignMapAreaTemplateAffectedPath/u);
  assert.match(controller, /campaignMapAreaTemplateDirectionPoint/u);
  assert.match(launcher, />\+ Add</u);
  assert.match(launcher, />Spell Area</u);
  assert.match(launcher, /CampaignMapAreaTemplatePalette/u);
  assert.match(launcher, /CampaignMapAreaTemplateLayer/u);
  assert.match(launcher, /areaTemplates\.handlePointerDown/u);
  assert.match(css, /\.campaign-map-area-affected/u);
  assert.match(css, /fill-opacity:\s*\.22/u);
  assert.match(css, /\.campaign-map-area-rotate-handle/u);
  assert.match(migrationScript, /0028_campaign_map_area_templates\.sql/u);
  assert.match(migrationScript, /0029_campaign_map_area_template_width\.sql/u);
  assert.match(migrationScript, /0030_campaign_map_area_template_tip_flip\.sql/u);
  assert.match(migrationScript, /"tip_flip"/u);
  assert.match(migrationScript, /campaign_map_area_templates_map_created_idx/u);
  assert.match(workflow, /0028_campaign_map_area_templates\.sql/u);
  assert.match(workflow, /0029_campaign_map_area_template_width\.sql/u);
  assert.match(workflow, /0030_campaign_map_area_template_tip_flip\.sql/u);
  assert.match(deploy, /0028_campaign_map_area_templates/u);
  assert.match(deploy, /0029_campaign_map_area_template_width/u);
  assert.match(deploy, /0030_campaign_map_area_template_tip_flip/u);
});


test("AoE editor displays measured distances without exposing grid multipliers", async () => {
  const controls = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  assert.match(controls, /perSpace: 5, name: "feet"/u);
  assert.match(controls, /perSpace: 10, name: "km"/u);
  assert.match(controls, /spaces=\{controller\.sizeSpaces\} grid=\{grid\}/u);
  assert.match(controls, /spaces=\{controller\.widthSpaces\} grid=\{grid\}/u);
  assert.match(controls, /onCommit=\{controller\.commitSizeSpaces\}/u);
  assert.match(controls, /onCommit=\{controller\.commitWidthSpaces\}/u);
  assert.doesNotMatch(controls, /× 5 ft|size in grid spaces/u);
  assert.match(controls, /MapObjectActionIcon kind="duplicate"/u);
  assert.match(controls, /MapObjectActionIcon kind="delete"/u);
});

test("optional motion styles are saved with spell templates without obscuring the map", async () => {
  const [model, service, ui, css, migration, runner, workflow, deploy, launcher] = await Promise.all([
    readFile(new URL("../lib/campaigns/map-area-template-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-area-templates.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0031_campaign_map_area_template_motion.sql", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate-campaign-map-foundation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(model, /"none", "fire", "acid", "sound", "poison", "ice", "lightning", "darkness"/u);
  assert.match(model, /motionEffect: CampaignMapAreaTemplateMotionEffect/u);
  assert.match(migration, /ADD COLUMN `motion_effect` text NOT NULL DEFAULT 'none'/u);
  assert.match(service, /motion_effect AS motionEffect/u);
  assert.match(service, /validatedMotionEffect\(input\.motionEffect \?\? "none"\)/u);
  assert.match(service, /validatedMotionEffect\(input\.motionEffect \?\? row\.motionEffect\)/u);
  assert.match(service, /motion_effect = \?/u);
  assert.match(service, /Spell area motion effect is invalid/u);
  assert.match(ui, /aria-label="Spell area motion effect"/u);
  assert.match(ui, /aria-label="Area motion effect"/u);
  assert.match(ui, /motionEffect: template\.motionEffect/u);
  assert.match(ui, /motionEffect: selected\.motionEffect/u);
  assert.match(ui, /template\.motionEffect !== "none"/u);
  assert.match(ui, /className="campaign-map-area-motion-edge"/u);
  assert.match(ui, /pointerEvents="none" aria-hidden="true"/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.campaign-map-magic-motifs \.campaign-map-motif-primary,/u);
  assert.match(css, /\.campaign-map-area-template\.is-motion-fire/u);
  assert.match(css, /\.campaign-map-area-template\.is-motion-darkness/u);
  assert.match(launcher, /color: area\.color, motionEffect: area\.motionEffect/u);
  assert.match(runner, /0031_campaign_map_area_template_motion\.sql/u);
  assert.match(workflow, /0031_campaign_map_area_template_motion\.sql/u);
  assert.match(deploy, /0031_campaign_map_area_template_motion/u);
});



test("each animated spell effect has a unique, valid starting colour", () => {
  const hexColor = /^#[0-9a-f]{6}$/u;
  assert.equal(campaignMapAreaTemplateMotionDefaultColors.none, campaignMapAreaTemplateDefaultColor);
  assert.equal(campaignMapAreaTemplateMotionEffects.length, 8);
  const colors = campaignMapAreaTemplateMotionEffects.map(effect => campaignMapAreaTemplateMotionDefaultColors[effect]);
  assert.ok(colors.every(color => hexColor.test(color)));
  assert.equal(new Set(colors).size, colors.length);
});

test("the creation and editing effect pickers apply preset colours without locking custom colours", async () => {
  const component = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  assert.match(component, /const defaultColor = value === "none" \? null : campaignMapAreaTemplateMotionDefaultColors\[value\]/u);
  assert.match(component, /if \(defaultColor\) setColorState\(defaultColor\)/u);
  assert.match(component, /color: defaultColor \?\? selected\.color/u);
  assert.match(component, /void saveTemplate\(updated, selected\)/u);
  assert.match(component, /const setColor = useCallback/u);
  assert.match(component, /const next = \{ \.\.\.selected, color: value \}/u);
  assert.match(component, /aria-label="Spell area motion effect"/u);
  assert.match(component, /aria-label="Area motion effect"/u);
});

test("animated spell areas visibly affect translucent squares and their perimeter with user colours", async () => {
  const component = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  assert.match(component, /style=\{template\.motionEffect !== "none" \? \{ "--map-area-fx": template\.color \} as CSSProperties : undefined\}/u);
  assert.match(component, /<path className="campaign-map-area-motion-cells" d=\{affected\}/u);
  assert.match(component, /<path className="campaign-map-area-motion-wash" d=\{outline\}/u);
  assert.match(component, /<path className="campaign-map-area-motion-edge" d=\{outline\}/u);
  assert.match(css, /\.campaign-map-area-motion-cells \{[\s\S]*?fill: var\(--map-area-fx,[\s\S]*?stroke: var\(--map-area-fx,/u);
  assert.match(css, /@keyframes map-area-fx-cells-breathe/u);
  assert.match(css, /@keyframes map-area-fx-cells-spark/u);
  assert.match(css, /\.campaign-map-area-motion-cells,[\s\S]*?\.campaign-map-area-motion-wash,[\s\S]*?\.campaign-map-area-motion-edge \{ animation: none !important; \}/u);
  assert.match(css, /\.campaign-map-area-motion-cells,[\s\S]*?\.campaign-map-area-motion-edge \{ pointer-events: none; \}/u);
});


test("every spell effect uses its own animated SVG motif, clipped to affected squares", async () => {
  const [ui, motifs, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-magic-pattern.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  for (const effect of ["fire", "acid", "sound", "poison", "ice", "lightning", "darkness"]) {
    assert.match(motifs, new RegExp(`effect === "${effect}"`, "u"));
    assert.match(css, new RegExp(`\\.campaign-map-magic-motifs\\.is-${effect} \\.campaign-map-motif-primary`, "u"));
  }
  assert.match(ui, /const patternPrefix = useId\(\)\.replace\(\/:\/gu, "-"\)/u);
  assert.match(ui, /const motionPatternId = `spell-motif-\$\{patternPrefix\}-\$\{template\.id\}`/u);
  assert.match(ui, /<CampaignMapMagicPattern id=\{motionPatternId\} effect=\{template\.motionEffect\} color=\{template\.color\}/u);
  assert.match(ui, /<path className="campaign-map-area-motion-texture" d=\{affected\} fill=\{`url\(#\$\{motionPatternId\}\)`\}/u);
  assert.match(motifs, /patternUnits="userSpaceOnUse" width="84" height="84"/u);
  assert.match(motifs, /stroke=\{color\}/u);
  assert.match(css, /\.campaign-map-area-motion-texture,[\s\S]*?\{ pointer-events: none; \}/u);
  assert.match(css, /\.campaign-map-magic-motifs \.campaign-map-motif-primary,[\s\S]*?\{ animation: none !important; opacity: \.55; \}/u);
  assert.match(css, /\.campaign-map-area-motion-texture \{ fill-opacity: \.42; \}/u);
  assert.match(css, /@keyframes map-area-flame-rise/u);
  assert.match(css, /@keyframes map-area-bubble-rise/u);
  assert.match(css, /@keyframes map-area-wave-expand/u);
  assert.match(css, /@keyframes map-area-vapor-drift/u);
  assert.match(css, /@keyframes map-area-frost-glint/u);
  assert.match(css, /@keyframes map-area-bolt-arcs/u);
  assert.match(css, /@keyframes map-area-shadow-swirl/u);
});


test("mobile spell distance fields preserve incomplete numeric typing and expose accessible steppers", async () => {
  const controls = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8");
  assert.match(controls, /function AreaTemplateDistanceInput\(/u);
  assert.match(controls, /useState\(String\(spaces \* unit\.perSpace\)\)/u);
  assert.match(controls, /input type="text" inputMode="numeric" pattern="\[0-9\]\*"/u);
  assert.match(controls, /onChange=\{event => \{ if \(\/\^\\d\*\$\/\.test\(event\.target\.value\)\) setDraft\(event\.target\.value\); \}\}/u);
  assert.match(controls, /onBlur=\{\(\) => \{ editingRef\.current = false; commitDraft\(\); \}\}/u);
  assert.match(controls, /onFocus=\{event => \{ editingRef\.current = true; event\.currentTarget\.select\(\); \}\}/u);
  assert.match(controls, /if \(event\.key === "Enter"\) event\.currentTarget\.blur\(\)/u);
  assert.match(controls, /apply\(parseCampaignMapAreaDistanceDraft\(draft, unit\.perSpace\)\)/u);
  assert.match(controls, /Decrease \$\{label\} by \$\{unit\.perSpace\}/u);
  assert.match(controls, /Increase \$\{label\} by \$\{unit\.perSpace\}/u);
  assert.match(controls, /const updated = \{ \.\.\.selected, sizeSpaces: next \}/u);
  assert.match(controls, /const updated = \{ \.\.\.selected, widthSpaces: next \}/u);
  assert.match(controls, /void saveTemplate\(updated, before\)\.then\(flushDeferredReload\)/u);
  assert.match(controls, /label="Spell area distance"/u);
  assert.match(controls, /label="Area distance"/u);
  assert.match(controls, /label="Line width"/u);
  assert.match(css, /\.campaign-map-distance-control/u);
});



test("blank, invalid and zero-sized spell distances return to one visible grid square", () => {
  assert.equal(parseCampaignMapAreaDistanceDraft("0", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("00", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("  ", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("2", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("not a number", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("-5", 5), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("20", 5), 4);
  assert.equal(parseCampaignMapAreaDistanceDraft("3000", 5), 60);
  assert.equal(parseCampaignMapAreaDistanceDraft("0", 10), 1);
  assert.equal(parseCampaignMapAreaDistanceDraft("20", 10), 2);
});

test("finishing spell area distance entry always validates before saving", async () => {
  const editor = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  assert.match(editor, /apply\(parseCampaignMapAreaDistanceDraft\(draft, unit\.perSpace\)\)/u);
  assert.match(editor, /onBlur=\{\(\) => \{ editingRef\.current = false; commitDraft\(\); \}\}/u);
  assert.match(editor, /clampCampaignMapAreaTemplateSize\(nextSpaces\)/u);
  assert.match(editor, /const updated = \{ \.\.\.selected, sizeSpaces: next \}/u);
});
