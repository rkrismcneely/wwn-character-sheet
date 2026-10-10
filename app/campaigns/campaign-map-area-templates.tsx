"use client";

import { MapObjectActionIcon } from "./map-object-action-icon";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  campaignMapAreaTemplateAffectedPath,
  campaignMapAreaTemplateAngleStep,
  campaignMapAreaTemplateDefaultColor,
  campaignMapAreaTemplateDirectionPoint,
  campaignMapAreaTemplateMaxSize,
  campaignMapAreaTemplateMinSize,
  campaignMapAreaTemplateOutlinePath,
  clampCampaignMapAreaTemplateSize,
  normalizeCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateOrigin,
  type CampaignMapAreaTemplate,
  type CampaignMapAreaTemplateShape,
} from "@/lib/campaigns/map-area-template-model";
import type { CampaignMapGrid, CampaignMapGridPosition } from "@/lib/campaigns/map-grid";
import { campaignMapChangedEvent } from "./use-live-session";

export type CampaignMapAreaTemplateMode = "place" | "select";

type AreaTemplateResponse = {
  templates?: CampaignMapAreaTemplate[];
  template?: CampaignMapAreaTemplate;
  ok?: boolean;
  error?: string;
};

type MoveDraft = {
  pointerId: number;
  id: string;
  start: CampaignMapGridPosition;
  x: number;
  y: number;
  latestX: number;
  latestY: number;
};

type RotateDraft = {
  pointerId: number;
  id: string;
  x: number;
  y: number;
  angleDegrees: number;
  initialAngle: number;
};

export type CampaignMapAreaTemplateController = {
  templates: CampaignMapAreaTemplate[];
  open: boolean;
  mode: CampaignMapAreaTemplateMode;
  selectedId: string | null;
  selected: CampaignMapAreaTemplate | null;
  shape: CampaignMapAreaTemplateShape;
  sizeSpaces: number;
  widthSpaces: number;
  tipFlip: boolean;
  angleDegrees: number;
  color: string;
  busy: boolean;
  error: string;
  toggle: () => void;
  close: () => void;
  setMode: (mode: CampaignMapAreaTemplateMode) => void;
  setShape: (shape: CampaignMapAreaTemplateShape) => void;
  setSizeSpaces: (value: number) => void;
  setWidthSpaces: (value: number) => void;
  flipTip: () => void;
  setAngleDegrees: (value: number) => void;
  nudgeAngle: (delta: number) => void;
  setColor: (value: string) => void;
  commitSelected: () => Promise<void>;
  selectTemplate: (id: string | null) => void;
  beginMove: (event: ReactPointerEvent<SVGGElement>, id: string) => void;
  beginRotate: (event: ReactPointerEvent<SVGCircleElement>, id: string) => void;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;
  handlePointerDown: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
  handlePointerEnd: (event: ReactPointerEvent<SVGSVGElement>) => boolean;
};

function pointFromEvent(
  svg: SVGSVGElement,
  event: Pick<PointerEvent, "clientX" | "clientY">,
  width: number,
  height: number,
): CampaignMapGridPosition | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const mapped = point.matrixTransform(matrix.inverse());
  return {
    x: Math.max(0, Math.min(width, Math.round(mapped.x * 100) / 100)),
    y: Math.max(0, Math.min(height, Math.round(mapped.y * 100) / 100)),
  };
}

function shapeLabel(shape: CampaignMapAreaTemplateShape): string {
  if (shape === "radius") return "Radius";
  if (shape === "cube") return "Cube";
  return shape[0].toUpperCase() + shape.slice(1);
}

