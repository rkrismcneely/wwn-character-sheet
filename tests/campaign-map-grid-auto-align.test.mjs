import assert from "node:assert/strict";
import test from "node:test";
import { autoGridSubdivisionOptions, detectSquareGrid, subdividedDetectedGridSize } from "../lib/campaigns/map-grid-auto-align.ts";

function synthetic(width, height, options = {}) {
  const { step = 48, offsetX = 17, offsetY = 29, xLines = true, yLines = true } = options;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let seed = 12345;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    let value = 80 + (seed >>> 24) * .4 + 20 * Math.sin(x / 17) * Math.cos(y / 23);
    if ((xLines && ((x - offsetX + step * 1000) % step) < 2)
      || (yLines && ((y - offsetY + step * 1000) % step) < 2)) value *= .5;
    const k = (y * width + x) * 4;
    rgba[k] = value; rgba[k + 1] = value; rgba[k + 2] = value; rgba[k + 3] = 255;
  }
  return rgba;
}
const near = (a, b, tolerance = 2) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test("identifies square cell size and starting offsets on a textured map", () => {
  const width = 720, height = 624;
  const result = detectSquareGrid(synthetic(width, height), width, height, width, height);
  assert.ok(result, "grid should be detected");
  near(result.size, 48, 1);
  near(result.offsetX, 17);
  near(result.offsetY, 29);
});

test("converts downsampled square spacing back to original image coordinates", () => {
  const width = 720, height = 624;
  const result = detectSquareGrid(synthetic(width, height, { step: 40, offsetX: 9, offsetY: 13 }),
    width, height, width * 2, height * 2);
  assert.ok(result);
  near(result.size, 80);
  near(result.offsetX, 18, 4);
  near(result.offsetY, 26, 4);
});

test("does not guess for blank, ungridded, one-axis, or malformed images", () => {
  const width = 640, height = 576;
  assert.equal(detectSquareGrid(new Uint8ClampedArray(width * height * 4).fill(180),
    width, height, width, height), null);
  assert.equal(detectSquareGrid(synthetic(width, height, { xLines: false, yLines: false }),
    width, height, width, height), null);
  assert.equal(detectSquareGrid(synthetic(width, height, { xLines: false }),
    width, height, width, height), null);
  assert.equal(detectSquareGrid(new Uint8ClampedArray(12), width, height, width, height), null);
});



test("a detected 9-by-9 printed square subdivides into nine cells per axis", () => {
  assert.ok(autoGridSubdivisionOptions.includes(9));
  const cell = subdividedDetectedGridSize(420, 9);
  assert.ok(cell !== null);
  assert.ok(Math.abs(cell - 46.6666667) < 0.00001);
  // Nine cells must return to the very same original 420px grid line.
  assert.ok(Math.abs(cell * 9 - 420) < 0.0001);
  assert.equal(subdividedDetectedGridSize(420, 1), 420);
  assert.equal(subdividedDetectedGridSize(420, 2), 210);
  assert.equal(subdividedDetectedGridSize(420, 3), 140);
  assert.equal(subdividedDetectedGridSize(420, 10), 42);
});

test("subdivision keeps origin anchored to the original detected line", () => {
  const detectedOrigin = 138;
  const gridSize = subdividedDetectedGridSize(420, 9);
  assert.ok(gridSize !== null);
  const lineAtOriginalBoundary = detectedOrigin + 9 * gridSize;
  assert.ok(Math.abs(lineAtOriginalBoundary - 558) < .0001);
});

test("subdivision rejects unsupported factors and tiny grid cells", () => {
  assert.equal(subdividedDetectedGridSize(420, 0), null);
  assert.equal(subdividedDetectedGridSize(420, 11), null);
  assert.equal(subdividedDetectedGridSize(420, -1), null);
  assert.equal(subdividedDetectedGridSize(40, 9), null);
  assert.equal(subdividedDetectedGridSize(Number.NaN, 3), null);
});
