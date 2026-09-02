export const MIN_TOKEN_SIZE_CELLS = 1;
export const MAX_TOKEN_SIZE_CELLS = 12;

export function clampTokenSizeCells(value: number): number {
  if (!Number.isFinite(value)) return MIN_TOKEN_SIZE_CELLS;
  return Math.min(MAX_TOKEN_SIZE_CELLS, Math.max(MIN_TOKEN_SIZE_CELLS, Math.round(value)));
}

export function tokenRadius(gridSize: number, sizeCells: number): number {
  const cells = clampTokenSizeCells(sizeCells);
  return Math.max(4, gridSize * cells / 2);
}

export function snapTokenCenter(
  value: number,
  offset: number,
  gridSize: number,
  sizeCells: number,
  maximum: number,
): number {
  const cells = clampTokenSizeCells(sizeCells);
  const footprint = gridSize * cells;
  const half = footprint / 2;
  if (!Number.isFinite(value) || !Number.isFinite(offset) || !Number.isFinite(gridSize) || gridSize <= 0 || maximum <= 0) {
    return Math.max(0, Math.min(maximum, Number.isFinite(value) ? value : 0));
  }
  if (footprint >= maximum) return maximum / 2;

  const phase = offset + half;
  const minimumIndex = Math.ceil((half - phase) / gridSize);
  const maximumIndex = Math.floor((maximum - half - phase) / gridSize);
  if (minimumIndex > maximumIndex) return Math.max(half, Math.min(maximum - half, value));

  const nearestIndex = Math.round((value - phase) / gridSize);
  const index = Math.max(minimumIndex, Math.min(maximumIndex, nearestIndex));
  return phase + index * gridSize;
}
