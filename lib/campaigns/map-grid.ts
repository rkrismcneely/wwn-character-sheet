export const MIN_TOKEN_SIZE_CELLS = 1;
export const MAX_TOKEN_SIZE_CELLS = 12;
export const GRID_CELL_FEET = 5;

export function clampTokenSizeCells(value: number): number {
  if (!Number.isFinite(value)) return MIN_TOKEN_SIZE_CELLS;
  return Math.min(MAX_TOKEN_SIZE_CELLS, Math.max(MIN_TOKEN_SIZE_CELLS, Math.round(value)));
}

export function tokenRadius(gridSize: number, sizeCells: number): number {
  const cells = clampTokenSizeCells(sizeCells);
  return Math.max(4, gridSize * cells / 2);
}

export function gridMovementDistanceFeet(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  gridSize: number,
): number {
  if (![startX, startY, endX, endY, gridSize].every(Number.isFinite) || gridSize <= 0) return 0;

  const horizontalCells = Math.round(Math.abs(endX - startX) / gridSize);
  const verticalCells = Math.round(Math.abs(endY - startY) / gridSize);
  const diagonalCells = Math.min(horizontalCells, verticalCells);
  const straightCells = Math.max(horizontalCells, verticalCells) - diagonalCells;

  // WWN measures movement in feet rather than prescribing a square-grid rule.
  // TWE uses the traditional alternating 5/10-foot diagonal convention so
  // repeated diagonals approximate real distance without granting extra range.
  const diagonalFeet = GRID_CELL_FEET * (diagonalCells + Math.floor(diagonalCells / 2));
  return straightCells * GRID_CELL_FEET + diagonalFeet;
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
