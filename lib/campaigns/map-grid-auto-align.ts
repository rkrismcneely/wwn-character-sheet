/** Browser-side image analysis for square grids baked into map artwork. */
import { MAX_CAMPAIGN_MAP_GRID_SIZE } from "./map-grid.ts";

export const autoGridScaleOptions = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Scale only the detected cell spacing. Keep X/Y origin on the detected
 * underlying lattice, so the coarse grid lines match every Nth fine line. */
export function scaledDetectedGridSize(detectedSize: number, factor: number): number | null {
  if (!Number.isFinite(detectedSize) || detectedSize < 8
    || !autoGridScaleOptions.some(value => value === factor)) return null;
  const result = Math.round(detectedSize * factor);
  return result >= 8 && result <= MAX_CAMPAIGN_MAP_GRID_SIZE ? result : null;
}

export type SquareGridEstimate = {
  size: number;
  offsetX: number;
  offsetY: number;
  confidence: "high" | "medium";
};

type Peak = { period: number; phase: number; score: number };

function contrastProfile(data: Uint8ClampedArray, width: number, height: number, horizontal: boolean): Float64Array {
  const length = horizontal ? width : height;
  const crossLength = horizontal ? height : width;
  const values = new Float64Array(length);
  const start = Math.max(4, Math.floor(crossLength * .07));
  const end = Math.min(crossLength - 4, Math.ceil(crossLength * .93));
  const gray = (x: number, y: number) => {
    const k = (y * width + x) * 4;
    return data[k] * .213 + data[k + 1] * .715 + data[k + 2] * .072;
  };
  for (let i = 3; i < length - 3; i++) {
    let total = 0, count = 0;
    for (let j = start; j < end; j += 2) {
      const center = horizontal ? gray(i, j) : gray(j, i);
      const before = horizontal ? gray(i - 3, j) : gray(j, i - 3);
      const after = horizontal ? gray(i + 3, j) : gray(j, i + 3);
      total += (before + after) / 2 - center;
      count++;
    }
    values[i] = count ? total / count : 0;
  }
  return values;
}

function findPeriods(signal: Float64Array, min: number, max: number): Peak[] {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const sd = Math.sqrt(signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length);
  if (sd < .16) return [];
  const peaks: Peak[] = [];
  for (let period = min; period <= max; period++) {
    const total = new Float64Array(period);
    const count = new Uint16Array(period);
    for (let i = 3; i < signal.length - 3; i++) {
      const phase = i % period;
      total[phase] += signal[i] - mean;
      count[phase]++;
    }
    let highest = 0, phase = 0;
    for (let i = 0; i < period; i++) {
      if (count[i] < 5) continue;
      const score = Math.abs(total[i]) / (sd * Math.sqrt(count[i]));
      if (score > highest) { highest = score; phase = i; }
    }
    if (highest >= 4.5) peaks.push({ period, phase, score: highest });
  }
  return peaks.sort((a, b) => b.score - a.score).slice(0, 15);
}

export function detectSquareGrid(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
): SquareGridEstimate | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64
    || rgba.length !== width * height * 4 || originalWidth <= 0 || originalHeight <= 0) return null;
  const sx = width / originalWidth, sy = height / originalHeight;
  const minimum = Math.max(6, Math.ceil(8 * Math.min(sx, sy)));
  const maximum = Math.floor(Math.min(width / 5, height / 5, 512 * Math.min(sx, sy)));
  if (minimum > maximum) return null;
  const xs = findPeriods(contrastProfile(rgba, width, height, true), minimum, maximum);
  const ys = findPeriods(contrastProfile(rgba, width, height, false), minimum, maximum);
  let best: { x: Peak; y: Peak; score: number } | null = null;
  for (const x of xs) for (const y of ys) {
    const px = x.period / sx, py = y.period / sy;
    if (Math.abs(px - py) > Math.max(2 / Math.min(sx, sy), Math.max(px, py) * .035)) continue;
    const score = Math.min(x.score, y.score) + .2 * (x.score + y.score);
    if (!best || score > best.score) best = { x, y, score };
  }
  if (!best || Math.min(best.x.score, best.y.score) < 6) return null;
  const size = Math.round((best.x.period / sx + best.y.period / sy) / 2);
  if (size < 8 || size > 512) return null;
  return {
    size,
    offsetX: Math.round((best.x.phase / sx) % size),
    offsetY: Math.round((best.y.phase / sy) % size),
    confidence: Math.min(best.x.score, best.y.score) >= 10 ? "high" : "medium",
  };
}
