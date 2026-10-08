import {
  gridCellAtPosition,
  gridCellCenter,
  gridCellPath,
  gridCellsInRectangle,
  hexGeometry,
  type CampaignMapGrid,
  type CampaignMapGridCell,
  type CampaignMapGridPosition,
} from "./map-grid.ts";

export type CampaignMapAreaTemplateShape = "radius" | "cube" | "cone" | "line";

export type CampaignMapAreaTemplate = {
  id: string;
  shape: CampaignMapAreaTemplateShape;
  x: number;
  y: number;
  sizeSpaces: number;
  widthSpaces: number;
  angleDegrees: number;
  color: string;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export const campaignMapAreaTemplateShapes: CampaignMapAreaTemplateShape[] = [
  "radius", "cube", "cone", "line",
];

export const campaignMapAreaTemplateDefaultColor = "#c084fc";
export const campaignMapAreaTemplateMinSize = 1;
export const campaignMapAreaTemplateMaxSize = 60;
const MAX_CANDIDATE_CELLS = 20000;
const EPSILON = 0.0001;

export function isCampaignMapAreaTemplateShape(value: unknown): value is CampaignMapAreaTemplateShape {
  return typeof value === "string" && campaignMapAreaTemplateShapes.includes(value as CampaignMapAreaTemplateShape);
}

export function clampCampaignMapAreaTemplateSize(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return campaignMapAreaTemplateMinSize;
  return Math.min(campaignMapAreaTemplateMaxSize, Math.max(campaignMapAreaTemplateMinSize, Math.round(number)));
}

export function normalizeCampaignMapAreaTemplateAngle(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((((number % 360) + 360) % 360) * 100) / 100;
}

export function campaignMapAreaTemplateAngleStep(grid: CampaignMapGrid): number {
  return grid.type === "hex" ? 60 : 45;
}

export function snapCampaignMapAreaTemplateAngle(value: unknown, grid: CampaignMapGrid): number {
  const step = campaignMapAreaTemplateAngleStep(grid);
  const normalized = normalizeCampaignMapAreaTemplateAngle(value);
  return normalizeCampaignMapAreaTemplateAngle(Math.round(normalized / step) * step);
}

function roundedGridCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function snapSquareAxis(value: number, phase: number, step: number, maximum?: number): number {
  let index = Math.round((value - phase) / step);
  if (Number.isFinite(maximum) && (maximum as number) >= 0) {
    const minimumIndex = Math.ceil((0 - phase) / step);
    const maximumIndex = Math.floor(((maximum as number) - phase) / step);
    if (minimumIndex <= maximumIndex) index = Math.max(minimumIndex, Math.min(maximumIndex, index));
  }
  return roundedGridCoordinate(phase + index * step);
}

export function snapCampaignMapAreaTemplateOrigin(
  position: CampaignMapGridPosition,
  grid: CampaignMapGrid,
  shape: CampaignMapAreaTemplateShape,
  sizeSpaces: number,
  maximumWidth?: number,
  maximumHeight?: number,
): CampaignMapGridPosition {
  if (!Number.isFinite(grid.size) || grid.size <= 0
      || !Number.isFinite(grid.offsetX) || !Number.isFinite(grid.offsetY)
      || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return position;

  if (grid.type === "square") {
    const cubeOnIntersection = shape === "cube" && clampCampaignMapAreaTemplateSize(sizeSpaces) % 2 === 0;
    const phaseX = grid.offsetX + (cubeOnIntersection ? 0 : grid.size / 2);
    const phaseY = grid.offsetY + (cubeOnIntersection ? 0 : grid.size / 2);
    return {
      x: snapSquareAxis(position.x, phaseX, grid.size, maximumWidth),
      y: snapSquareAxis(position.y, phaseY, grid.size, maximumHeight),
    };
  }

  const snappedCell = gridCellAtPosition(position, grid);
  if (!Number.isFinite(maximumWidth) || !Number.isFinite(maximumHeight)) {
    const center = gridCellCenter(snappedCell, grid);
    return { x: roundedGridCoordinate(center.x), y: roundedGridCoordinate(center.y) };
  }

  let best: CampaignMapGridPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let dq = -2; dq <= 2; dq += 1) {
    for (let dr = -2; dr <= 2; dr += 1) {
      const center = gridCellCenter({ q: snappedCell.q + dq, r: snappedCell.r + dr }, grid);
      if (center.x < 0 || center.x > (maximumWidth as number) || center.y < 0 || center.y > (maximumHeight as number)) continue;
      const distance = Math.hypot(center.x - position.x, center.y - position.y);
      if (distance < bestDistance) {
        best = center;
        bestDistance = distance;
      }
    }
  }
  if (!best) return {
    x: roundedGridCoordinate(Math.max(0, Math.min(maximumWidth as number, position.x))),
    y: roundedGridCoordinate(Math.max(0, Math.min(maximumHeight as number, position.y))),
  };
  return { x: roundedGridCoordinate(best.x), y: roundedGridCoordinate(best.y) };
}

export function parseCampaignMapAreaTemplateColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/u.test(value)
    ? value.toLowerCase()
    : campaignMapAreaTemplateDefaultColor;
}

