import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { viewportTooltipPosition } from "../app/tooltip-position.ts";

test("rule tooltips flip above controls near the bottom of the viewport", () => {
  const position = viewportTooltipPosition({
    trigger: { top: 700, bottom: 730, right: 760 },
    tooltip: { width: 440, height: 320 },
    viewportWidth: 800,
    viewportHeight: 800,
  });

  assert.equal(position.placement, "above");
  assert.equal(position.left, 348);
  assert.equal(position.top, 372);
  assert.ok(position.top >= 12);
  assert.ok(position.top + 320 <= 788);
});

test("rule tooltips remain below controls when there is room", () => {
  const position = viewportTooltipPosition({
    trigger: { top: 30, bottom: 60, right: 500 },
    tooltip: { width: 440, height: 300 },
    viewportWidth: 900,
    viewportHeight: 800,
  });

  assert.equal(position.placement, "below");
  assert.equal(position.top, 68);
  assert.equal(position.left, 60);
  assert.ok(position.top + 300 <= 788);
});

test("rule tooltips clamp horizontally to both viewport edges", () => {
  const leftEdge = viewportTooltipPosition({
    trigger: { top: 100, bottom: 130, right: 40 },
    tooltip: { width: 440, height: 200 },
    viewportWidth: 800,
    viewportHeight: 800,
  });
  assert.equal(leftEdge.left, 12);

  const rightEdge = viewportTooltipPosition({
    trigger: { top: 100, bottom: 130, right: 795 },
    tooltip: { width: 440, height: 200 },
    viewportWidth: 800,
    viewportHeight: 800,
  });
  assert.equal(rightEdge.left, 348);
  assert.equal(rightEdge.left + 440, 788);
});

test("oversized rule tooltips are height-limited to the larger visible side", () => {
  const position = viewportTooltipPosition({
    trigger: { top: 400, bottom: 430, right: 500 },
    tooltip: { width: 440, height: 900 },
    viewportWidth: 800,
    viewportHeight: 800,
  });

  assert.equal(position.placement, "above");
  assert.equal(position.maxHeight, 380);
  assert.equal(position.top, 12);
});

test("character-sheet rule tooltips use a body portal instead of inheriting muted spell opacity", async () => {
  const [sheet, css] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(sheet, /createPortal\(/u);
  assert.match(sheet, /className="tipbox tipbox-portal"/u);
  assert.match(sheet, /viewportTooltipPosition\(/u);
  assert.match(css, /\.spell-row\.unprepared\{opacity:\.48/u);
  assert.match(css, /\.tipbox\.tipbox-portal\{[\s\S]*position:fixed/u);
  assert.match(css, /\.tipbox\.tipbox-portal\{[\s\S]*opacity:1/u);
  assert.match(css, /max-height:min\(440px,calc\(100dvh - 24px\)\)/u);
});
