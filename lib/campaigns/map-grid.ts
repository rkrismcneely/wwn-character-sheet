export const MIN_TOKEN_SIZE_CELLS = 1;
export const MAX_TOKEN_SIZE_CELLS = 12;
export const GRID_CELL_FEET = 5;
export const HEX_CELL_KILOMETERS = 10;
/** Large embedded tiles may contain a 9 × 9 or larger fine-grid subdivision. */
export const MAX_CAMPAIGN_MAP_GRID_SIZE = 4096;

export type CampaignMapGridType = "square" | "hex";

export type CampaignMapGridPosition = {
  x: number;
  y: number;
};

export type CampaignMapGrid = {
  type: CampaignMapGridType;
  size: number;
  offsetX: number;
  offsetY: number;
};

const SQRT_3 = Math.sqrt(3);

export function clampTokenSizeCells(value: number): number {
  if (!Number.isFinite(value)) return MIN_TOKEN_SIZE_CELLS;
  return Math.min(MAX_TOKEN_SIZE_CELLS, Math.max(MIN_TOKEN_SIZE_CELLS, Math.round(value)));
}

export function tokenRadius(gridSize: number, sizeCells: number): number {
  const cells = clampTokenSizeCells(sizeCells);
  return Math.max(4, gridSize * cells / 2);
}

export function isCampaignMapGridType(value: unknown): value is CampaignMapGridType {
  return value === "square" || value === "hex";
}

/**
 * Hex cells use a point-at-the-top layout. The saved cell size is the
 * corner-to-corner height, which keeps its control meaningful beside the
 * existing square-cell size. Map offsets always identify the centre of cell
 * zero, rather than a corner, so the same values are used for rendering,
 * snapping, and movement measurement.
 */
export function hexGeometry(gridSize: number): {
  radius: number;
  width: number;
  columnStep: number;
  rowStep: number;
} {
  const radius = Math.max(0, gridSize) / 2;
  const width = SQRT_3 * radius;
  return {
    radius,
    width,
    columnStep: width,
    rowStep: radius * 1.5,
  };
}

function finiteGrid(grid: CampaignMapGrid): boolean {
  return Number.isFinite(grid.size) && grid.size > 0
    && Number.isFinite(grid.offsetX) && Number.isFinite(grid.offsetY);
}

export type CampaignMapGridCell = { q: number; r: number };

function axialRound(q: number, r: number): CampaignMapGridCell {
  let cubeX = q;
  let cubeZ = r;
  let cubeY = -cubeX - cubeZ;
  const roundedX = Math.round(cubeX);
  const roundedY = Math.round(cubeY);
  const roundedZ = Math.round(cubeZ);
  const deltaX = Math.abs(roundedX - cubeX);
  const deltaY = Math.abs(roundedY - cubeY);
  const deltaZ = Math.abs(roundedZ - cubeZ);
  if (deltaX > deltaY && deltaX > deltaZ) cubeX = -roundedY - roundedZ;
  else if (deltaY > deltaZ) cubeY = -roundedX - roundedZ;
  else cubeZ = -roundedX - roundedY;
  return { q: Math.round(cubeX), r: Math.round(cubeZ) };
}

function pixelToHex(position: CampaignMapGridPosition, grid: CampaignMapGrid): CampaignMapGridCell {
  const { radius } = hexGeometry(grid.size);
  const x = position.x - grid.offsetX;
  const y = position.y - grid.offsetY;
  if (!radius) return { q: 0, r: 0 };
  return axialRound((SQRT_3 / 3 * x - y / 3) / radius, (2 / 3 * y) / radius);
}

function hexToPixel(hex: CampaignMapGridCell, grid: CampaignMapGrid): CampaignMapGridPosition {
  const { radius } = hexGeometry(grid.size);
  return {
    x: grid.offsetX + radius * SQRT_3 * (hex.q + hex.r / 2),
    y: grid.offsetY + radius * 1.5 * hex.r,
  };
}

export function hexPath(cx: number, cy: number, gridSize: number): string {
  const { radius, width } = hexGeometry(gridSize);
  return `M ${cx} ${cy - radius} L ${cx + width / 2} ${cy - radius / 2} L ${cx + width / 2} ${cy + radius / 2} L ${cx} ${cy + radius} L ${cx - width / 2} ${cy + radius / 2} L ${cx - width / 2} ${cy - radius / 2} Z`;
}

/** Draws one repeating pointy-hex tile aligned to the persisted hex origin. */
export function hexPatternPaths(gridSize: number): string[] {
  const { width, rowStep } = hexGeometry(gridSize);
  return [
    hexPath(0, 0, gridSize),
    hexPath(width, 0, gridSize),
    hexPath(width / 2, rowStep, gridSize),
    hexPath(width * 1.5, rowStep, gridSize),
    hexPath(0, rowStep * 2, gridSize),
    hexPath(width, rowStep * 2, gridSize),
  ];
}

export function hexPatternSize(gridSize: number): { width: number; height: number } {
  const { width, rowStep } = hexGeometry(gridSize);
  return { width: width * 2, height: rowStep * 2 };
}

export function gridCellAtPosition(position: CampaignMapGridPosition, grid: CampaignMapGrid): CampaignMapGridCell {
  if (grid.type === "hex") return pixelToHex(position, grid);
  if (!finiteGrid(grid)) return { q: 0, r: 0 };
  const phaseX = grid.offsetX + grid.size / 2;
  const phaseY = grid.offsetY + grid.size / 2;
  return {
    q: Math.round((position.x - phaseX) / grid.size),
    r: Math.round((position.y - phaseY) / grid.size),
  };
}

