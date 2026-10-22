"use client";

import {
  useCallback, useEffect, useId, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  campaignMapAnnotationPath,
  campaignMapPlayerAnnotationColor,
  parseCampaignMapAnnotationGeometry,
  translateCampaignMapAnnotationGeometry,
  type CampaignMapAnnotation,
  type CampaignMapAnnotationGeometry,
  type CampaignMapAnnotationKind,
  type CampaignMapAnnotationVisibility,
  type CampaignMapPoint,
} from "@/lib/campaigns/map-annotation-model";
import { campaignMapChangedEvent } from "./use-live-session";

export type CampaignMapDrawingTool = CampaignMapAnnotationKind | "select" | "erase";
type DragDrawingKind = Exclude<CampaignMapAnnotationKind, "text">;
type DrawingDraft = { pointerId: number; mapId: string; kind: DragDrawingKind; start: CampaignMapPoint; latest: CampaignMapPoint; points: CampaignMapPoint[] };
type MoveDraft = { pointerId: number; id: string; start: CampaignMapPoint; geometry: CampaignMapAnnotationGeometry };
type AnnotationResponse = { annotations?: CampaignMapAnnotation[]; annotation?: CampaignMapAnnotation; ok?: boolean; error?: string };

export type CampaignMapAnnotationController = {
  annotations: CampaignMapAnnotation[];
  draft: CampaignMapAnnotationGeometry | null;
  tool: CampaignMapDrawingTool | null;
  visibility: CampaignMapAnnotationVisibility;
  color: string;
  textValue: string;
  textSize: number;
  selectedId: string | null;
  selected: CampaignMapAnnotation | null;
  canManage: boolean;
  busy: boolean;
  error: string;
  toggleDrawing: () => void;
  setTool: (tool: CampaignMapDrawingTool) => void;
  setVisibility: (visibility: CampaignMapAnnotationVisibility) => void;
  setColor: (color: string) => void;
  setTextValue: (value: string) => void;
  setTextSize: (size: number) => void;
  commitTextSize: () => Promise<void>;
  updateSelectedText: (text: string) => Promise<void>;
  duplicateSelected: () => Promise<void>;
  selectAnnotation: (id: string | null) => void;
  beginMove: (event: ReactPointerEvent<SVGGElement>, id: string) => void;
  stopDrawing: () => void;
  cancelPointerInteraction: () => void;
  clearAnnotations: () => Promise<void>;
  eraseAnnotation: (id: string) => Promise<void>;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerEnd: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
};

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function pointFromEvent(svg: SVGSVGElement, event: Pick<PointerEvent, "clientX" | "clientY">, width: number, height: number): CampaignMapPoint | null {
  const matrix = svg.getScreenCTM(); if (!matrix) return null;
  const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
  const mapped = p.matrixTransform(matrix.inverse());
  return { x: Math.round(clamp(mapped.x, 0, width) * 100) / 100, y: Math.round(clamp(mapped.y, 0, height) * 100) / 100 };
}
function distance(a: CampaignMapPoint, b: CampaignMapPoint) { return Math.hypot(b.x - a.x, b.y - a.y); }
function draftGeometry(draft: DrawingDraft, width: number, height: number): CampaignMapAnnotationGeometry | null {
  if (draft.kind === "freehand") {
    if (draft.points.length < 2) return null;
    return draft.points.some((p, i) => i > 0 && distance(draft.points[i - 1], p) >= 1) ? { kind: "freehand", points: draft.points } : null;
  }
  if (draft.kind === "line" || draft.kind === "arrow") {
    return distance(draft.start, draft.latest) < 1 ? null : { kind: draft.kind, x1: draft.start.x, y1: draft.start.y, x2: draft.latest.x, y2: draft.latest.y };
  }
  if (draft.kind === "rect") {
    const x = Math.min(draft.start.x, draft.latest.x), y = Math.min(draft.start.y, draft.latest.y);
    const rw = Math.abs(draft.latest.x - draft.start.x), rh = Math.abs(draft.latest.y - draft.start.y);
    return rw < 1 || rh < 1 ? null : { kind: "rect", x, y, width: rw, height: rh };
  }
  const maxR = Math.max(0, Math.min(draft.start.x, draft.start.y, width - draft.start.x, height - draft.start.y));
  const r = Math.min(distance(draft.start, draft.latest), maxR);
  return r < 1 ? null : { kind: "circle", cx: draft.start.x, cy: draft.start.y, r };
}

