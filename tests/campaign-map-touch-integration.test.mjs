import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile map pinch uses capture-phase touch pointers before token, annotation and area handlers", async () => {
  const [launcher, css] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map.css", import.meta.url), "utf8"),
  ]);
  for (const name of ["Down", "Move", "Up", "Cancel"]) {
    const callback = name === "Down" ? "handleTouchPointerDownCapture"
      : name === "Move" ? "handleTouchPointerMoveCapture" : "handleTouchPointerEndCapture";
    assert.ok(launcher.includes(`onPointer${name}Capture={${callback}}`));
  }
  assert.match(launcher, /const touchPointersRef = useRef<Map<number, MapTouchPoint>>\(new Map\(\)\)/u);
  assert.match(launcher, /if \(event\.pointerType !== "touch"\) return;/u);
  assert.match(launcher, /if \(touches\.size < 2\) return;/u);
  assert.match(launcher, /touchPairMetrics\(first, second\)/u);
  assert.match(launcher, /pinchMapView\(\{/u);
  assert.match(launcher, /event\.currentTarget\.setAttribute\("viewBox"/u);
  assert.match(launcher, /setView\(current => sameView\(current, finalView\) \? current : finalView\)/u);
  assert.match(launcher, /if \(!touchPointersRef\.current\.size\) suppressTouchRef\.current = false;/u);
  assert.match(css, /\.campaign-map-svg \{[\s\S]*?touch-action: none;/u);
  assert.match(launcher, /pinch with two fingers to zoom/u);
});

test("starting a pinch discards uncommitted one-finger map edits and preserves tool modes", async () => {
  const [launcher, annotations, areas] = await Promise.all([
    readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-annotations.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /tokenDrag\.element\.setAttribute\("transform",/u);
  assert.match(launcher, /tokenDragRef\.current = null;/u);
  assert.match(launcher, /annotations\.cancelPointerInteraction\(\);/u);
  assert.match(launcher, /areaTemplates\.cancelPointerInteraction\(\);/u);
  assert.match(launcher, /const pan = dragRef\.current;[\s\S]*?dragRef\.current = null;/u);
  assert.match(launcher, /if \(fog\) clearFogPreview\(\);/u);
  assert.match(launcher, /if \(measure\) \{ setMeasureStart\(null\); setMeasureEnd\(null\); \}/u);
  assert.match(annotations, /const cancelPointerInteraction = \(\) => \{[\s\S]*?setDraft\(null\);/u);
  assert.match(annotations, /geometry: move\.geometry/u);
  assert.match(areas, /const cancelPointerInteraction = \(\) => \{[\s\S]*?pendingTouchPlaceRef\.current = null;/u);
  assert.match(areas, /angleDegrees: rotate\.initialAngle/u);
  assert.match(areas, /template\.id === move\.id \? \{ \.\.\.template, x: move\.x, y: move\.y \}/u);
});

test("tap-to-place spell areas defers touch creation until pointerup, allowing a pinch to cancel it", async () => {
  const areas = await readFile(new URL("../app/campaigns/campaign-map-area-templates.tsx", import.meta.url), "utf8");
  assert.match(areas, /if \(event\.pointerType === "touch"\) \{[\s\S]*?pendingTouchPlaceRef\.current = \{/u);
  assert.match(areas, /if \(event\.type === "pointerup"\) void createAt\(pendingPlace\.point\);/u);
  assert.match(areas, /Math\.hypot\(event\.clientX - pendingPlace\.clientX, event\.clientY - pendingPlace\.clientY\) > 10/u);
  assert.match(areas, /cancelPointerInteraction = \(\) => \{\s*pendingTouchPlaceRef\.current = null;/u);
});



test("mobile Safari browser pinch is disabled only on the map SVG, never the toolbar or page", async () => {
  const launcher = await readFile(new URL("../app/campaigns/campaign-map-launcher.tsx", import.meta.url), "utf8");
  assert.match(launcher, /const svg = svgRef\.current;\s*if \(!open \|\| !svg\) return;/u);
  assert.match(launcher, /const keepPinchInMap = \(event: TouchEvent\) => \{/u);
  assert.match(launcher, /event\.touches\.length >= 2 && event\.cancelable/u);
  assert.match(launcher, /svg\.addEventListener\("touchstart", keepPinchInMap, \{ passive: false \}\)/u);
  assert.match(launcher, /svg\.addEventListener\("touchmove", keepPinchInMap, \{ passive: false \}\)/u);
  assert.match(launcher, /svg\.addEventListener\("gesturestart", preventSafariPageGesture, \{ passive: false \}\)/u);
  assert.match(launcher, /svg\.addEventListener\("gesturechange", preventSafariPageGesture, \{ passive: false \}\)/u);
  assert.match(launcher, /svg\.removeEventListener\("gesturechange", preventSafariPageGesture\)/u);
  assert.doesNotMatch(launcher, /document\.addEventListener\("gesturestart"|window\.addEventListener\("gesturestart"/u);
  assert.match(launcher, /event\.currentTarget\.setAttribute\("viewBox"/u);
});
