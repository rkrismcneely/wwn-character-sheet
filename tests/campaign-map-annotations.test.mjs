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
  assert.match(controller, /campaign-map-creation-strip/u);
  assert.match(controller, /const selecting = !playerPreview && interactionEnabled && controller\.tool !== "erase"/u);
  assert.match(launcher, /campaign-map-object-inspector/u);
  assert.match(controller, /aria-label="Create annotation"/u);
  assert.match(controller, /type="color"/u);
  assert.match(controller, /aria-label="Annotation colour"/u);
  assert.match(controller, /Label text/u);
  assert.match(controller, /click or tap the map to place it/u);
  assert.match(controller, /color=\{annotation\.color\}/u);
  assert.match(controller, />Players</u);
  assert.match(controller, />GM only</u);
  assert.match(controller, /campaign-map-creation-name/u);
  assert.match(controller, /aria-label="Annotation colour"/u);
  assert.match(controller, /Text size/u);
  assert.match(controller, /type="range"/u);
  assert.match(controller, /commitTextSize/u);
  assert.match(controller, /textSizeEditingRef/u);
  assert.match(controller, /setAnnotations\(current => current\.map/u);
  assert.match(controller, /beginMove/u);
  assert.match(controller, /annotation\.canEdit/u);
  assert.match(controller, /Clear all/u);
  assert.match(controller, /controller\.stopDrawing/u);
  assert.match(launcher, />\+ Add</u);
  assert.match(launcher, />Fog</u);
  assert.match(launcher, />Measure</u);
  assert.match(launcher, /function toggleMeasuring\(\)/u);
  assert.match(launcher, /if \(measureEnabled\) \{\s*stopMeasuring\(\);\s*return;/u);
  assert.match(launcher, /setMeasureEnabled\(true\)/u);
  assert.match(launcher, /function stopMeasuring\(\)/u);
  assert.match(launcher, /svg\.releasePointerCapture\(capturedPointer\)/u);
  assert.match(launcher, /setMeasureStart\(null\);\s*setMeasureEnd\(null\);/u);
  assert.match(launcher, /aria-pressed=\{measureEnabled\}/u);
  assert.match(launcher, /onClick=\{event => \{ event\.stopPropagation\(\); toggleMeasuring\(\); \}\}/u);
  assert.match(launcher, />\s*Edit Map/u);
  assert.match(launcher, /campaign-map-edit-button/u);
  assert.doesNotMatch(launcher, /⋯ More|More map options|Fit to Map/u);
  assert.equal((launcher.match(/onClick=\{resetView\}[^>]*>Fit/g) ?? []).length, 1);
  assert.match(launcher, /CampaignMapDrawingPalette/u);
  assert.match(launcher, /CampaignMapAnnotationLayer/u);
  assert.match(launcher, /annotations\.handlePointerDown/u);
  assert.match(launcher, /\(!canManage \|\| playerPreview\) && <CampaignMapAnnotationLayer/u);
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


test("map mockup HUD keeps context controls on canvas while preserving edit permissions", async () => {
  const [launcher, templates, annotations, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /ref=\{stageRef\} className="campaign-map-stage"/u);
  assert.match(launcher, /ref=\{inspectorRef\}/u);
  assert.match(launcher, /getBoundingClientRect\(\)/u);
  assert.match(launcher, /campaign-map-context-bar/u);
  assert.match(launcher, /campaign-map-viewport-tools/u);
  assert.match(templates, /aria-label="Duplicate area"/u);
  assert.match(templates, /duplicateSelected = useCallback/u);
  assert.match(annotations, /duplicateSelected = useCallback/u);
  assert.match(templates, /selected\?\.canEdit/u);
  assert.match(annotations, /selected\?\.canEdit/u);
  assert.match(css, /\.campaign-map-toolbar \{[\s\S]*?position: absolute;/u);
  assert.match(css, /\.campaign-map-object-inspector\.campaign-map-context-bar/u);
  assert.doesNotMatch(launcher, /⋯ More|Live Dice: On|Live Dice: Off/u);
});


test("map editor keeps map selector and creation controls clear of the floating toolbar", async () => {
  const [launcher, annotations, areas, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /aria-label="Current campaign map"/u);
  assert.match(launcher, /maps\.map\(candidate => <option/u);
  assert.match(launcher, /Show to players<\/button>/u);
  assert.match(launcher, /action: "activate", mapId: map\.id/u);
  assert.match(launcher, /ResizeObserver\(update\)/u);
  assert.match(launcher, /--map-hud-height/u);
  assert.match(css, /top: calc\(var\(--map-hud-height/u);
  assert.match(annotations, /campaign-map-creation-strip/u);
  assert.match(areas, /campaign-map-creation-strip/u);
  assert.match(launcher, /campaign-map-edit-tabs/u);
  assert.match(launcher, /"maps" \| "grid" \| "tokens"/u);
  assert.match(css, /data-edit-section="tokens"/u);
});

test("keyboard map edits support copy cut paste delete and reversible persistence", async () => {
  const [launcher, annotations, areas] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /runMapKeyboardCommand/u);
  assert.match(launcher, /"copy" \| "cut" \| "paste" \| "undo" \| "redo" \| "delete"/u);
  assert.match(launcher, /event\.metaKey \|\| event\.ctrlKey/u);
  assert.match(launcher, /key === "z"/u);
  assert.match(launcher, /key === "y"/u);
  assert.match(launcher, /key === "delete" \|\| key === "backspace"/u);
  assert.match(launcher, /target\?\.closest\?\.\("input, textarea, select,/u);
  assert.match(launcher, /history\.undo\.pop\(\); history\.redo\.push\(entry\)/u);
  assert.match(launcher, /history\.redo\.pop\(\); history\.undo\.push\(entry\)/u);
  assert.match(launcher, /postKeyboardEdit/u);
  assert.match(launcher, /campaignMapChangedEvent/u);
  assert.match(annotations, /onEdited\?\.\(null, body\.annotation\)/u);
  assert.match(areas, /onEdited\?\.\(null, body\.template\)/u);
});


test("placing a note switches to edit mode with resizing immediately available", async () => {
  const annotations = await readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8");
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");
  assert.match(annotations, /if \(geometry\.kind === "text"\) \{[\s\S]*?setToolState\(null\);[\s\S]*?setSelectedId\(body\.annotation\.id\)/u);
  assert.match(annotations, /const selecting = !playerPreview && interactionEnabled && controller\.tool !== "erase"/u);
  assert.match(launcher, /aria-label="Label font size"/u);
  assert.match(launcher, /annotations\.commitTextSize\(\)/u);
  assert.match(launcher, /MapObjectActionIcon kind="duplicate"/u);
  assert.match(launcher, /MapObjectActionIcon kind="delete"/u);
  assert.match(launcher, /tokenFootprintSizeLabel\(tokenSizes\[token\.id\] \?\? 1\)/u);
  assert.match(launcher, /if \(size === 2\) return "Large"/u);
  assert.match(launcher, /if \(size === 3\) return "Huge"/u);
});

test("pen and shape tools can select and delete prior drawings without Done", async () => {
  const [annotations, launcher] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(annotations, /const selecting = !playerPreview && interactionEnabled && controller\.tool !== "erase"/u);
  assert.match(annotations, /const interactive = annotation\.canEdit && \(selecting \|\| erasing\)/u);
  assert.match(annotations, /else if \(selecting\) \{ onSelect\?\.\(annotation\.id\); controller\.beginMove\(event, annotation\.id\); \}/u);
  const moveStart = annotations.match(/const beginMove = useCallback\(\(event:[\s\S]*?\}, \[annotations, height, selectAnnotation, tool, width\]\)/u)?.[0];
  assert.ok(moveStart, "expected annotation pointer-select handler");
  assert.doesNotMatch(moveStart, /tool && tool !== "select"/u);
  assert.match(moveStart, /selectAnnotation\(id\)/u);
  assert.match(moveStart, /event\.stopPropagation\(\)/u);
  assert.match(annotations, /setSelectedId\(null\);\s*if \(tool === "text"\)/u);
  const layers = launcher.match(/<CampaignMapAnnotationLayer controller=\{annotations\}[^>]*interactionEnabled=\{[^}]+\}/gu) ?? [];
  assert.equal(layers.length, 2);
  for (const layer of layers) {
    assert.ok(layer.includes("!areaTemplates.open"));
    assert.ok(!layer.includes("!annotations.tool"));
  }
  assert.match(launcher, /annotations\.selected && <div className="campaign-map-context-actions"/u);
  assert.match(launcher, /annotations\.eraseAnnotation\(annotations\.selected\.id\)/u);
});