export function useCampaignMapAnnotations({ campaignId, mapId, mapName, width, height, open, canManage, onChanged, onEdited }: {
  campaignId: string; mapId: string | null; mapName: string; width: number | null; height: number | null; open: boolean; canManage: boolean; onChanged?: () => void;
  onEdited?: (before: CampaignMapAnnotation | null, after: CampaignMapAnnotation | null) => void;
}): CampaignMapAnnotationController {
  const [annotations, setAnnotations] = useState<CampaignMapAnnotation[]>([]);
  const [draftState, setDraftState] = useState<DrawingDraft | null>(null);
  const draftRef = useRef<DrawingDraft | null>(null);
  const moveRef = useRef<MoveDraft | null>(null);
  const [tool, setToolState] = useState<CampaignMapDrawingTool | null>(null);
  const [visibility, setVisibilityState] = useState<CampaignMapAnnotationVisibility>("players");
  const [color, setColorState] = useState(campaignMapPlayerAnnotationColor);
  const [textValue, setTextValue] = useState("");
  const [textSize, setTextSizeState] = useState(32);
  const textSizeEditingRef = useRef(false);
  const originalTextAnnotationRef = useRef<CampaignMapAnnotation | null>(null);
  const pendingReloadRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const selected = annotations.find(a => a.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    if (!open || !mapId || !width || !height) return;
    if (textSizeEditingRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    const seq = ++loadSequence.current;
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations?${new URLSearchParams({ mapId })}`, { cache: "no-store" });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotations) throw new Error(body.error || "Map annotations could not be loaded.");
      if (seq === loadSequence.current) {
        setAnnotations(body.annotations);
        setSelectedId(current => current && body.annotations?.some(a => a.id === current && a.canEdit) ? current : null);
        setError("");
      }
    } catch (e) { if (seq === loadSequence.current) setError(e instanceof Error ? e.message : "Map annotations could not be loaded."); }
  }, [campaignId, height, mapId, open, width]);

  useEffect(() => { const timer = window.setTimeout(() => void reload(), 0); return () => window.clearTimeout(timer); }, [reload]);
  useEffect(() => {
    if (!open) return;
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; void reload(); }, 60);
    };
    const onLocal = (event: Event) => {
      if ((event as CustomEvent<{ campaignId?: string }>).detail?.campaignId === campaignId) refresh();
    };
    window.addEventListener(campaignMapChangedEvent, onLocal);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`twe:campaign-map:${campaignId}`) : null;
    if (channel) channel.onmessage = event => {
      const msg = event.data as { type?: unknown; campaignId?: unknown; scope?: unknown } | null;
      if (msg?.type === "map-changed" && msg.campaignId === campaignId && msg.scope !== "tokens") refresh();
    };
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(campaignMapChangedEvent, onLocal);
      channel?.close();
    };
  }, [campaignId, open, reload]);


  const saveUpdate = useCallback(async (annotation: CampaignMapAnnotation, geometry: CampaignMapAnnotationGeometry, nextColor = annotation.color, previous = annotation) => {
    if (!mapId || !annotation.canEdit) return;
    setAnnotations(current => current.map(a => a.id === annotation.id ? { ...a, geometry, color: nextColor } : a));
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", mapId, annotationId: annotation.id, geometry, color: nextColor }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotation) throw new Error(body.error || "Annotation could not be updated.");
      setAnnotations(current => current.map(a => a.id === annotation.id ? body.annotation as CampaignMapAnnotation : a));
      if (JSON.stringify(previous.geometry) !== JSON.stringify(body.annotation.geometry) || previous.color !== body.annotation.color) onEdited?.(previous, body.annotation);
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Annotation could not be updated."); void reload(); }
  }, [campaignId, mapId, onChanged, onEdited, reload]);

  const persistAnnotation = useCallback(async (geometry: CampaignMapAnnotationGeometry) => {
    if (!mapId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", mapId, kind: geometry.kind, visibility: canManage ? visibility : "players", color, geometry }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotation) throw new Error(body.error || "Annotation could not be saved.");
      setAnnotations(current => [...current.filter(a => a.id !== body.annotation?.id), body.annotation as CampaignMapAnnotation]);
      onEdited?.(null, body.annotation);
      if (geometry.kind === "text") {
        // A label is an editable object immediately after placement. Remaining
        // in text creation mode blocked hit testing and made resizing impossible.
        setTextValue("");
        setToolState(null);
        setSelectedId(body.annotation.id);
        setTextSizeState(geometry.fontSize);
      }
      onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Annotation could not be saved."); void reload(); }
    finally { setBusy(false); }
  }, [campaignId, canManage, color, mapId, onChanged, onEdited, reload, visibility]);

  const duplicateSelected = useCallback(async () => {
    if (!selected?.canEdit || !mapId || !width || !height || busy) return;
    const geometry = translateCampaignMapAnnotationGeometry(
      selected.geometry, 16, 16, width, height,
    ) ?? selected.geometry;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create", mapId, kind: selected.kind,
          visibility: selected.visibility, color: selected.color, geometry,
        }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.annotation) throw new Error(body.error || "Annotation could not be duplicated.");
      setAnnotations(current => [...current, body.annotation as CampaignMapAnnotation]);
      setSelectedId(body.annotation.id);
      onEdited?.(null, body.annotation);
      onChanged?.();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Annotation could not be duplicated.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [busy, campaignId, height, mapId, onChanged, onEdited, reload, selected, width]);

  const eraseAnnotation = useCallback(async (id: string) => {
    const annotation = annotations.find(a => a.id === id);
    if (!mapId || !annotation?.canEdit || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", mapId, annotationId: id }),
      });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Annotation could not be erased.");
      setAnnotations(current => current.filter(a => a.id !== id)); setSelectedId(current => current === id ? null : current); onEdited?.(annotation, null); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Annotation could not be erased."); void reload(); }
    finally { setBusy(false); }
  }, [annotations, busy, campaignId, mapId, onChanged, onEdited, reload]);

  const clearAnnotations = useCallback(async () => {
    if (!canManage || !mapId || busy || !annotations.length || !window.confirm(`Clear all annotations from “${mapName}”? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/annotations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear", mapId }) });
      const body = await response.json() as AnnotationResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Annotations could not be cleared.");
      setAnnotations([]); setSelectedId(null); onChanged?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Annotations could not be cleared."); void reload(); }
    finally { setBusy(false); }
  }, [annotations.length, busy, campaignId, canManage, mapId, mapName, onChanged, reload]);

  const selectAnnotation = useCallback((id: string | null) => {
    if (!id) { setSelectedId(null); return; }
    const annotation = annotations.find(a => a.id === id);
    if (!annotation?.canEdit) return;
    textSizeEditingRef.current = false;
    originalTextAnnotationRef.current = null;
    pendingReloadRef.current = false;
    setSelectedId(id); setColorState(annotation.color);
    if (annotation.geometry.kind === "text") setTextSizeState(annotation.geometry.fontSize);
  }, [annotations]);

  const setColor = useCallback((next: string) => {
    setColorState(next);
    if (selected?.canEdit) void saveUpdate(selected, selected.geometry, next);
  }, [saveUpdate, selected]);

  const setTextSize = useCallback((next: number) => {
    const size = Math.round(clamp(Number(next) || 8, 8, 200));
    setTextSizeState(size);
    if (selected?.canEdit && selected.geometry.kind === "text" && width && height) {
      const geometry = parseCampaignMapAnnotationGeometry("text", { ...selected.geometry, fontSize: size }, width, height);
      if (geometry) {
        if (!textSizeEditingRef.current) originalTextAnnotationRef.current = selected;
        textSizeEditingRef.current = true;
        setAnnotations(current => current.map(annotation => annotation.id === selected.id
          ? { ...annotation, geometry }
          : annotation));
      }
    }
  }, [height, selected, width]);

  const commitTextSize = useCallback(async () => {
    if (!textSizeEditingRef.current || !selectedId) return;
    textSizeEditingRef.current = false;
    const annotation = annotations.find(candidate => candidate.id === selectedId);
    if (annotation?.canEdit && annotation.geometry.kind === "text") {
      await saveUpdate(annotation, annotation.geometry, annotation.color, originalTextAnnotationRef.current ?? annotation);
      originalTextAnnotationRef.current = null;
    }
    if (pendingReloadRef.current) {
      pendingReloadRef.current = false;
      await reload();
    }
  }, [annotations, reload, saveUpdate, selectedId]);

  const updateSelectedText = useCallback(async (text: string) => {
    if (!selected?.canEdit || selected.geometry.kind !== "text" || !width || !height) return;
    const geometry = parseCampaignMapAnnotationGeometry("text", { ...selected.geometry, text }, width, height);
    if (geometry) await saveUpdate(selected, geometry);
  }, [height, saveUpdate, selected, width]);

  const setDraft = useCallback((next: DrawingDraft | null) => { draftRef.current = next; setDraftState(next); }, []);

  const beginMove = useCallback((event: ReactPointerEvent<SVGGElement>, id: string) => {
    // Existing drawings can be selected while the pen or a shape tool is active.
    if (tool === "erase" || !width || !height) return;
    const annotation = annotations.find(a => a.id === id);
    const svg = event.currentTarget.ownerSVGElement;
    if (!annotation?.canEdit || !svg) return;
    const point = pointFromEvent(svg, event.nativeEvent, width, height); if (!point) return;
    event.preventDefault(); event.stopPropagation(); selectAnnotation(id);
    moveRef.current = { pointerId: event.pointerId, id, start: point, geometry: annotation.geometry };
    svg.setPointerCapture(event.pointerId);
  }, [annotations, height, selectAnnotation, tool, width]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    if (!tool || !width || !height) return false;
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    if (tool === "select") { setSelectedId(null); return false; }
    event.preventDefault();
    if (tool === "erase" || busy) return true;
    const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
    if (!point || !mapId) return true;
    // Clicking empty canvas starts a drawing instead of retaining the prior selection.
    setSelectedId(null);
    if (tool === "text") {
      const text = textValue.trim();
      if (!text) { setError("Enter label text, then click or tap the map to place it."); return true; }
      const geometry = parseCampaignMapAnnotationGeometry("text", { x: point.x, y: point.y, text, fontSize: textSize }, width, height);
      if (geometry) void persistAnnotation(geometry);
      return true;
    }
    setDraft({ pointerId: event.pointerId, mapId, kind: tool, start: point, latest: point, points: tool === "freehand" ? [point] : [] });
    event.currentTarget.setPointerCapture(event.pointerId); return true;
  }, [busy, height, mapId, persistAnnotation, setDraft, textSize, textValue, tool, width]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const move = moveRef.current;
    if (move && move.pointerId === event.pointerId && width && height) {
      const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height); if (!point) return true;
      const moved = translateCampaignMapAnnotationGeometry(move.geometry, point.x - move.start.x, point.y - move.start.y, width, height);
      if (moved) setAnnotations(current => current.map(a => a.id === move.id ? { ...a, geometry: moved } : a));
      event.preventDefault(); return true;
    }
    const current = draftRef.current;
    if (!current || current.mapId !== mapId || current.pointerId !== event.pointerId || !width || !height) return false;
    const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height); if (!point) return true;
    event.preventDefault(); let points = current.points;
    if (current.kind === "freehand" && points.length < 400 && distance(points.at(-1) ?? current.start, point) >= 2) points = [...points, point];
    setDraft({ ...current, latest: point, points }); return true;
  }, [height, mapId, setDraft, width]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const move = moveRef.current;
    if (move && move.pointerId === event.pointerId && width && height) {
      moveRef.current = null;
      const annotation = annotations.find(a => a.id === move.id);
      const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
      const moved = point ? translateCampaignMapAnnotationGeometry(move.geometry, point.x - move.start.x, point.y - move.start.y, width, height) : null;
      if (annotation) void saveUpdate(annotation, moved ?? annotation.geometry, annotation.color, { ...annotation, geometry: move.geometry });
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.preventDefault(); return true;
    }
    const current = draftRef.current;
    if (!current || current.mapId !== mapId || current.pointerId !== event.pointerId || !width || !height) return false;
    event.preventDefault();
    const end = pointFromEvent(event.currentTarget, event.nativeEvent, width, height) ?? current.latest;
    let points = current.points;
    if (current.kind === "freehand" && points.length < 400 && distance(points.at(-1) ?? current.start, end) >= 1) points = [...points, end];
    const geometry = draftGeometry({ ...current, latest: end, points }, width, height);
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (geometry) { const valid = parseCampaignMapAnnotationGeometry(geometry.kind, geometry, width, height); if (valid) void persistAnnotation(valid); }
    return true;
  }, [annotations, height, mapId, persistAnnotation, saveUpdate, setDraft, width]);


  // A second touch interrupts a stroke/move without saving a partial drawing.
  // The selected tool stays open so users can resume after the pinch.
  const cancelPointerInteraction = () => {
    const move = moveRef.current;
    moveRef.current = null;
    setDraft(null);
    if (move) setAnnotations(current => current.map(annotation =>
      annotation.id === move.id ? { ...annotation, geometry: move.geometry } : annotation));
  };

  return {
    annotations, draft: draftState && draftState.mapId === mapId && width && height ? draftGeometry(draftState, width, height) : null,
    tool, visibility, color, textValue, textSize, selectedId, selected, canManage, busy, error,
    toggleDrawing: () => setToolState(current => current ? null : "freehand"),
    setTool: next => { setToolState(next); if (next !== "select") setSelectedId(null); },
    setVisibility: next => setVisibilityState(canManage ? next : "players"),
    setColor, setTextValue, setTextSize, commitTextSize, updateSelectedText, duplicateSelected, selectAnnotation, beginMove,
    cancelPointerInteraction,
    stopDrawing: () => { textSizeEditingRef.current = false; pendingReloadRef.current = false; setToolState(null); setSelectedId(null); setDraft(null); moveRef.current = null; },
    clearAnnotations, eraseAnnotation, handlePointerDown, handlePointerMove, handlePointerEnd,
  };
}

