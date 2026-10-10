import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignMapAnnotationPath,
  parseCampaignMapAnnotationColor,
  parseCampaignMapAnnotationGeometry,
  translateCampaignMapAnnotationGeometry,
} from "../lib/campaigns/map-annotation-model.ts";

test("map annotation geometry accepts bounded map-space vectors", () => {
  assert.deepEqual(
    parseCampaignMapAnnotationGeometry("line", { x1: 10, y1: 20, x2: 90, y2: 80 }, 100, 100),
    { kind: "line", x1: 10, y1: 20, x2: 90, y2: 80 },
  );
  assert.deepEqual(
    parseCampaignMapAnnotationGeometry("rect", { x: 10, y: 12, width: 40, height: 30 }, 100, 100),
    { kind: "rect", x: 10, y: 12, width: 40, height: 30 },
  );
  assert.deepEqual(
    parseCampaignMapAnnotationGeometry("circle", { cx: 50, cy: 50, r: 25 }, 100, 100),
    { kind: "circle", cx: 50, cy: 50, r: 25 },
  );
});

test("map text annotations and colours validate safely", () => {
  assert.deepEqual(
    parseCampaignMapAnnotationGeometry("text", { x: 22, y: 35, text: "Secret Door", fontSize: 28 }, 100, 100),
    { kind: "text", x: 22, y: 35, text: "Secret Door", fontSize: 28 },
  );
  assert.equal(parseCampaignMapAnnotationGeometry("text", { x: 22, y: 35, text: " ", fontSize: 28 }, 100, 100), null);
  assert.equal(parseCampaignMapAnnotationGeometry("text", { x: 22, y: 35, text: "Bad\nLabel", fontSize: 28 }, 100, 100), null);
  assert.equal(parseCampaignMapAnnotationColor("#A1b2C3", "players"), "#a1b2c3");
  assert.equal(parseCampaignMapAnnotationColor("not-a-colour", "players"), "#f4cf72");
  assert.equal(parseCampaignMapAnnotationColor(undefined, "gm"), "#7dd3fc");
});

test("map annotation geometry rejects oversized, degenerate, and excessive freehand input", () => {
  assert.equal(parseCampaignMapAnnotationGeometry("line", { x1: 10, y1: 10, x2: 10, y2: 10 }, 100, 100), null);
  assert.equal(parseCampaignMapAnnotationGeometry("rect", { x: 80, y: 80, width: 40, height: 40 }, 100, 100), null);
  assert.equal(parseCampaignMapAnnotationGeometry("circle", { cx: 10, cy: 10, r: 20 }, 100, 100), null);
  assert.equal(
    parseCampaignMapAnnotationGeometry("freehand", { points: Array.from({ length: 401 }, (_, index) => ({ x: index % 100, y: 10 })) }, 100, 100),
    null,
  );
});

test("annotation geometry translates within map bounds", () => {
  assert.deepEqual(
    translateCampaignMapAnnotationGeometry({ kind: "text", x: 10, y: 20, text: "Door", fontSize: 24 }, 5, -3, 100, 100),
    { kind: "text", x: 15, y: 17, text: "Door", fontSize: 24 },
  );
  assert.equal(
    translateCampaignMapAnnotationGeometry({ kind: "line", x1: 5, y1: 5, x2: 20, y2: 20 }, -10, 0, 100, 100),
    null,
  );
});

test("freehand and arrow geometry serialize to stable SVG paths", () => {
  assert.equal(
    campaignMapAnnotationPath({ kind: "freehand", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] }),
    "M 1 2 L 3 4 L 5 6",
  );
  assert.equal(
    campaignMapAnnotationPath({ kind: "arrow", x1: 4, y1: 5, x2: 20, y2: 30 }),
    "M 4 5 L 20 30",
  );
});

