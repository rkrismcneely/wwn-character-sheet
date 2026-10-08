export type CampaignMapAnnotationKind = "freehand" | "line" | "arrow" | "rect" | "circle" | "text";
export type CampaignMapAnnotationVisibility = "players" | "gm";

export type CampaignMapPoint = { x: number; y: number };

export type CampaignMapAnnotationGeometry =
  | { kind: "freehand"; points: CampaignMapPoint[] }
  | { kind: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "text"; x: number; y: number; text: string; fontSize: number };

export type CampaignMapAnnotation = {
  id: string;
  kind: CampaignMapAnnotationKind;
  visibility: CampaignMapAnnotationVisibility;
  color: string;
  geometry: CampaignMapAnnotationGeometry;
  createdAt: string;
};

export const campaignMapAnnotationKinds: CampaignMapAnnotationKind[] = [
  "freehand", "line", "arrow", "rect", "circle", "text",
];

export const campaignMapPlayerAnnotationColor = "#f4cf72";
export const campaignMapGmAnnotationColor = "#7dd3fc";

export function isCampaignMapAnnotationKind(value: unknown): value is CampaignMapAnnotationKind {
  return typeof value === "string" && campaignMapAnnotationKinds.includes(value as CampaignMapAnnotationKind);
}

export function isCampaignMapAnnotationVisibility(value: unknown): value is CampaignMapAnnotationVisibility {
  return value === "players" || value === "gm";
}

export function campaignMapAnnotationDefaultColor(visibility: CampaignMapAnnotationVisibility): string {
  return visibility === "gm" ? campaignMapGmAnnotationColor : campaignMapPlayerAnnotationColor;
}

export function parseCampaignMapAnnotationColor(
  value: unknown,
  visibility: CampaignMapAnnotationVisibility,
): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/u.test(value)) return value.toLowerCase();
  return campaignMapAnnotationDefaultColor(visibility);
}

function finiteCoordinate(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) return null;
  return Math.round(value * 100) / 100;
}

function positiveExtent(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) return null;
  return Math.round(value * 100) / 100;
}

function annotationText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 120 || /[\u0000-\u001f\u007f]/u.test(text)) return null;
  return text;
}

export function parseCampaignMapAnnotationGeometry(
  kind: CampaignMapAnnotationKind,
  raw: unknown,
  mapWidth: number,
  mapHeight: number,
): CampaignMapAnnotationGeometry | null {
  if (!raw || typeof raw !== "object" || !Number.isFinite(mapWidth) || !Number.isFinite(mapHeight) || mapWidth <= 0 || mapHeight <= 0) {
    return null;
  }
  const value = raw as Record<string, unknown>;
  if (kind === "freehand") {
    if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 400) return null;
    const points: CampaignMapPoint[] = [];
    let hasVisibleSegment = false;
    for (const rawPoint of value.points) {
      if (!rawPoint || typeof rawPoint !== "object") return null;
      const point = rawPoint as Record<string, unknown>;
      const x = finiteCoordinate(point.x, mapWidth);
      const y = finiteCoordinate(point.y, mapHeight);
      if (x === null || y === null) return null;
      const next = { x, y };
      const previous = points.at(-1);
      if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) >= 1) hasVisibleSegment = true;
      points.push(next);
    }
    return hasVisibleSegment ? { kind, points } : null;
  }
  if (kind === "line" || kind === "arrow") {
    const x1 = finiteCoordinate(value.x1, mapWidth);
    const y1 = finiteCoordinate(value.y1, mapHeight);
    const x2 = finiteCoordinate(value.x2, mapWidth);
    const y2 = finiteCoordinate(value.y2, mapHeight);
    if ([x1, y1, x2, y2].some(coordinate => coordinate === null)) return null;
    if (Math.hypot((x2 as number) - (x1 as number), (y2 as number) - (y1 as number)) < 1) return null;
    return { kind, x1: x1 as number, y1: y1 as number, x2: x2 as number, y2: y2 as number };
  }
  if (kind === "rect") {
    const x = finiteCoordinate(value.x, mapWidth);
    const y = finiteCoordinate(value.y, mapHeight);
    const width = positiveExtent(value.width, mapWidth);
    const height = positiveExtent(value.height, mapHeight);
    if (x === null || y === null || width === null || height === null || x + width > mapWidth + 0.01 || y + height > mapHeight + 0.01) return null;
    return { kind, x, y, width, height };
  }
  if (kind === "text") {
    const x = finiteCoordinate(value.x, mapWidth);
    const y = finiteCoordinate(value.y, mapHeight);
    const text = annotationText(value.text);
    const fontSize = positiveExtent(value.fontSize, Math.max(mapWidth, mapHeight));
    if (x === null || y === null || text === null || fontSize === null || fontSize < 8 || fontSize > 200) return null;
    return { kind, x, y, text, fontSize };
  }
  const cx = finiteCoordinate(value.cx, mapWidth);
  const cy = finiteCoordinate(value.cy, mapHeight);
  const r = positiveExtent(value.r, Math.max(mapWidth, mapHeight));
  if (cx === null || cy === null || r === null) return null;
  if (cx - r < -0.01 || cy - r < -0.01 || cx + r > mapWidth + 0.01 || cy + r > mapHeight + 0.01) return null;
  return { kind: "circle", cx, cy, r };
}

export function campaignMapAnnotationPath(geometry: CampaignMapAnnotationGeometry): string | null {
  if (geometry.kind === "freehand") {
    return geometry.points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  }
  if (geometry.kind === "line" || geometry.kind === "arrow") {
    return `M ${geometry.x1} ${geometry.y1} L ${geometry.x2} ${geometry.y2}`;
  }
  return null;
}