export function campaignMapGridSpacePixels(grid: CampaignMapGrid): number {
  if (!Number.isFinite(grid.size) || grid.size <= 0) return 0;
  return grid.type === "hex" ? hexGeometry(grid.size).width : grid.size;
}

function rotateLocal(dx: number, dy: number, angleDegrees: number): CampaignMapGridPosition {
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: dx * cosine + dy * sine,
    y: -dx * sine + dy * cosine,
  };
}

function rotateWorld(x: number, y: number, angleDegrees: number): CampaignMapGridPosition {
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  };
}

function worldPoint(
  origin: CampaignMapGridPosition,
  local: CampaignMapGridPosition,
  angleDegrees: number,
): CampaignMapGridPosition {
  const rotated = rotateWorld(local.x, local.y, angleDegrees);
  return { x: origin.x + rotated.x, y: origin.y + rotated.y };
}

export function campaignMapAreaTemplateContainsPoint(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  point: CampaignMapGridPosition,
  grid: CampaignMapGrid,
): boolean {
  const unit = campaignMapGridSpacePixels(grid);
  if (!unit) return false;
  const size = clampCampaignMapAreaTemplateSize(template.sizeSpaces);
  const local = rotateLocal(point.x - template.x, point.y - template.y, normalizeCampaignMapAreaTemplateAngle(template.angleDegrees));
  if (template.shape === "radius") {
    const radius = size * unit;
    return Math.hypot(local.x, local.y) <= radius + EPSILON;
  }
  if (template.shape === "cube") {
    const half = size * unit / 2;
    return Math.abs(local.x) <= half + EPSILON && Math.abs(local.y) <= half + EPSILON;
  }
  if (template.shape === "cone") {
    // WWN's explicit cone example is as wide at the far end as it is long.
    // TWE uses that proportion generically: full width at distance d is d.
    const length = size * unit;
    return local.x >= -EPSILON
      && local.x <= length + EPSILON
      && Math.abs(local.y) <= Math.max(0, local.x / 2) + EPSILON;
  }
  const length = size * unit;
  const halfWidth = clampCampaignMapAreaTemplateSize(template.widthSpaces ?? 1) * unit / 2;
  return local.x >= -EPSILON
    && local.x <= length + EPSILON
    && Math.abs(local.y) <= halfWidth + EPSILON;
}

function gridDistanceSpaces(
  source: CampaignMapGridCell,
  target: CampaignMapGridCell,
  grid: CampaignMapGrid,
): number {
  const dq = Math.abs(target.q - source.q);
  const dr = Math.abs(target.r - source.r);
  if (grid.type === "hex") {
    const ds = Math.abs((-target.q - target.r) - (-source.q - source.r));
    return Math.max(dq, dr, ds);
  }
  const diagonal = Math.min(dq, dr);
  const straight = Math.max(dq, dr) - diagonal;
  return straight + diagonal + Math.floor(diagonal / 2);
}

function angularDifferenceDegrees(first: number, second: number): number {
  const difference = Math.abs(normalizeCampaignMapAreaTemplateAngle(first) - normalizeCampaignMapAreaTemplateAngle(second));
  return Math.min(difference, 360 - difference);
}

function campaignMapAreaTemplateCellAffected(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  cell: CampaignMapGridCell,
  grid: CampaignMapGrid,
): boolean {
  const center = gridCellCenter(cell, grid);
  if (template.shape !== "cone" && template.shape !== "line") {
    return campaignMapAreaTemplateContainsPoint(template, center, grid);
  }

  const sourceCell = gridCellAtPosition({ x: template.x, y: template.y }, grid);
  if (cell.q === sourceCell.q && cell.r === sourceCell.r) return false;

  const local = rotateLocal(
    center.x - template.x,
    center.y - template.y,
    normalizeCampaignMapAreaTemplateAngle(template.angleDegrees),
  );
  if (local.x <= EPSILON) return false;

  if (template.shape === "cone") {
    if (gridDistanceSpaces(sourceCell, cell, grid) > clampCampaignMapAreaTemplateSize(template.sizeSpaces)) return false;
    const pointAngle = normalizeCampaignMapAreaTemplateAngle(
      Math.atan2(center.y - template.y, center.x - template.x) * 180 / Math.PI,
    );
    const halfAngle = Math.atan(0.5) * 180 / Math.PI;
    return angularDifferenceDegrees(pointAngle, template.angleDegrees) <= halfAngle + EPSILON;
  }

  const unit = campaignMapGridSpacePixels(grid);
  const halfWidth = clampCampaignMapAreaTemplateSize(template.widthSpaces ?? 1) * unit / 2;
  if (Math.abs(local.y) > halfWidth + EPSILON) return false;

  const angleRadians = normalizeCampaignMapAreaTemplateAngle(template.angleDegrees) * Math.PI / 180;
  const projected = {
    x: template.x + Math.cos(angleRadians) * local.x,
    y: template.y + Math.sin(angleRadians) * local.x,
  };
  const projectedCell = gridCellAtPosition(projected, grid);
  return gridDistanceSpaces(sourceCell, projectedCell, grid) <= clampCampaignMapAreaTemplateSize(template.sizeSpaces);
}