function toolLabel(tool: CampaignMapDrawingTool) {
  if (tool === "freehand") return "Pen"; if (tool === "rect") return "Rectangle"; if (tool === "select") return "Select";
  return tool[0].toUpperCase() + tool.slice(1);
}

function CampaignMapTextSizeControl({ controller, selected }: { controller: CampaignMapAnnotationController; selected: boolean }) {
  const [draft, setDraft] = useState(String(controller.textSize));

  const setSize = (size: number) => {
    setDraft(String(size));
    controller.setTextSize(size);
  };
  const preview = (raw: string) => {
    setDraft(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 200) controller.setTextSize(parsed);
  };
  const finish = () => {
    setDraft(String(controller.textSize));
    if (selected) void controller.commitTextSize();
  };

  return <label className="campaign-map-text-size">
    <span>Text size</span>
    <input
      className="campaign-map-text-size-slider"
      type="range"
      min="8"
      max="200"
      step="1"
      value={controller.textSize}
      aria-label={selected ? "Selected text size" : "New text size"}
      onChange={event => setSize(Number(event.target.value))}
      onPointerUp={finish}
      onKeyUp={finish}
    />
    <input
      className="campaign-map-text-size-number"
      type="number"
      min="8"
      max="200"
      step="1"
      value={draft}
      aria-label={selected ? "Selected text size value" : "New text size value"}
      onChange={event => preview(event.target.value)}
      onBlur={finish}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  </label>;
}

