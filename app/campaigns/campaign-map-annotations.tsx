"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  campaignMapAnnotationPath,
  parseCampaignMapAnnotationGeometry,
  type CampaignMapAnnotation,
  type CampaignMapAnnotationGeometry,
  type CampaignMapAnnotationKind,
  type CampaignMapAnnotationVisibility,
  type CampaignMapPoint,
} from "@/lib/campaigns/map-annotation-model";
import { campaignMapChangedEvent } from "./use-live-session";

export type CampaignMapDrawingTool = CampaignMapAnnotationKind | "erase";

type DrawingDraft = {
  pointerId: number;
  kind: CampaignMapAnnotationKind;
  start: CampaignMapPoint;
  latest: CampaignMapPoint;
  points: CampaignMapPoint[];
};

type AnnotationResponse = {
  annotations?: CampaignMapAnnotation[];
  annotation?: CampaignMapAnnotation;
  ok?: boolean;
  error?: string;
};

export type CampaignMapAnnotationController = {
  annotations: CampaignMapAnnotation[];
  draft: CampaignMapAnnotationGeometry | null;
  tool: CampaignMapDrawingTool | null;
  visibility: CampaignMapAnnotationVisibility;
  busy: boolean;
  error: string;
  toggleDrawing: () => void;
  setTool: (tool: CampaignMapDrawingTool) => void;
  setVisibility: (visibility: CampaignMapAnnotationVisibility) => void;
  stopDrawing: () => void;
  clearAnnotations: () => Promise<void>;
  eraseAnnotation: (id: string) => Promise<void>;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerEnd: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointFromEvent(
  svg: SVGSVGElement,
  event: Pick<PointerEvent, "clientX" | "clientY">,
  width: number,
  height: number,
): CampaignMapPoint | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const mapped = point.matrixTransform(matrix.inverse());
  return {
    x: Math.round(clamp(mapped.x, 0, width) * 100) / 100,
    y: Math.round(clamp(mapped.y, 0, height) * 100) / 100,
  };
}