export function gridCellCenter(cell: CampaignMapGridCell, grid: CampaignMapGrid): CampaignMapGridPosition {
  if (grid.type === "hex") return hexToPixel(cell, grid);
  return {
    x: grid.offsetX + grid.size / 2 + cell.q * grid.size,
    y: grid.offsetY + grid.size / 2 + cell.r * grid.size,
  };
}

export function gridCellPath(cell: CampaignMapGridCell, grid: CampaignMapGrid): string {
  const center = gridCellCenter(cell, grid);
  if (grid.type === "hex") return hexPath(center.x, center.y, grid.size);
  const left = center.x - grid.size / 2;
  const top = center.y - grid.size / 2;
  return `M ${left} ${top} H ${left + grid.size} V ${top + grid.size} H ${left} Z`;
}

function uniqueGridCells(cells: CampaignMapGridCell[]): CampaignMapGridCell[] {
  const seen = new Set<string>();
  return cells.filter(cell => {
    const key = `${cell.q}:${cell.r}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A rectangular selection is expressed in map pixels, then converted to
 * whole grid cells. On hex maps the rectangle selects complete hexes whose
 * centres lie within it, never partial or offset-row pseudo-cells.
 */
export function gridCellsInRectangle(
  start: CampaignMapGridPosition,
  end: CampaignMapGridPosition,
  grid: CampaignMapGrid,
  limit = 500,
): CampaignMapGridCell[] {
  if (!finiteGrid(grid) || ![start.x, start.y, end.x, end.y].every(Number.isFinite) || limit < 1) return [];
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  if (grid.type === "square") {
    const first = gridCellAtPosition(start, grid);
    const last = gridCellAtPosition(end, grid);
    const cells: CampaignMapGridCell[] = [];
    for (let r = Math.min(first.r, last.r); r <= Math.max(first.r, last.r); r += 1) {
      for (let q = Math.min(first.q, last.q); q <= Math.max(first.q, last.q); q += 1) {
        cells.push({ q, r });
        if (cells.length >= limit) return cells;
      }
    }
    return cells;
  }

  const corners = [
    gridCellAtPosition({ x: minX, y: minY }, grid),
    gridCellAtPosition({ x: maxX, y: minY }, grid),
    gridCellAtPosition({ x: minX, y: maxY }, grid),
    gridCellAtPosition({ x: maxX, y: maxY }, grid),
  ];
  const minQ = Math.min(...corners.map(cell => cell.q)) - 1;
  const maxQ = Math.max(...corners.map(cell => cell.q)) + 1;
  const minR = Math.min(...corners.map(cell => cell.r)) - 1;
  const maxR = Math.max(...corners.map(cell => cell.r)) + 1;
  const cells: CampaignMapGridCell[] = [];
  for (let r = minR; r <= maxR; r += 1) {
    for (let q = minQ; q <= maxQ; q += 1) {
      const center = gridCellCenter({ q, r }, grid);
      if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
        cells.push({ q, r });
        if (cells.length >= limit) return uniqueGridCells(cells);
      }
    }
  }
  const startCell = gridCellAtPosition(start, grid);
  return uniqueGridCells(cells.concat(startCell)).slice(0, limit);
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

export function hexMovementDistanceKilometers(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  grid: CampaignMapGrid,
): number {
  if (!finiteGrid(grid) || ![startX, startY, endX, endY].every(Number.isFinite)) return 0;
  const start = pixelToHex({ x: startX, y: startY }, grid);
  const end = pixelToHex({ x: endX, y: endY }, grid);
  const dq = Math.abs(end.q - start.q);
  const dr = Math.abs(end.r - start.r);
  const ds = Math.abs((-end.q - end.r) - (-start.q - start.r));
  return Math.max(dq, dr, ds) * HEX_CELL_KILOMETERS;
}

export function gridMovementDistanceLabel(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  grid: CampaignMapGrid,
): string {
  if (grid.type === "hex") {
    return `${hexMovementDistanceKilometers(startX, startY, endX, endY, grid)} km`;
  }
  return `${gridMovementDistanceFeet(startX, startY, endX, endY, grid.size)} ft`;
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

/**
 * Grid-aware, two-dimensional snapping. Square behaviour deliberately calls
 * the established single-axis implementation unchanged. Hex centres use cube
 * rounding, so dragging any direction lands on a real adjacent hex rather
 * than on an offset-row approximation.
 */
export function snapTokenCenterOnGrid(
  position: CampaignMapGridPosition,
  grid: CampaignMapGrid,
  sizeCells: number,
  maximumWidth: number,
  maximumHeight: number,
): CampaignMapGridPosition {
  if (grid.type !== "hex" || !finiteGrid(grid)) {
    return {
      x: snapTokenCenter(position.x, grid.offsetX, grid.size, sizeCells, maximumWidth),
      y: snapTokenCenter(position.y, grid.offsetY, grid.size, sizeCells, maximumHeight),
    };
  }

  const radius = tokenRadius(grid.size, sizeCells);
  if (!Number.isFinite(maximumWidth) || !Number.isFinite(maximumHeight) || maximumWidth <= 0 || maximumHeight <= 0) {
    return position;
  }
  if (radius * 2 >= maximumWidth || radius * 2 >= maximumHeight) {
    return { x: maximumWidth / 2, y: maximumHeight / 2 };
  }

  const snapped = hexToPixel(pixelToHex(position, grid), grid);
  return {
    x: Math.max(radius, Math.min(maximumWidth - radius, snapped.x)),
    y: Math.max(radius, Math.min(maximumHeight - radius, snapped.y)),
  };
}