export function CampaignMapDrawingPalette({ controller }: { controller: CampaignMapAnnotationController }) {
  if (!controller.tool) return null;
  return <div className="campaign-map-drawing-palette campaign-map-creation-strip" role="toolbar" aria-label="Create annotation">
    <strong className="campaign-map-creation-name">{toolLabel(controller.tool)}</strong>
    {controller.canManage && <label className="campaign-map-creation-field">
      <span className="sr-only">Who can see this annotation?</span>
      <select value={controller.visibility} aria-label="Annotation visibility"
        onChange={event => controller.setVisibility(event.target.value as CampaignMapAnnotationVisibility)}>
        <option value="players">Players</option>
        <option value="gm">GM only</option>
      </select>
    </label>}
    {controller.tool !== "erase" && <label className="campaign-map-drawing-color" title="Annotation colour">
      <span className="sr-only">Colour</span>
      <input type="color" value={controller.color} aria-label="Annotation colour"
        onChange={event => controller.setColor(event.target.value)} />
    </label>}
    {controller.tool === "text" && <>
      <label className="campaign-map-text-entry"><span className="sr-only">Label text</span>
        <input type="text" value={controller.textValue} onChange={event => controller.setTextValue(event.target.value)}
          maxLength={120} placeholder="Label text" aria-label="Label text" autoFocus /></label>
      <details className="campaign-map-creation-details"><summary>Size</summary>
        <CampaignMapTextSizeControl controller={controller} selected={false} />
      </details>
    </>}
    <button type="button" className="campaign-map-creation-done" onClick={controller.stopDrawing}>Done</button>
    {controller.error && <p className="campaign-map-drawing-error" role="alert">{controller.error}</p>}
  </div>;
}