function distance(a: CampaignMapPoint, b: CampaignMapPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function draftGeometry(draft: DrawingDraft, width: number, height: number): CampaignMapAnnotationGeometry | null {
  if (draft.kind === "freehand") {
    const points = draft.points.length > 1 ? draft.points : [draft.start, draft.latest];
    return points.length > 1 ? { kind: "freehand", points } : null;
  }
  if (draft.kind === "line" || draft.kind === "arrow") {
    if (distance(draft.start, draft.latest) < 1) return null;
    return {
      kind: draft.kind,
      x1: draft.start.x,
      y1: draft.start.y,
      x2: draft.latest.x,
      y2: draft.latest.y,
    };
  }
  if (draft.kind === "rect") {
    const x = Math.min(draft.start.x, draft.latest.x);
    const y = Math.min(draft.start.y, draft.latest.y);
    const rectWidth = Math.abs(draft.latest.x - draft.start.x);
    const rectHeight = Math.abs(draft.latest.y - draft.start.y);
    if (rectWidth < 1 || rectHeight < 1) return null;
    return { kind: "rect", x, y, width: rectWidth, height: rectHeight };
  }
  const maximumRadius = Math.max(0, Math.min(
    draft.start.x,
    draft.start.y,
    width - draft.start.x,
    height - draft.start.y,
  ));
  const r = Math.min(distance(draft.start, draft.latest), maximumRadius);
  if (r < 1) return null;
  return { kind: "circle", cx: draft.start.x, cy: draft.start.y, r };
}

export function useCampaignMapAnnotations({
  campaignId,
  mapId,
  mapName,
  width,
  height,
  open,
  canManage,
  onChanged,
}: {
  campaignId: string;
  mapId: string | null;
  mapName: string;
  width: number | null;
  height: number | null;
  open: boolean;
  canManage: boolean;
  onChanged?: () => void;
}): CampaignMapAnnotationController {
  const [annotations, setAnnotations] = useState<CampaignMapAnnotation[]>([]);
  const [draftState, setDraftState] = useState<DrawingDraft | null>(null);
  const draftRef = useRef<DrawingDraft | null>(null);
  const [tool, setToolState] = useState<CampaignMapDrawingTool | null>(null);
  const [visibility, setVisibility] = useState<CampaignMapAnnotationVisibility>("players");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const reload = useCallback(async () => {
    if (!open || !mapId || !width || !height) {
      setAnnotations([]);
      return;
    }
    const sequence = ++loadSequence.current;
    try {
      const params = new URLSearchParams({ mapId });
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotations) throw new Error(body.error || "Map drawings could not be loaded.");
      if (sequence === loadSequence.current) {
        setAnnotations(body.annotations);
        setError("");
      }
    } catch (loadError) {
      if (sequence === loadSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Map drawings could not be loaded.");
      }
    }
  }, [campaignId, height, mapId, open, width]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!open) return;
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId?: string }>).detail;
      if (detail?.campaignId === campaignId) void reload();
    };
    window.addEventListener(campaignMapChangedEvent, refresh);
    return () => window.removeEventListener(campaignMapChangedEvent, refresh);
  }, [campaignId, open, reload]);

  useEffect(() => {
    draftRef.current = null;
    setDraftState(null);
    if (!canManage) setToolState(null);
  }, [canManage, mapId]);

  const persistAnnotation = useCallback(async (geometry: CampaignMapAnnotationGeometry) => {
    if (!mapId || !canManage) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          mapId,
          kind: geometry.kind,
          visibility,
          geometry,
        }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotation) throw new Error(body.error || "Drawing could not be saved.");
      setAnnotations(current => current.some(annotation => annotation.id === body.annotation?.id)
        ? current
        : [...current, body.annotation as CampaignMapAnnotation]);
      onChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Drawing could not be saved.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [campaignId, canManage, mapId, onChanged, reload, visibility]);

  const eraseAnnotation = useCallback(async (id: string) => {
    if (!mapId || !canManage || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", mapId, annotationId: id }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Drawing could not be erased.");
      setAnnotations(current => current.filter(annotation => annotation.id !== id));
      onChanged?.();
    } catch (eraseError) {
      setError(eraseError instanceof Error ? eraseError.message : "Drawing could not be erased.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [busy, campaignId, canManage, mapId, onChanged, reload]);

  const clearAnnotations = useCallback(async () => {
    if (!mapId || !canManage || busy || annotations.length === 0) return;
    if (!window.confirm(`Clear all drawings from “${mapName}”? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear", mapId }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Drawings could not be cleared.");
      setAnnotations([]);
      onChanged?.();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Drawings could not be cleared.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [annotations.length, busy, campaignId, canManage, mapId, mapName, onChanged, reload]);

  const setDraft = useCallback((next: DrawingDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    if (!canManage || !tool || !width || !height) return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    event.preventDefault();
    if (tool === "erase" || busy) return true;
    const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
    if (!point) return true;
    const next: DrawingDraft = {
      pointerId: event.pointerId,
      kind: tool,
      start: point,
      latest: point,
      points: tool === "freehand" ? [point] : [],
    };
    setDraft(next);
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  }, [busy, canManage, height, setDraft, tool, width]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const current = draftRef.current;
    if (!current || current.pointerId !== event.pointerId || !width || !height) return false;
    const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
    if (!point) return true;
    event.preventDefault();
    let points = current.points;
    if (current.kind === "freehand" && points.length < 400) {
      const previous = points.at(-1) ?? current.start;
      if (distance(previous, point) >= 2) points = [...points, point];
    }
    setDraft({ ...current, latest: point, points });
    return true;
  }, [height, setDraft, width]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const current = draftRef.current;
    if (!current || current.pointerId !== event.pointerId || !width || !height) return false;
    event.preventDefault();
    const end = pointFromEvent(event.currentTarget, event.nativeEvent, width, height) ?? current.latest;
    let points = current.points;
    if (current.kind === "freehand" && points.length < 400 && distance(points.at(-1) ?? current.start, end) >= 1) {
      points = [...points, end];
    }
    const finished = { ...current, latest: end, points };
    const geometry = draftGeometry(finished, width, height);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (geometry) {
      const validated = parseCampaignMapAnnotationGeometry(geometry.kind, geometry, width, height);
      if (validated) void persistAnnotation(validated);
    }
    return true;
  }, [height, persistAnnotation, setDraft, width]);

  return {
    annotations,
    draft: draftState && width && height ? draftGeometry(draftState, width, height) : null,
    tool,
    visibility,
    busy,
    error,
    toggleDrawing: () => setToolState(current => current ? null : "freehand"),
    setTool: setToolState,
    setVisibility,
    stopDrawing: () => {
      setToolState(null);
      setDraft(null);
    },
    clearAnnotations,
    eraseAnnotation,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
}

function toolLabel(tool: CampaignMapDrawingTool): string {
  if (tool === "freehand") return "Pen";
  if (tool === "rect") return "Rectangle";
  if (tool === "circle") return "Circle";
  return tool[0].toUpperCase() + tool.slice(1);
}

export function CampaignMapDrawingPalette({ controller }: { controller: CampaignMapAnnotationController }) {
  if (!controller.tool) return null;
  const tools: CampaignMapDrawingTool[] = ["freehand", "line", "arrow", "rect", "circle", "erase"];
  return <div className="campaign-map-drawing-palette" role="toolbar" aria-label="Map drawing tools">
    <div className="campaign-map-drawing-tools">
      {tools.map(tool => <button
        type="button"
        key={tool}
        className={`campaign-map-drawing-tool${controller.tool === tool ? " is-active" : ""}`}
        aria-pressed={controller.tool === tool}
        disabled={controller.busy}
        onClick={() => controller.setTool(tool)}
      >{toolLabel(tool)}</button>)}
    </div>
    <div className="campaign-map-drawing-options">
      <span>New drawings</span>
      <button type="button" className={controller.visibility === "players" ? "is-active" : ""} aria-pressed={controller.visibility === "players"} onClick={() => controller.setVisibility("players")}>Players</button>
      <button type="button" className={controller.visibility === "gm" ? "is-active" : ""} aria-pressed={controller.visibility === "gm"} onClick={() => controller.setVisibility("gm")}>GM only</button>
    </div>
    <div className="campaign-map-drawing-actions">
      <button type="button" disabled={controller.busy || controller.annotations.length === 0} onClick={() => void controller.clearAnnotations()}>Clear all</button>
      <button type="button" onClick={controller.stopDrawing}>Done</button>
    </div>
    {controller.tool === "erase" && <small>Tap or click a drawing to erase it.</small>}
    {controller.tool === "circle" && <small>Drag from the circle’s center outward.</small>}
    {controller.error && <p className="campaign-map-drawing-error" role="alert">{controller.error}</p>}
  </div>;
}

function annotationAriaLabel(annotation: CampaignMapAnnotation): string {
  const kind = annotation.kind === "freehand" ? "freehand" : annotation.kind;
  const visibility = annotation.visibility === "players" ? "player-visible" : "GM-only";
  return `Erase ${visibility} ${kind} drawing`;
}

function AnnotationShape({
  geometry,
  markerEnd,
  className,
}: {
  geometry: CampaignMapAnnotationGeometry;
  markerEnd?: string;
  className: string;
}) {
  const path = campaignMapAnnotationPath(geometry);
  if (path) return <path className={className} d={path} fill="none" markerEnd={geometry.kind === "arrow" ? markerEnd : undefined} vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "rect") return <rect className={className} x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} fill="none" vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "circle") return <circle className={className} cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill="none" vectorEffect="non-scaling-stroke" />;
  return null;
}

function AnnotationHitShape({ geometry }: { geometry: CampaignMapAnnotationGeometry }) {
  const path = campaignMapAnnotationPath(geometry);
  if (path) return <path className="campaign-map-annotation-hit" d={path} fill="none" vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "rect") return <rect className="campaign-map-annotation-hit is-area" x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "circle") return <circle className="campaign-map-annotation-hit is-area" cx={geometry.cx} cy={geometry.cy} r={geometry.r} vectorEffect="non-scaling-stroke" />;
  return null;
}

export function CampaignMapAnnotationLayer({ controller }: { controller: CampaignMapAnnotationController }) {
  const markerBase = useId().replaceAll(":", "");
  const playerMarker = `${markerBase}-players`;
  const gmMarker = `${markerBase}-gm`;
  const previewMarker = `${markerBase}-preview`;
  const erasing = controller.tool === "erase";

  const erasePointer = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    if (!erasing) return;
    event.preventDefault();
    event.stopPropagation();
    void controller.eraseAnnotation(id);
  };
  const eraseKey = (event: ReactKeyboardEvent<SVGGElement>, id: string) => {
    if (!erasing || (event.key !== "Enter" && event.key !== " " && event.key !== "Delete" && event.key !== "Backspace")) return;
    event.preventDefault();
    event.stopPropagation();
    void controller.eraseAnnotation(id);
  };

  return <>
    <defs>
      <marker id={playerMarker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="#f4cf72" /></marker>
      <marker id={gmMarker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="#7dd3fc" /></marker>
      <marker id={previewMarker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="#fff8dd" /></marker>
    </defs>
    <g className={`campaign-map-annotation-layer${erasing ? " is-erasing" : ""}`}>
      {controller.annotations.map(annotation => <g
        key={annotation.id}
        className={`campaign-map-annotation-group is-${annotation.visibility}${erasing ? " is-erasable" : ""}`}
        role={erasing ? "button" : undefined}
        tabIndex={erasing ? 0 : undefined}
        aria-label={erasing ? annotationAriaLabel(annotation) : undefined}
        onPointerDown={event => erasePointer(event, annotation.id)}
        onKeyDown={event => eraseKey(event, annotation.id)}
      >
        <AnnotationShape
          geometry={annotation.geometry}
          className="campaign-map-annotation"
          markerEnd={`url(#${annotation.visibility === "players" ? playerMarker : gmMarker})`}
        />
        {erasing && <AnnotationHitShape geometry={annotation.geometry} />}
      </g>)}
      {controller.draft && <AnnotationShape geometry={controller.draft} className="campaign-map-annotation-preview" markerEnd={`url(#${previewMarker})`} />}
    </g>
  </>;
}