export function useCampaignMapAreaTemplates({
  campaignId,
  mapId,
  width,
  height,
  grid,
  openMap,
  onChanged,
  onEdited,
}: {
  campaignId: string;
  mapId: string | null;
  width: number | null;
  height: number | null;
  grid: CampaignMapGrid | null;
  openMap: boolean;
  onChanged?: () => void;
  onEdited?: (before: CampaignMapAreaTemplate | null, after: CampaignMapAreaTemplate | null) => void;
}): CampaignMapAreaTemplateController {
  const [templates, setTemplates] = useState<CampaignMapAreaTemplate[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<CampaignMapAreaTemplateMode>("place");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shape, setShapeState] = useState<CampaignMapAreaTemplateShape>("radius");
  const [sizeSpaces, setSizeSpacesState] = useState(4);
  const [widthSpaces, setWidthSpacesState] = useState(1);
  const [tipFlip, setTipFlipState] = useState(false);
  const [angleDegrees, setAngleDegreesState] = useState(0);
  const [color, setColorState] = useState(campaignMapAreaTemplateDefaultColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const editingRef = useRef(false);
  const editingBeforeRef = useRef<CampaignMapAreaTemplate | null>(null);
  const pendingReloadRef = useRef(false);
  const moveRef = useRef<MoveDraft | null>(null);
  const rotateRef = useRef<RotateDraft | null>(null);
  const selected = templates.find(template => template.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    if (!openMap || !mapId || !width || !height) return;
    if (editingRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    const seq = ++loadSequence.current;
    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/map/templates?${new URLSearchParams({ mapId })}`,
        { cache: "no-store" },
      );
      const body = await response.json() as AreaTemplateResponse;
      if (!response.ok || !body.templates) throw new Error(body.error || "Area templates could not be loaded.");
      if (seq === loadSequence.current) {
        setTemplates(body.templates);
        setSelectedId(current => current && body.templates?.some(template => template.id === current && template.canEdit) ? current : null);
        setError("");
      }
    } catch (loadError) {
      if (seq === loadSequence.current) {
        setError(loadError instanceof Error ? loadError.message : "Area templates could not be loaded.");
      }
    }
  }, [campaignId, height, mapId, openMap, width]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    if (!openMap) return;
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ campaignId?: string }>).detail?.campaignId === campaignId) void reload();
    };
    window.addEventListener(campaignMapChangedEvent, refresh);
    return () => window.removeEventListener(campaignMapChangedEvent, refresh);
  }, [campaignId, openMap, reload]);

  useEffect(() => {
    if (!openMap || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`twe:campaign-map:${campaignId}`);
    channel.onmessage = event => {
      const message = event.data as { type?: unknown; campaignId?: unknown } | null;
      if (message?.type === "map-changed" && message.campaignId === campaignId) void reload();
    };
    return () => channel.close();
  }, [campaignId, openMap, reload]);

  const publishLocal = useCallback(() => {
    window.dispatchEvent(new CustomEvent(campaignMapChangedEvent, { detail: { campaignId } }));
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(`twe:campaign-map:${campaignId}`);
      channel.postMessage({ type: "map-changed", campaignId });
      channel.close();
    }
    onChanged?.();
  }, [campaignId, onChanged]);

  const saveTemplate = useCallback(async (template: CampaignMapAreaTemplate, previous = template) => {
    if (!mapId || !template.canEdit) return;
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          mapId,
          templateId: template.id,
          shape: template.shape,
          x: template.x,
          y: template.y,
          sizeSpaces: template.sizeSpaces,
          widthSpaces: template.widthSpaces,
          tipFlip: template.tipFlip,
          angleDegrees: template.angleDegrees,
          color: template.color,
        }),
      });
      const body = await response.json() as AreaTemplateResponse;
      if (!response.ok || !body.template) throw new Error(body.error || "Area template could not be updated.");
      setTemplates(current => current.map(candidate => candidate.id === template.id ? body.template as CampaignMapAreaTemplate : candidate));
      if (JSON.stringify({ ...previous, updatedAt: null }) !== JSON.stringify({ ...body.template, updatedAt: null })) onEdited?.(previous, body.template);
      publishLocal();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Area template could not be updated.");
      void reload();
    }
  }, [campaignId, mapId, onEdited, publishLocal, reload]);

  const flushDeferredReload = useCallback(async () => {
    if (!pendingReloadRef.current) return;
    pendingReloadRef.current = false;
    await reload();
  }, [reload]);

  const setSelectedLocal = useCallback((changes: Partial<CampaignMapAreaTemplate>) => {
    if (!selectedId) return;
    if (!editingBeforeRef.current) editingBeforeRef.current = templates.find(item => item.id === selectedId) ?? null;
    editingRef.current = true;
    setTemplates(current => current.map(template => template.id === selectedId ? { ...template, ...changes } : template));
  }, [selectedId, templates]);

  const selectTemplate = useCallback((id: string | null) => {
    editingRef.current = false;
    editingBeforeRef.current = null;
    pendingReloadRef.current = false;
    if (!id) {
      setSelectedId(null);
      return;
    }
    const template = templates.find(candidate => candidate.id === id);
    if (!template?.canEdit) return;
    setSelectedId(id);
    setShapeState(template.shape);
    setSizeSpacesState(template.sizeSpaces);
    setWidthSpacesState(template.widthSpaces);
    setTipFlipState(template.tipFlip);
    setAngleDegreesState(template.angleDegrees);
    setColorState(template.color);
    setModeState("select");
  }, [templates]);

  const commitSelected = useCallback(async () => {
    if (!selectedId) return;
    const template = templates.find(candidate => candidate.id === selectedId);
    editingRef.current = false;
    if (template?.canEdit) await saveTemplate(template, editingBeforeRef.current ?? template);
    editingBeforeRef.current = null;
    await flushDeferredReload();
  }, [flushDeferredReload, saveTemplate, selectedId, templates]);

  const setSizeSpaces = useCallback((value: number) => {
    const next = clampCampaignMapAreaTemplateSize(value);
    setSizeSpacesState(next);
    if (selected?.canEdit) setSelectedLocal({ sizeSpaces: next });
  }, [selected, setSelectedLocal]);

  const setWidthSpaces = useCallback((value: number) => {
    const next = clampCampaignMapAreaTemplateSize(value);
    setWidthSpacesState(next);
    if (selected?.canEdit) setSelectedLocal({ widthSpaces: next });
  }, [selected, setSelectedLocal]);

  const flipTip = useCallback(() => {
    const next = !tipFlip;
    setTipFlipState(next);
    if (!selected?.canEdit) return;
    const updated = { ...selected, tipFlip: next };
    setTemplates(current => current.map(template => template.id === selected.id ? updated : template));
    void saveTemplate(updated, selected);
  }, [saveTemplate, selected, tipFlip]);

  const setAngleDegrees = useCallback((value: number) => {
    const next = grid ? snapCampaignMapAreaTemplateAngle(value, grid) : normalizeCampaignMapAreaTemplateAngle(value);
    setAngleDegreesState(next);
    if (selected?.canEdit) setSelectedLocal({ angleDegrees: next });
  }, [grid, selected, setSelectedLocal]);

  const nudgeAngle = useCallback((delta: number) => {
    const next = grid
      ? snapCampaignMapAreaTemplateAngle(angleDegrees + delta, grid)
      : normalizeCampaignMapAreaTemplateAngle(angleDegrees + delta);
    setAngleDegreesState(next);
    if (!selected?.canEdit) return;
    const updated = { ...selected, angleDegrees: next };
    setTemplates(current => current.map(template => template.id === selected.id ? updated : template));
    void saveTemplate(updated, selected);
  }, [angleDegrees, grid, saveTemplate, selected]);

  const setColor = useCallback((value: string) => {
    setColorState(value);
    if (!selected?.canEdit) return;
    const next = { ...selected, color: value };
    setTemplates(current => current.map(template => template.id === selected.id ? next : template));
    void saveTemplate(next, selected);
  }, [saveTemplate, selected]);

  const createAt = useCallback(async (point: CampaignMapGridPosition) => {
    if (!mapId || !grid || !width || !height || busy) return;
    const snappedPoint = snapCampaignMapAreaTemplateOrigin(point, grid, shape, sizeSpaces, width, height);
    const snappedAngle = snapCampaignMapAreaTemplateAngle(angleDegrees, grid);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          mapId,
          shape,
          x: snappedPoint.x,
          y: snappedPoint.y,
          sizeSpaces,
          widthSpaces,
          tipFlip,
          angleDegrees: snappedAngle,
          color,
        }),
      });
      const body = await response.json() as AreaTemplateResponse;
      if (!response.ok || !body.template) throw new Error(body.error || "Area template could not be created.");
      setTemplates(current => [...current.filter(template => template.id !== body.template?.id), body.template as CampaignMapAreaTemplate]);
      onEdited?.(null, body.template);
      setSelectedId(body.template.id);
      setModeState("select");
      setOpen(false);
      publishLocal();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Area template could not be created.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [angleDegrees, busy, campaignId, color, grid, height, mapId, onEdited, publishLocal, reload, shape, sizeSpaces, tipFlip, width, widthSpaces]);

  const duplicateSelected = useCallback(async () => {
    if (!selected?.canEdit || !mapId || !grid || !width || !height || busy) return;
    const position = snapCampaignMapAreaTemplateOrigin(
      { x: Math.min(width, selected.x + grid.size), y: Math.min(height, selected.y + grid.size) },
      grid, selected.shape, selected.sizeSpaces, width, height,
    );
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create", mapId, shape: selected.shape,
          x: position.x, y: position.y, sizeSpaces: selected.sizeSpaces,
          widthSpaces: selected.widthSpaces, tipFlip: selected.tipFlip,
          angleDegrees: selected.angleDegrees, color: selected.color,
        }),
      });
      const body = await response.json() as AreaTemplateResponse;
      if (!response.ok || !body.template) throw new Error(body.error || "Area template could not be duplicated.");
      setTemplates(current => [...current, body.template as CampaignMapAreaTemplate]);
      onEdited?.(null, body.template);
      setSelectedId(body.template.id);
      publishLocal();
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Area template could not be duplicated.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [busy, campaignId, grid, height, mapId, onEdited, publishLocal, reload, selected, width]);

  const deleteSelected = useCallback(async () => {
    const template = templates.find(candidate => candidate.id === selectedId);
    if (!template?.canEdit || !mapId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/templates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", mapId, templateId: template.id }),
      });
      const body = await response.json() as AreaTemplateResponse;
      if (!response.ok || !body.ok) throw new Error(body.error || "Area template could not be removed.");
      setTemplates(current => current.filter(candidate => candidate.id !== template.id));
      onEdited?.(template, null);
      setSelectedId(null);
      setModeState("place");
      publishLocal();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Area template could not be removed.");
      void reload();
    } finally {
      setBusy(false);
    }
  }, [busy, campaignId, mapId, onEdited, publishLocal, reload, selectedId, templates]);

  const beginMove = useCallback((event: ReactPointerEvent<SVGGElement>, id: string) => {
    if ((open && mode !== "select") || !width || !height) return;
    const template = templates.find(candidate => candidate.id === id);
    const svg = event.currentTarget.ownerSVGElement;
    if (!template?.canEdit || !svg) return;
    const point = pointFromEvent(svg, event.nativeEvent, width, height);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    selectTemplate(id);
    editingRef.current = true;
    moveRef.current = {
      pointerId: event.pointerId,
      id,
      start: point,
      x: template.x,
      y: template.y,
      latestX: template.x,
      latestY: template.y,
    };
    svg.setPointerCapture(event.pointerId);
  }, [height, mode, open, selectTemplate, templates, width]);

  const beginRotate = useCallback((event: ReactPointerEvent<SVGCircleElement>, id: string) => {
    if ((open && mode !== "select") || !width || !height) return;
    const template = templates.find(candidate => candidate.id === id);
    const svg = event.currentTarget.ownerSVGElement;
    if (!template?.canEdit || !svg) return;
    event.preventDefault();
    event.stopPropagation();
    selectTemplate(id);
    editingRef.current = true;
    rotateRef.current = {
      pointerId: event.pointerId,
      id,
      x: template.x,
      y: template.y,
      angleDegrees: template.angleDegrees,
      initialAngle: template.angleDegrees,
    };
    svg.setPointerCapture(event.pointerId);
  }, [height, mode, open, selectTemplate, templates, width]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    if (!open || mode !== "place" || !width || !height || busy || event.button !== 0) return false;
    const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
    if (!point) return true;
    event.preventDefault();
    void createAt(point);
    return true;
  }, [busy, createAt, height, mode, open, width]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    if (!width || !height) return false;
    const move = moveRef.current;
    if (move?.pointerId === event.pointerId) {
      const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
      if (!point) return true;
      const template = templates.find(candidate => candidate.id === move.id);
      if (!template || !grid) return true;
      const snapped = snapCampaignMapAreaTemplateOrigin(
        { x: move.x + point.x - move.start.x, y: move.y + point.y - move.start.y },
        grid,
        template.shape,
        template.sizeSpaces,
        width,
        height,
      );
      move.latestX = snapped.x;
      move.latestY = snapped.y;
      setTemplates(current => current.map(candidate => candidate.id === move.id ? { ...candidate, x: snapped.x, y: snapped.y } : candidate));
      event.preventDefault();
      return true;
    }
    const rotate = rotateRef.current;
    if (rotate?.pointerId === event.pointerId) {
      const point = pointFromEvent(event.currentTarget, event.nativeEvent, width, height);
      if (!point) return true;
      const rawAngle = Math.atan2(point.y - rotate.y, point.x - rotate.x) * 180 / Math.PI;
      const angle = grid ? snapCampaignMapAreaTemplateAngle(rawAngle, grid) : normalizeCampaignMapAreaTemplateAngle(rawAngle);
      rotate.angleDegrees = angle;
      setAngleDegreesState(angle);
      setTemplates(current => current.map(template => template.id === rotate.id ? { ...template, angleDegrees: angle } : template));
      event.preventDefault();
      return true;
    }
    return false;
  }, [grid, height, templates, width]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const move = moveRef.current;
    if (move?.pointerId === event.pointerId) {
      moveRef.current = null;
      const template = templates.find(candidate => candidate.id === move.id);
      editingRef.current = false;
      if (template?.canEdit) {
        const updated = { ...template, x: move.latestX, y: move.latestY };
        setTemplates(current => current.map(candidate => candidate.id === move.id ? updated : candidate));
        void saveTemplate(updated, { ...template, x: move.x, y: move.y }).then(flushDeferredReload);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.preventDefault();
      return true;
    }
    const rotate = rotateRef.current;
    if (rotate?.pointerId === event.pointerId) {
      rotateRef.current = null;
      const template = templates.find(candidate => candidate.id === rotate.id);
      editingRef.current = false;
      if (template?.canEdit) {
        const updated = { ...template, angleDegrees: rotate.angleDegrees };
        setTemplates(current => current.map(candidate => candidate.id === rotate.id ? updated : candidate));
        setAngleDegreesState(rotate.angleDegrees);
        void saveTemplate(updated, { ...template, angleDegrees: rotate.initialAngle }).then(flushDeferredReload);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.preventDefault();
      return true;
    }
    return false;
  }, [flushDeferredReload, saveTemplate, templates]);

  const close = useCallback(() => {
    editingRef.current = false;
    pendingReloadRef.current = false;
    moveRef.current = null;
    rotateRef.current = null;
    setOpen(false);
    setSelectedId(null);
  }, []);

  return {
    templates,
    open,
    mode,
    selectedId,
    selected,
    shape,
    sizeSpaces,
    widthSpaces,
    tipFlip,
    angleDegrees,
    color,
    busy,
    error,
    toggle: () => {
      setOpen(current => {
        const next = !current;
        if (next) setModeState("place");
        else setSelectedId(null);
        return next;
      });
    },
    close,
    setMode: next => {
      setModeState(next);
      if (next === "place") setSelectedId(null);
    },
    setShape: next => {
      setShapeState(next);
      if (selected?.canEdit) {
        const updated = { ...selected, shape: next };
        setTemplates(current => current.map(item => item.id === selected.id ? updated : item));
        void saveTemplate(updated);
      }
    },
    setSizeSpaces,
    setWidthSpaces,
    flipTip,
    setAngleDegrees,
    nudgeAngle,
    setColor,
    commitSelected,
    selectTemplate,
    beginMove,
    beginRotate,
    deleteSelected,
    duplicateSelected,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
  };
}

function mapAreaDistanceUnit(grid: CampaignMapGrid) {
  return grid.type === "square" ? { perSpace: 5, name: "feet" } : { perSpace: 10, name: "km" };
}
function mapAreaDistanceLabel(spaces: number, grid: CampaignMapGrid) {
  const unit = mapAreaDistanceUnit(grid);
  return `${spaces * unit.perSpace} ${unit.name}`;
}

function AreaTemplateSizeControl({
  controller,
  grid,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  const finish = () => { if (controller.selected) void controller.commitSelected(); };
  return <div className="campaign-map-area-size">
    <label>
      <span>Size</span>
      <input
        type="range"
        min={campaignMapAreaTemplateMinSize}
        max={campaignMapAreaTemplateMaxSize}
        step="1"
        value={controller.sizeSpaces}
        onChange={event => controller.setSizeSpaces(Number(event.target.value))}
        onPointerUp={finish}
        onKeyUp={finish}
      />
    </label>
    <label>
      <span>Distance</span>
      <input
        type="number"
        min={campaignMapAreaTemplateMinSize * mapAreaDistanceUnit(grid).perSpace}
        max={campaignMapAreaTemplateMaxSize * mapAreaDistanceUnit(grid).perSpace}
        step={mapAreaDistanceUnit(grid).perSpace}
        value={controller.sizeSpaces * mapAreaDistanceUnit(grid).perSpace}
        aria-label="Area size in distance units"
        onChange={event => controller.setSizeSpaces(Math.round(Number(event.target.value) / mapAreaDistanceUnit(grid).perSpace))}
        onBlur={finish}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </label>
    <small>{mapAreaDistanceLabel(controller.sizeSpaces, grid)}</small>
  </div>;
}

function AreaTemplateWidthControl({
  controller,
  grid,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  if (controller.shape !== "line") return null;
  const finish = () => { if (controller.selected) void controller.commitSelected(); };
  return <div className="campaign-map-area-size campaign-map-area-width">
    <label>
      <span>Line width</span>
      <input
        type="range"
        min={campaignMapAreaTemplateMinSize}
        max={campaignMapAreaTemplateMaxSize}
        step="1"
        value={controller.widthSpaces}
        onChange={event => controller.setWidthSpaces(Number(event.target.value))}
        onPointerUp={finish}
        onKeyUp={finish}
      />
    </label>
    <label>
      <span>Distance</span>
      <input
        type="number"
        min={campaignMapAreaTemplateMinSize * mapAreaDistanceUnit(grid).perSpace}
        max={campaignMapAreaTemplateMaxSize * mapAreaDistanceUnit(grid).perSpace}
        step={mapAreaDistanceUnit(grid).perSpace}
        value={controller.widthSpaces * mapAreaDistanceUnit(grid).perSpace}
        aria-label="Line width in distance units"
        onChange={event => controller.setWidthSpaces(Math.round(Number(event.target.value) / mapAreaDistanceUnit(grid).perSpace))}
        onBlur={finish}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </label>
    <small>{mapAreaDistanceLabel(controller.widthSpaces, grid)}</small>
  </div>;
}

function AreaTemplateConeTipControl({
  controller,
  grid,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  if (grid.type !== "square" || controller.shape !== "cone") return null;
  const normalized = normalizeCampaignMapAreaTemplateAngle(controller.angleDegrees);
  const cardinal = Math.abs(normalized % 90) < 0.0001;
  return <div className="campaign-map-area-tip-flip">
    <button
      type="button"
      disabled={!cardinal || controller.busy}
      onClick={controller.flipTip}
      title={cardinal ? "Swap which near-origin square completes the cardinal cone tip." : "Flip Tip applies only at 0°, 90°, 180°, and 270°."}
    >
      Flip Tip
    </button>
    <small>{cardinal ? `Tip side: ${controller.tipFlip ? "B" : "A"}` : "Tip flipping applies only at cardinal angles."}</small>
  </div>;
}

function AreaTemplateAngleControl({
  controller,
  grid,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  if (controller.shape === "radius") return null;
  const finish = () => { if (controller.selected) void controller.commitSelected(); };
  const step = campaignMapAreaTemplateAngleStep(grid);
  return <div className="campaign-map-area-angle">
    <span>Angle</span>
    <button type="button" onClick={() => controller.nudgeAngle(-step)}>−{step}°</button>
    <input
      type="range"
      min="0"
      max={360 - step}
      step={step}
      value={controller.angleDegrees}
      aria-label="Area template angle"
      onChange={event => controller.setAngleDegrees(Number(event.target.value))}
      onPointerUp={finish}
      onKeyUp={finish}
    />
    <input
      type="number"
      min="0"
      max={360 - step}
      step={step}
      value={Math.round(controller.angleDegrees)}
      aria-label="Area template angle value"
      onChange={event => controller.setAngleDegrees(Number(event.target.value))}
      onBlur={finish}
      onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
    <button type="button" onClick={() => controller.nudgeAngle(step)}>+{step}°</button>
  </div>;
}

export function CampaignMapAreaTemplatePalette({
  controller,
  grid,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  if (!controller.open) return null;
  return <div className="campaign-map-area-palette campaign-map-creation-strip" role="toolbar" aria-label="Create spell area">
    <label className="campaign-map-creation-field">
      <span className="sr-only">Spell area shape</span>
      <select aria-label="Spell area shape" value={controller.shape}
        onChange={event => controller.setShape(event.target.value as CampaignMapAreaTemplateShape)}>
        <option value="radius">Radius</option>
        <option value="cube">Cube</option>
        <option value="cone">Cone</option>
        <option value="line">Line</option>
      </select>
    </label>
    <label className="campaign-map-creation-field campaign-map-creation-size">
      <span>Size</span>
      <input type="number" aria-label="Spell area distance"
        min={campaignMapAreaTemplateMinSize * mapAreaDistanceUnit(grid).perSpace}
        max={campaignMapAreaTemplateMaxSize * mapAreaDistanceUnit(grid).perSpace}
        step={mapAreaDistanceUnit(grid).perSpace}
        value={controller.sizeSpaces * mapAreaDistanceUnit(grid).perSpace}
        onChange={event => controller.setSizeSpaces(Math.round(Number(event.target.value) / mapAreaDistanceUnit(grid).perSpace))} />
      <span>{mapAreaDistanceUnit(grid).name}</span>
    </label>
    <label className="campaign-map-area-color" title="Spell area colour">
      <span className="sr-only">Colour</span>
      <input type="color" value={controller.color} aria-label="Spell area colour"
        onChange={event => controller.setColor(event.target.value)} />
    </label>
    {controller.shape !== "radius" && <details className="campaign-map-creation-details">
      <summary>More</summary>
      <div className="campaign-map-creation-extra">
        <AreaTemplateSizeControl controller={controller} grid={grid} />
        <AreaTemplateWidthControl controller={controller} grid={grid} />
        <AreaTemplateAngleControl controller={controller} grid={grid} />
        <AreaTemplateConeTipControl controller={controller} grid={grid} />
      </div>
    </details>}
    <button type="button" className="campaign-map-creation-done" onClick={controller.close}>Done</button>
    {controller.error && <p className="campaign-map-area-error" role="alert">{controller.error}</p>}
  </div>;
}

export function CampaignMapAreaTemplateInspector({ controller, grid }: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
}) {
  if (!controller.selected?.canEdit) return null;
  const step = campaignMapAreaTemplateAngleStep(grid);
  const cardinalCone = grid.type === "square" && controller.shape === "cone" &&
    Math.abs(normalizeCampaignMapAreaTemplateAngle(controller.angleDegrees) % 90) < 0.0001;

  return <div className="campaign-map-context-actions" aria-label="Selected spell area settings">
    <label className="campaign-map-context-select">
      <span className="sr-only">Area shape</span>
      <select aria-label="Area shape" value={controller.shape} disabled={controller.busy}
        onChange={event => controller.setShape(event.target.value as CampaignMapAreaTemplateShape)}>
        <option value="radius">◯ Radius</option>
        <option value="cube">□ Cube</option>
        <option value="cone">◁ Cone</option>
        <option value="line">▱ Line</option>
      </select>
    </label>
    <label className="campaign-map-context-size">
      <span className="sr-only">Area distance</span>
      <input type="number" aria-label="Area distance"
        min={campaignMapAreaTemplateMinSize * mapAreaDistanceUnit(grid).perSpace}
        max={campaignMapAreaTemplateMaxSize * mapAreaDistanceUnit(grid).perSpace}
        step={mapAreaDistanceUnit(grid).perSpace}
        value={controller.sizeSpaces * mapAreaDistanceUnit(grid).perSpace} disabled={controller.busy}
        onChange={event => controller.setSizeSpaces(Math.round(Number(event.target.value) / mapAreaDistanceUnit(grid).perSpace))}
        onBlur={() => void controller.commitSelected()}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      <span>{mapAreaDistanceUnit(grid).name}</span>
    </label>
    {controller.shape === "line" && <label className="campaign-map-context-size">
      <span>Width</span>
      <input type="number" aria-label="Line width" min={mapAreaDistanceUnit(grid).perSpace}
        max={campaignMapAreaTemplateMaxSize * mapAreaDistanceUnit(grid).perSpace}
        step={mapAreaDistanceUnit(grid).perSpace}
        value={controller.widthSpaces * mapAreaDistanceUnit(grid).perSpace} disabled={controller.busy}
        onChange={event => controller.setWidthSpaces(Math.round(Number(event.target.value) / mapAreaDistanceUnit(grid).perSpace))}
        onBlur={() => void controller.commitSelected()}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      <span>{mapAreaDistanceUnit(grid).name}</span>
    </label>}
    {controller.shape !== "radius" && <>
      <span className="campaign-map-context-separator" aria-hidden="true" />
      <button type="button" title={`Rotate ${step}° left`} aria-label={`Rotate ${step} degrees left`}
        disabled={controller.busy} onClick={() => controller.nudgeAngle(-step)}>↶</button>
      <button type="button" title={`Rotate ${step}° right`} aria-label={`Rotate ${step} degrees right`}
        disabled={controller.busy} onClick={() => controller.nudgeAngle(step)}>↷</button>
    </>}
    {cardinalCone && <button type="button" className="campaign-map-context-tip"
      title="Flip which near-origin square completes the cone tip"
      disabled={controller.busy} onClick={controller.flipTip}>↕ Flip Tip</button>}
    <span className="campaign-map-context-separator" aria-hidden="true" />
    <label className="campaign-map-context-swatch campaign-map-quick-tooltip" data-tooltip="Colour">
      <span className="sr-only">Area colour</span>
      <input type="color" aria-label="Area colour" value={controller.color}
        disabled={controller.busy} onChange={event => controller.setColor(event.target.value)} />
    </label>
    <button type="button" className="campaign-map-quick-tooltip" data-tooltip="Duplicate" aria-label="Duplicate area"
      disabled={controller.busy} onClick={() => void controller.duplicateSelected()}><MapObjectActionIcon kind="duplicate" /></button>
    <button type="button" className="campaign-map-context-danger campaign-map-quick-tooltip" data-tooltip="Delete" aria-label="Delete area"
      disabled={controller.busy} onClick={() => void controller.deleteSelected()}><MapObjectActionIcon kind="delete" /></button>
    {controller.error && <span role="alert" className="campaign-map-context-error">{controller.error}</span>}
  </div>;
}

export function CampaignMapAreaTemplateLayer({
  controller,
  grid,
  width,
  height,
  interactionEnabled = true,
  onSelect,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
  width: number;
  height: number;
  interactionEnabled?: boolean;
  onSelect?: (id: string) => void;
}) {
  const selecting = interactionEnabled && (!controller.open || controller.mode === "select");
  return <g className={`campaign-map-area-layer${controller.open ? " is-open" : ""}${selecting ? " is-selecting" : ""}`}>
    {controller.templates.map(template => {
      const affected = campaignMapAreaTemplateAffectedPath(template, grid, width, height);
      const outline = campaignMapAreaTemplateOutlinePath(template, grid);
      const selected = controller.selectedId === template.id;
      const interactive = selecting && template.canEdit;
      const direction = campaignMapAreaTemplateDirectionPoint(template, grid);
      return <g
        key={template.id}
        className={`campaign-map-area-template${selected ? " is-selected" : ""}${interactive ? " is-editable" : ""}`}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `Select ${shapeLabel(template.shape)} area template` : undefined}
        onPointerDown={event => { if (interactive) { onSelect?.(template.id); controller.beginMove(event, template.id); } }}
        onKeyDown={event => {
          if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          onSelect?.(template.id);
          controller.selectTemplate(template.id);
        }}
      >
        <path className="campaign-map-area-affected" d={affected} fill={template.color} />
        <path className="campaign-map-area-outline-fill" d={outline} fill={template.color} />
        <path className="campaign-map-area-outline" d={outline} stroke={template.color} vectorEffect="non-scaling-stroke" />
        {selected && <>
          <circle className="campaign-map-area-origin" cx={template.x} cy={template.y} r="7" vectorEffect="non-scaling-stroke" />
          {template.shape !== "radius" && <>
            <line className="campaign-map-area-direction" x1={template.x} y1={template.y} x2={direction.x} y2={direction.y} vectorEffect="non-scaling-stroke" />
            <circle
              className="campaign-map-area-rotate-handle"
              cx={direction.x}
              cy={direction.y}
              r="10"
              vectorEffect="non-scaling-stroke"
              role="slider"
              aria-label="Rotate area template"
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={Math.round(template.angleDegrees)}
              onPointerDown={event => { onSelect?.(template.id); controller.beginRotate(event, template.id); }}
            />
          </>}
        </>}
        {interactive && <path className="campaign-map-area-hit" d={outline} />}
      </g>;
    })}
  </g>;
}