function annotationAriaLabel(annotation: CampaignMapAnnotation, action: "select" | "erase") {
  const visibility = annotation.visibility === "players" ? "player-visible" : "GM-only";
  return `${action === "erase" ? "Erase" : "Select"} ${visibility} ${annotation.kind} annotation`;
}

type AnnotationBounds = { x: number; y: number; width: number; height: number };

function annotationSelectionBounds(geometry: CampaignMapAnnotationGeometry): AnnotationBounds {
  if (geometry.kind === "freehand") {
    const xs = geometry.points.map(point => point.x);
    const ys = geometry.points.map(point => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }
  if (geometry.kind === "line" || geometry.kind === "arrow") {
    return {
      x: Math.min(geometry.x1, geometry.x2),
      y: Math.min(geometry.y1, geometry.y2),
      width: Math.max(1, Math.abs(geometry.x2 - geometry.x1)),
      height: Math.max(1, Math.abs(geometry.y2 - geometry.y1)),
    };
  }
  if (geometry.kind === "rect") return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
  if (geometry.kind === "circle") return { x: geometry.cx - geometry.r, y: geometry.cy - geometry.r, width: geometry.r * 2, height: geometry.r * 2 };
  if (geometry.kind === "text") {
    return {
      x: geometry.x,
      y: geometry.y,
      width: Math.max(geometry.fontSize, geometry.text.length * geometry.fontSize * 0.62),
      height: geometry.fontSize * 1.2,
    };
  }
  return { x: 0, y: 0, width: 1, height: 1 };
}

function AnnotationSelectionIndicator({ geometry }: { geometry: CampaignMapAnnotationGeometry }) {
  const bounds = annotationSelectionBounds(geometry);
  const padding = Math.max(6, geometry.kind === "text" ? geometry.fontSize * 0.14 : 6);
  const x = bounds.x - padding, y = bounds.y - padding;
  const width = bounds.width + padding * 2, height = bounds.height + padding * 2;
  return <g className="campaign-map-annotation-selection-indicator" pointerEvents="none" aria-hidden="true">
    <rect className="campaign-map-annotation-selection-shadow" x={x} y={y} width={width} height={height} rx="4" vectorEffect="non-scaling-stroke" />
    <rect className="campaign-map-annotation-selection-box" x={x} y={y} width={width} height={height} rx="4" vectorEffect="non-scaling-stroke" />
  </g>;
}

function AnnotationShape({ geometry, className, color, markerId }: { geometry: CampaignMapAnnotationGeometry; className: string; color: string; markerId?: string }) {
  if (geometry.kind === "text") return <text className={`${className} campaign-map-annotation-text`} x={geometry.x} y={geometry.y} fontSize={geometry.fontSize} fill={color} dominantBaseline="hanging">{geometry.text}</text>;
  const path = campaignMapAnnotationPath(geometry);
  if (path) return <>{geometry.kind === "arrow" && markerId && <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill={color} /></marker></defs>}<path className={className} d={path} fill="none" stroke={color} markerEnd={geometry.kind === "arrow" && markerId ? `url(#${markerId})` : undefined} vectorEffect="non-scaling-stroke" /></>;
  if (geometry.kind === "rect") return <rect className={className} x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} fill="none" stroke={color} vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "circle") return <circle className={className} cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill="none" stroke={color} vectorEffect="non-scaling-stroke" />;
  return null;
}
function AnnotationHitShape({ geometry }: { geometry: CampaignMapAnnotationGeometry }) {
  if (geometry.kind === "text") return <text className="campaign-map-annotation-hit is-text" x={geometry.x} y={geometry.y} fontSize={geometry.fontSize} dominantBaseline="hanging">{geometry.text}</text>;
  const path = campaignMapAnnotationPath(geometry);
  if (path) return <path className="campaign-map-annotation-hit" d={path} fill="none" vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "rect") return <rect className="campaign-map-annotation-hit is-area" x={geometry.x} y={geometry.y} width={geometry.width} height={geometry.height} vectorEffect="non-scaling-stroke" />;
  if (geometry.kind === "circle") return <circle className="campaign-map-annotation-hit is-area" cx={geometry.cx} cy={geometry.cy} r={geometry.r} vectorEffect="non-scaling-stroke" />;
  return null;
}

