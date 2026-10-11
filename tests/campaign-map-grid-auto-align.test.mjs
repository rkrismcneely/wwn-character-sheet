import assert from "node:assert/strict";
import test from "node:test";
import { detectSquareGrid } from "../lib/campaigns/map-grid-auto-align.ts";

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
