import {
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
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees">,
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
  const halfWidth = unit / 2;
  return local.x >= -EPSILON
    && local.x <= length + EPSILON
    && Math.abs(local.y) <= halfWidth + EPSILON;
}

function campaignMapAreaTemplateBoundingRadius(
  template: Pick<CampaignMapAreaTemplate, "shape" | "sizeSpaces">,
  grid: CampaignMapGrid,
): number {
  const unit = campaignMapGridSpacePixels(grid);
  const size = clampCampaignMapAreaTemplateSize(template.sizeSpaces);
  if (template.shape === "radius") return size * unit;
  if (template.shape === "cube") return size * unit * Math.SQRT2 / 2;
  if (template.shape === "cone") return size * unit * Math.sqrt(1.25);
  return Math.hypot(size * unit, unit / 2);
}

export function campaignMapAreaTemplateAffectedCells(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees">,
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
      && campaignMapAreaTemplateContainsPoint(template, center, grid);
  });
}

export function campaignMapAreaTemplateAffectedPath(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees">,
  grid: CampaignMapGrid,
  mapWidth: number,
  mapHeight: number,
): string {
  return campaignMapAreaTemplateAffectedCells(template, grid, mapWidth, mapHeight)
    .map(cell => gridCellPath(cell, grid))
    .join(" ");
}

export function campaignMapAreaTemplateOutlinePath(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees">,
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
  const halfWidth = unit / 2;
  const points = [
    worldPoint(origin, { x: 0, y: -halfWidth }, angle),
    worldPoint(origin, { x: length, y: -halfWidth }, angle),
    worldPoint(origin, { x: length, y: halfWidth }, angle),
    worldPoint(origin, { x: 0, y: halfWidth }, angle),
  ];
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") + " Z";
}

export function campaignMapAreaTemplateDirectionPoint(
  template: Pick<CampaignMapAreaTemplate, "shape" | "x" | "y" | "sizeSpaces" | "angleDegrees">,
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