function campaignMapAreaTemplateBoundingRadius(
  template: Pick<CampaignMapAreaTemplate, "shape" | "sizeSpaces"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  grid: CampaignMapGrid,
): number {
  const unit = campaignMapGridSpacePixels(grid);
  const size = clampCampaignMapAreaTemplateSize(template.sizeSpaces);
  if (template.shape === "radius") return size * unit;
  if (template.shape === "cube") return size * unit * Math.SQRT2 / 2;
  if (template.shape === "cone") return size * unit * (grid.type === "square" ? Math.SQRT2 : 1) + unit;
  const halfWidth = clampCampaignMapAreaTemplateSize(template.widthSpaces ?? 1) * unit / 2;
  return size * unit * (grid.type === "square" ? Math.SQRT2 : 1) + halfWidth + unit;
}

export function campaignMapAreaTemplateAffectedCells(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  grid: CampaignMapGrid,
  mapWidth: number,
  mapHeight: number,
): CampaignMapGridCell[] {
  if (![mapWidth, mapHeight, template.x, template.y].every(Number.isFinite) || mapWidth <= 0 || mapHeight <= 0) return [];
  const radius = campaignMapAreaTemplateBoundingRadius(template, grid);
  if (!radius) return [];
  const candidates = gridCellsInRectangle(
    { x: template.x - radius, y: template.y - radius },
    { x: template.x + radius, y: template.y + radius },
    grid,
    MAX_CANDIDATE_CELLS,
  );
  return candidates.filter(cell => {
    const center = gridCellCenter(cell, grid);
    return center.x >= 0 && center.x <= mapWidth
      && center.y >= 0 && center.y <= mapHeight
      && campaignMapAreaTemplateCellAffected(template, cell, grid);
  });
}

export function campaignMapAreaTemplateAffectedPath(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  grid: CampaignMapGrid,
  mapWidth: number,
  mapHeight: number,
): string {
  return campaignMapAreaTemplateAffectedCells(template, grid, mapWidth, mapHeight)
    .map(cell => gridCellPath(cell, grid))
    .join(" ");
}

export function campaignMapAreaTemplateOutlinePath(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  grid: CampaignMapGrid,
): string {
  const unit = campaignMapGridSpacePixels(grid);
  const size = clampCampaignMapAreaTemplateSize(template.sizeSpaces);
  const angle = normalizeCampaignMapAreaTemplateAngle(template.angleDegrees);
  const origin = { x: template.x, y: template.y };
  if (!unit) return "";
  if (template.shape === "radius") {
    const radius = size * unit;
    return `M ${template.x + radius} ${template.y} A ${radius} ${radius} 0 1 0 ${template.x - radius} ${template.y} A ${radius} ${radius} 0 1 0 ${template.x + radius} ${template.y} Z`;
  }
  if (template.shape === "cube") {
    const half = size * unit / 2;
    const points = [
      worldPoint(origin, { x: -half, y: -half }, angle),
      worldPoint(origin, { x: half, y: -half }, angle),
      worldPoint(origin, { x: half, y: half }, angle),
      worldPoint(origin, { x: -half, y: half }, angle),
    ];
    return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") + " Z";
  }
  if (template.shape === "cone") {
    const length = size * unit;
    const points = [
      origin,
      worldPoint(origin, { x: length, y: -length / 2 }, angle),
      worldPoint(origin, { x: length, y: length / 2 }, angle),
    ];
    return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") + " Z";
  }
  const length = size * unit;
  const halfWidth = clampCampaignMapAreaTemplateSize(template.widthSpaces ?? 1) * unit / 2;
  const points = [
    worldPoint(origin, { x: 0, y: -halfWidth }, angle),
    worldPoint(origin, { x: length, y: -halfWidth }, angle),
    worldPoint(origin, { x: length, y: halfWidth }, angle),
    worldPoint(origin, { x: 0, y: halfWidth }, angle),
  ];
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") + " Z";
}

export function campaignMapAreaTemplateDirectionPoint(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees"> & Partial<Pick<CampaignMapAreaTemplate, "widthSpaces">>,
  grid: CampaignMapGrid,
): CampaignMapGridPosition {
  const unit = campaignMapGridSpacePixels(grid);
  const distance = template.shape === "cube"
    ? clampCampaignMapAreaTemplateSize(template.sizeSpaces) * unit / 2
    : clampCampaignMapAreaTemplateSize(template.sizeSpaces) * unit;
  return worldPoint({ x: template.x, y: template.y }, { x: distance, y: 0 }, normalizeCampaignMapAreaTemplateAngle(template.angleDegrees));
}

export function campaignMapAreaTemplateSizeLabel(sizeSpaces: number, grid: CampaignMapGrid): string {
  const size = clampCampaignMapAreaTemplateSize(sizeSpaces);
  return grid.type === "square"
    ? `${size * 5} ft · ${size} square${size === 1 ? "" : "s"}`
    : `${size} hex${size === 1 ? "" : "es"}`;
}