test("map annotations persist per map, filter GM-only rows from players, and use the map migration release path", async () => {
  const [migration, textMigration, ownershipMigration, service, route, controller, launcher, css, migrationScript, workflow, deployWorkflow] = await Promise.all([
    readFile(new URL("../drizzle/0025_campaign_map_annotations.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0026_campaign_map_annotation_text.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0027_campaign_map_annotation_ownership.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/map-annotations.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/map/annotations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate-campaign-map-foundation.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/migrate-campaign-map-foundation.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE .*campaign_map_annotations/u);
  assert.match(migration, /FOREIGN KEY .*map_id.* REFERENCES .*campaign_maps/u);
  assert.match(migration, /'freehand', 'line', 'arrow', 'rect', 'circle'/u);
  assert.match(migration, /'players', 'gm'/u);
  assert.match(textMigration, /'freehand', 'line', 'arrow', 'rect', 'circle', 'text'/u);
  assert.match(textMigration, /INSERT INTO .*campaign_map_annotations_next/u);
  assert.match(textMigration, /SELECT[\s\S]*geometry_json[\s\S]*FROM .*campaign_map_annotations/u);
  assert.match(textMigration, /ALTER TABLE .*campaign_map_annotations_next.* RENAME TO .*campaign_map_annotations/u);
  assert.match(ownershipMigration, /ADD COLUMN .*creator_user_id/u);
  assert.match(ownershipMigration, /campaign_map_annotations_creator_idx/u);
  assert.match(service, /visibilitySql = access\.canManage \? "" : " AND visibility = 'players'"/u);
  assert.match(service, /creatorUserId === actor\.userId/u);
  assert.match(service, /Players can only create player-visible annotations/u);
  assert.match(service, /You can only edit your own annotations/u);
  assert.match(service, /requireManagement\(access\)/u);
  assert.match(service, /500-drawing limit/u);
  assert.match(route, /body\.action === "create"/u);
  assert.match(route, /body\.action === "update"/u);
  assert.match(route, /body\.action === "delete"/u);
  assert.match(route, /body\.action === "clear"/u);
  assert.match(route, /announceMapChanged/u);
  assert.match(controller, /"freehand", "line", "arrow", "rect", "circle", "text", "erase"/u);
  assert.match(controller, /const selecting = interactionEnabled && \(!controller\.tool \|\| controller\.tool === "select"\)/u);
  assert.match(launcher, /campaign-map-object-inspector/u);
  assert.match(controller, /New annotations/u);
  assert.match(controller, /type="color"/u);
  assert.match(controller, /aria-label="Annotation colour"/u);
  assert.match(controller, /Label text/u);
  assert.match(controller, /click or tap the map to place it/u);
  assert.match(controller, /color=\{annotation\.color\}/u);
  assert.match(controller, />Players</u);
  assert.match(controller, />GM only</u);
  assert.match(controller, /Selected .*toolLabel/u);
  assert.match(controller, /Selected annotation colour/u);
  assert.match(controller, /Text size/u);
  assert.match(controller, /type="range"/u);
  assert.match(controller, /commitTextSize/u);
  assert.match(controller, /textSizeEditingRef/u);
  assert.match(controller, /setAnnotations\(current => current\.map/u);
  assert.match(controller, /beginMove/u);
  assert.match(controller, /annotation\.canEdit/u);
  assert.match(controller, /Clear all/u);
  assert.match(controller, /Tap or click one of your editable annotations to erase it/u);
  assert.match(launcher, />\+ Add</u);
  assert.match(launcher, />Fog</u);
  assert.match(launcher, />Measure</u);
  assert.match(launcher, />Edit Map/u);
  assert.match(launcher, /campaign-map-edit-button/u);
  assert.doesNotMatch(launcher, /⋯ More|More map options|Fit to Map/u);
  assert.equal((launcher.match(/onClick=\{resetView\}>Fit/g) ?? []).length, 1);
  assert.match(launcher, /CampaignMapDrawingPalette/u);
  assert.match(launcher, /CampaignMapAnnotationLayer/u);
  assert.match(launcher, /annotations\.handlePointerDown/u);
  assert.match(launcher, /!canManage && <CampaignMapAnnotationLayer/u);
  assert.match(launcher, /canManage && <CampaignMapAnnotationLayer/u);
  assert.match(css, /\.campaign-map-drawing-palette/u);
  assert.match(css, /\.campaign-map-annotation-group\.is-gm/u);
  assert.match(css, /\.campaign-map-drawing-color/u);
  assert.match(css, /\.campaign-map-annotation-text/u);
  assert.match(css, /\.campaign-map-annotation-selection-box/u);
  assert.match(css, /campaign-map-selection-march/u);
  assert.doesNotMatch(css, /is-selected[\s\S]{0,180}stroke-width:\s*6/u);
  assert.match(css, /min-height:\s*44px/u);
  assert.match(migrationScript, /0025_campaign_map_annotations\.sql/u);
  assert.match(migrationScript, /0026_campaign_map_annotation_text\.sql/u);
  assert.match(migrationScript, /0027_campaign_map_annotation_ownership\.sql/u);
  assert.match(migrationScript, /creator_user_id/u);
  assert.match(migrationScript, /does not permit text annotations/u);
  assert.match(migrationScript, /campaign_map_annotations_map_created_idx/u);
  assert.match(workflow, /0026_campaign_map_annotation_text\.sql/u);
  assert.match(workflow, /0027_campaign_map_annotation_ownership\.sql/u);
  assert.match(deployWorkflow, /0026_campaign_map_annotation_text/u);
  assert.match(deployWorkflow, /0027_campaign_map_annotation_ownership/u);
});

test("map drawing uses SVG map-space geometry with touch-sized erase targets", async () => {
  const [controller, launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);

  assert.match(controller, /getScreenCTM/u);
  assert.match(controller, /matrixTransform\(matrix\.inverse\(\)\)/u);
  assert.match(controller, /vectorEffect="non-scaling-stroke"/u);
  assert.match(controller, /AnnotationSelectionIndicator/u);
  assert.match(controller, /annotationSelectionBounds/u);
  assert.match(css, /\.campaign-map-annotation-hit[\s\S]*stroke-width:\s*22px/u);
  assert.match(launcher, /viewBox=/u);
  assert.match(css, /touch-action:\s*none/u);
});
