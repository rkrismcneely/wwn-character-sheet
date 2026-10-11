import assert from "node:assert/strict";
import test from "node:test";
import { pinchMapView, touchPairMetrics } from "../lib/campaigns/map-pinch-zoom.ts";

const startingView = { x: 0, y: 0, width: 1000, height: 1000 };
const viewport = { left: 0, top: 0, width: 500, height: 500 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} ≠ ${expected}`);

test("two-finger pinch zooms around the midpoint without shifting the map point beneath it", () => {
  const original = touchPairMetrics({ x: 100, y: 200 }, { x: 300, y: 200 });
  assert.deepEqual(original, { center: { x: 200, y: 200 }, distance: 200 });
  const spread = touchPairMetrics({ x: 50, y: 200 }, { x: 350, y: 200 });
  const result = pinchMapView({
    startView: startingView, startDistance: original.distance, distance: spread.distance,
    anchor: { x: 400, y: 400 }, center: spread.center, viewport, mapWidth: 1000, mapHeight: 1000,
  });
  near(result.width, 1000 * 2 / 3);
  near(result.x + (200 / 500) * result.width, 400);
  near(result.y + (200 / 500) * result.height, 400);
});

test("moving both fingers translates the map as well as zooming", () => {
  const view = pinchMapView({
    startView: startingView, startDistance: 200, distance: 400,
    anchor: { x: 400, y: 400 }, center: { x: 280, y: 220 }, viewport,
    mapWidth: 1000, mapHeight: 1000,
  });
  near(view.width, 500);
  near(view.x + (280 / 500) * view.width, 400);
  near(view.y + (220 / 500) * view.height, 400);
});

test("pinch accounts for SVG letterboxing on rectangular screens", () => {
  const result = pinchMapView({
    startView: startingView, startDistance: 100, distance: 200,
    anchor: { x: 125, y: 500 }, center: { x: 150, y: 200 },
    viewport: { left: 0, top: 0, width: 600, height: 400 },
    mapWidth: 1000, mapHeight: 1000,
  });
  near(result.width, 500);
  // The map is centered with 100 CSS pixels of horizontal padding.
  near(result.x + ((150 - 100) / 400) * result.width, 125);
  near(result.y + (200 / 400) * result.height, 500);
});

test("pinch retains existing 12x zoom-in and 1.5x zoom-out bounds", () => {
  const args = { startView: startingView, startDistance: 100, anchor: { x: 300, y: 300 },
    center: { x: 150, y: 150 }, viewport, mapWidth: 1000, mapHeight: 1000 };
  near(pinchMapView({ ...args, distance: 100000 }).width, 1000 / 12);
  near(pinchMapView({ ...args, distance: 9 }).width, 1500);
  assert.deepEqual(pinchMapView({ ...args, distance: 0 }), startingView);
});