export function CampaignMapAnnotationLayer({ controller, interactionEnabled = true, playerPreview = false, onSelect }: {
  controller: CampaignMapAnnotationController;
  interactionEnabled?: boolean;
  playerPreview?: boolean;
  onSelect?: (id: string) => void;
}) {
  const markerBase = useId().replaceAll(":", "");
  // Keep hit targets active so completed strokes and shapes can be selected
  // without leaving the current drawing tool.
  const selecting = !playerPreview && interactionEnabled && controller.tool !== "erase";
  const erasing = !playerPreview && controller.tool === "erase";
  const actionPointer = (event: ReactPointerEvent<SVGGElement>, annotation: CampaignMapAnnotation) => {
    if (!annotation.canEdit) return;
    if (erasing) { event.preventDefault(); event.stopPropagation(); void controller.eraseAnnotation(annotation.id); }
    else if (selecting) { onSelect?.(annotation.id); controller.beginMove(event, annotation.id); }
  };
  const actionKey = (event: ReactKeyboardEvent<SVGGElement>, annotation: CampaignMapAnnotation) => {
    if (!annotation.canEdit || (event.key !== "Enter" && event.key !== " " && event.key !== "Delete" && event.key !== "Backspace")) return;
    if (erasing || event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); void controller.eraseAnnotation(annotation.id); }
    else if (selecting) { event.preventDefault(); onSelect?.(annotation.id); controller.selectAnnotation(annotation.id); }
  };
  return <g className={`campaign-map-annotation-layer${selecting ? " is-selecting" : ""}${erasing ? " is-erasing" : ""}`}>
    {controller.annotations.filter(annotation => !playerPreview || annotation.visibility === "players").map((annotation, index) => {
      const interactive = annotation.canEdit && (selecting || erasing);
      return <g key={annotation.id}
        className={`campaign-map-annotation-group is-${annotation.visibility}${interactive ? " is-editable" : ""}${controller.selectedId === annotation.id ? " is-selected" : ""}`}
        role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? annotationAriaLabel(annotation, erasing ? "erase" : "select") : undefined}
        onPointerDown={e => actionPointer(e, annotation)} onKeyDown={e => actionKey(e, annotation)}>
        <AnnotationShape geometry={annotation.geometry} className="campaign-map-annotation" color={annotation.color} markerId={`${markerBase}-annotation-${index}`} />
        {!playerPreview && controller.selectedId === annotation.id && <AnnotationSelectionIndicator geometry={annotation.geometry} />}
        {interactive && <AnnotationHitShape geometry={annotation.geometry} />}
      </g>;
    })}
    {!playerPreview && controller.draft && <AnnotationShape geometry={controller.draft} className="campaign-map-annotation-preview" color={controller.color} markerId={`${markerBase}-preview`} />}
  </g>;
}
