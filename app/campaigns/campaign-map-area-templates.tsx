"use client";

import { MapObjectActionIcon } from "./map-object-action-icon";
import { CampaignMapMagicPattern } from "./campaign-map-magic-pattern";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
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
  campaignMapAreaTemplateMotionEffects,
  campaignMapAreaTemplateMotionDefaultColors,
  clampCampaignMapAreaTemplateSize,
  parseCampaignMapAreaDistanceDraft,
  normalizeCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateAngle,
  snapCampaignMapAreaTemplateOrigin,
  type CampaignMapAreaTemplate,
  type CampaignMapAreaTemplateShape,
  type CampaignMapAreaTemplateMotionEffect,
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
  motionEffect: CampaignMapAreaTemplateMotionEffect;
  busy: boolean;
  error: string;
  toggle: () => void;
  close: () => void;
  setMode: (mode: CampaignMapAreaTemplateMode) => void;
  setShape: (shape: CampaignMapAreaTemplateShape) => void;
  setSizeSpaces: (value: number) => void;
  commitSizeSpaces: (value: number) => void;
  setWidthSpaces: (value: number) => void;
  commitWidthSpaces: (value: number) => void;
  flipTip: () => void;
  setAngleDegrees: (value: number) => void;
  nudgeAngle: (delta: number) => void;
  setColor: (value: string) => void;
  setMotionEffect: (effect: CampaignMapAreaTemplateMotionEffect) => void;
  commitSelected: () => Promise<void>;
  selectTemplate: (id: string | null) => void;
  beginMove: (event: ReactPointerEvent<SVGGElement>, id: string) => void;
  beginRotate: (event: ReactPointerEvent<SVGCircleElement>, id: string) => void;
  deleteSelected: () => Promise<void>;
  duplicateSelected: () => Promise<void>;
  cancelPointerInteraction: () => void;
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

const motionEffectLabels: Record<CampaignMapAreaTemplateMotionEffect, string> = {
  none: "None", fire: "Fire", acid: "Acid", sound: "Sound", poison: "Poison",
  ice: "Ice", lightning: "Lightning", darkness: "Darkness",
};

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
  const [motionEffect, setMotionEffectState] = useState<CampaignMapAreaTemplateMotionEffect>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const editingRef = useRef(false);
  const editingBeforeRef = useRef<CampaignMapAreaTemplate | null>(null);
  const pendingReloadRef = useRef(false);
  const moveRef = useRef<MoveDraft | null>(null);
  const rotateRef = useRef<RotateDraft | null>(null);
  const pendingTouchPlaceRef = useRef<{ pointerId: number; clientX: number; clientY: number; point: CampaignMapGridPosition } | null>(null);
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
          motionEffect: template.motionEffect,
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
    setMotionEffectState(template.motionEffect);
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

  // Commit a complete distance in one update. The old blur handler could read
  // a stale selected template before React committed the last typed digit.
  const commitSizeSpaces = useCallback((value: number) => {
    const next = clampCampaignMapAreaTemplateSize(value);
    setSizeSpacesState(next);
    if (!selected?.canEdit) return;
    const before = editingBeforeRef.current ?? selected;
    editingBeforeRef.current = null;
    editingRef.current = false;
    const updated = { ...selected, sizeSpaces: next };
    setTemplates(current => current.map(item => item.id === selected.id ? updated : item));
    void saveTemplate(updated, before).then(flushDeferredReload);
  }, [flushDeferredReload, saveTemplate, selected]);

  const commitWidthSpaces = useCallback((value: number) => {
    const next = clampCampaignMapAreaTemplateSize(value);
    setWidthSpacesState(next);
    if (!selected?.canEdit) return;
    const before = editingBeforeRef.current ?? selected;
    editingBeforeRef.current = null;
    editingRef.current = false;
    const updated = { ...selected, widthSpaces: next };
    setTemplates(current => current.map(item => item.id === selected.id ? updated : item));
    void saveTemplate(updated, before).then(flushDeferredReload);
  }, [flushDeferredReload, saveTemplate, selected]);

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

  const setMotionEffect = useCallback((value: CampaignMapAreaTemplateMotionEffect) => {
    setMotionEffectState(value);
    // Choosing an effect supplies a starting color; the color picker can then
    // override it freely. Turning effects off preserves the current color.
    const defaultColor = value === "none" ? null : campaignMapAreaTemplateMotionDefaultColors[value];
    if (defaultColor) setColorState(defaultColor);
    if (!selected?.canEdit) return;
    const updated = { ...selected, motionEffect: value, color: defaultColor ?? selected.color };
    setTemplates(current => current.map(template => template.id === selected.id ? updated : template));
    // Send both changes in a single update so neither field overwrites the other.
    void saveTemplate(updated, selected);
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
          motionEffect,
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
  }, [angleDegrees, busy, campaignId, color, grid, height, mapId, motionEffect, onEdited, publishLocal, reload, shape, sizeSpaces, tipFlip, width, widthSpaces]);

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
          motionEffect: selected.motionEffect,
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
    if (event.pointerType === "touch") {
      // Complete touch placement on release so a two-finger pinch cannot
      // create an unintended area from its first contact.
      pendingTouchPlaceRef.current = {
        pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, point,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      void createAt(point);
    }
    return true;
  }, [busy, createAt, height, mode, open, width]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>): boolean => {
    const pendingPlace = pendingTouchPlaceRef.current;
    if (pendingPlace?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pendingPlace.clientX, event.clientY - pendingPlace.clientY) > 10)
        pendingTouchPlaceRef.current = null;
      return true;
    }
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
    const pendingPlace = pendingTouchPlaceRef.current;
    if (pendingPlace?.pointerId === event.pointerId) {
      pendingTouchPlaceRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      if (event.type === "pointerup") void createAt(pendingPlace.point);
      event.preventDefault();
      return true;
    }
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
  }, [createAt, flushDeferredReload, saveTemplate, templates]);

  // Abort in-progress one-finger editing when a second finger begins pinching.
  const cancelPointerInteraction = () => {
    pendingTouchPlaceRef.current = null;
    const move = moveRef.current;
    const rotate = rotateRef.current;
    moveRef.current = null;
    rotateRef.current = null;
    editingRef.current = false;
    if (move) setTemplates(current => current.map(template =>
      template.id === move.id ? { ...template, x: move.x, y: move.y } : template));
    if (rotate) {
      setTemplates(current => current.map(template =>
        template.id === rotate.id ? { ...template, angleDegrees: rotate.initialAngle } : template));
      setAngleDegreesState(rotate.initialAngle);
    }
  };

  const close = useCallback(() => {
    pendingTouchPlaceRef.current = null;
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
    motionEffect,
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
    cancelPointerInteraction,
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
    commitSizeSpaces,
    setWidthSpaces,
    commitWidthSpaces,
    flipTip,
    setAngleDegrees,
    nudgeAngle,
    setColor,
    setMotionEffect,
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

/**
 * Maintain the user's literal digits until blur/Enter. In particular, typing
 * "20" must not be converted from "2" back to the minimum 5 feet mid-entry.
 * Explicit steppers are available on iOS, which hides native number spinners.
 */
function AreaTemplateDistanceInput({
  label, spaces, grid, onCommit, disabled = false,
}: {
  label: string;
  spaces: number;
  grid: CampaignMapGrid;
  onCommit: (spaces: number) => void;
  disabled?: boolean;
}) {
  const unit = mapAreaDistanceUnit(grid);
  const [draft, setDraft] = useState(String(spaces * unit.perSpace));
  const editingRef = useRef(false);
  const cancelBlurRef = useRef(false);
  useEffect(() => {
    if (!editingRef.current) setDraft(String(spaces * unit.perSpace));
  }, [spaces, unit.perSpace]);

  const apply = (nextSpaces: number) => {
    const valid = clampCampaignMapAreaTemplateSize(nextSpaces);
    setDraft(String(valid * unit.perSpace));
    if (valid !== spaces) onCommit(valid);
  };
  const commitDraft = () => {
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      setDraft(String(spaces * unit.perSpace));
      return;
    }
    // On blur, blank or zero values return to one grid square (5 ft on a
    // square map), never leaving an unselectable zero-radius spell area.
    apply(parseCampaignMapAreaDistanceDraft(draft, unit.perSpace));
  };
  const step = (delta: number) => {
    const typed = /^\d+$/.test(draft.trim()) ? Number(draft) : spaces * unit.perSpace;
    apply(Math.round(typed / unit.perSpace) + delta);
  };
  return <span className="campaign-map-distance-control" role="group" aria-label={label}>
    <button type="button" aria-label={`Decrease ${label} by ${unit.perSpace} ${unit.name}`}
      title={`Decrease ${unit.perSpace} ${unit.name}`}
      disabled={disabled || spaces <= campaignMapAreaTemplateMinSize}
      onClick={() => step(-1)}>−</button>
    <input type="text" inputMode="numeric" pattern="[0-9]*"
      aria-label={label} value={draft} disabled={disabled}
      onFocus={event => { editingRef.current = true; event.currentTarget.select(); }}
      onChange={event => { if (/^\d*$/.test(event.target.value)) setDraft(event.target.value); }}
      onBlur={() => { editingRef.current = false; commitDraft(); }}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelBlurRef.current = true;
          event.currentTarget.blur();
        }
      }} />
    <button type="button" aria-label={`Increase ${label} by ${unit.perSpace} ${unit.name}`}
      title={`Increase ${unit.perSpace} ${unit.name}`}
      disabled={disabled || spaces >= campaignMapAreaTemplateMaxSize}
      onClick={() => step(1)}>+</button>
    <span className="campaign-map-distance-unit">{unit.name}</span>
  </span>;
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
    <div className="campaign-map-distance-field">
      <span>Distance</span>
      <AreaTemplateDistanceInput label="Area size in distance units"
        spaces={controller.sizeSpaces} grid={grid} onCommit={controller.commitSizeSpaces} />
    </div>
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
    <div className="campaign-map-distance-field">
      <span>Distance</span>
      <AreaTemplateDistanceInput label="Line width in distance units"
        spaces={controller.widthSpaces} grid={grid} onCommit={controller.commitWidthSpaces} />
    </div>
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
    <div className="campaign-map-creation-field campaign-map-creation-size">
      <AreaTemplateDistanceInput key={controller.selected?.id ?? "new-area"}
        label="Spell area distance" spaces={controller.sizeSpaces}
        grid={grid} onCommit={controller.commitSizeSpaces} />
    </div>
    <label className="campaign-map-area-color" title="Spell area colour">
      <span className="sr-only">Colour</span>
      <input type="color" value={controller.color} aria-label="Spell area colour"
        onChange={event => controller.setColor(event.target.value)} />
    </label>
    <label className="campaign-map-creation-field campaign-map-effect-picker">
      <span className="sr-only">Spell area motion effect</span>
      <select aria-label="Spell area motion effect" value={controller.motionEffect}
        onChange={event => controller.setMotionEffect(event.target.value as CampaignMapAreaTemplateMotionEffect)}>
        {campaignMapAreaTemplateMotionEffects.map(effect =>
          <option key={effect} value={effect}>{motionEffectLabels[effect]}</option>)}
      </select>
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
    <div className="campaign-map-context-size">
      <AreaTemplateDistanceInput key={controller.selected.id}
        label="Area distance" spaces={controller.sizeSpaces} grid={grid}
        onCommit={controller.commitSizeSpaces} disabled={controller.busy} />
    </div>
    {controller.shape === "line" && <div className="campaign-map-context-size">
      <AreaTemplateDistanceInput key={controller.selected.id}
        label="Line width" spaces={controller.widthSpaces} grid={grid}
        onCommit={controller.commitWidthSpaces} disabled={controller.busy} />
    </div>}
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
    <label className="campaign-map-context-select campaign-map-effect-picker">
      <span className="sr-only">Area motion effect</span>
      <select aria-label="Area motion effect" value={controller.motionEffect} disabled={controller.busy}
        onChange={event => controller.setMotionEffect(event.target.value as CampaignMapAreaTemplateMotionEffect)}>
        {campaignMapAreaTemplateMotionEffects.map(effect =>
          <option key={effect} value={effect}>{motionEffectLabels[effect]}</option>)}
      </select>
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
  previewOnly = false,
  onSelect,
}: {
  controller: CampaignMapAreaTemplateController;
  grid: CampaignMapGrid;
  width: number;
  height: number;
  interactionEnabled?: boolean;
  previewOnly?: boolean;
  onSelect?: (id: string) => void;
}) {
  const patternPrefix = useId().replace(/:/gu, "-");
  const selecting = !previewOnly && interactionEnabled && (!controller.open || controller.mode === "select");
  return <g className={`campaign-map-area-layer${controller.open ? " is-open" : ""}${selecting ? " is-selecting" : ""}`}>
    {controller.templates.map(template => {
      const affected = campaignMapAreaTemplateAffectedPath(template, grid, width, height);
      const outline = campaignMapAreaTemplateOutlinePath(template, grid);
      const selected = !previewOnly && controller.selectedId === template.id;
      const interactive = selecting && template.canEdit;
      const direction = campaignMapAreaTemplateDirectionPoint(template, grid);
      const motionPatternId = `spell-motif-${patternPrefix}-${template.id}`;
      return <g
        key={template.id}
        className={`campaign-map-area-template${selected ? " is-selected" : ""}${interactive ? " is-editable" : ""}${template.motionEffect !== "none" ? ` is-motion-${template.motionEffect}` : ""}`}
        style={template.motionEffect !== "none" ? { "--map-area-fx": template.color } as CSSProperties : undefined}
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
        {template.motionEffect !== "none" && <>
          <defs>
            <CampaignMapMagicPattern id={motionPatternId} effect={template.motionEffect} color={template.color} />
          </defs>
          <path className="campaign-map-area-motion-texture" d={affected} fill={`url(#${motionPatternId})`}
            pointerEvents="none" aria-hidden="true" />
          <path className="campaign-map-area-motion-cells" d={affected} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
          <path className="campaign-map-area-motion-wash" d={outline} pointerEvents="none" aria-hidden="true" />
          <path className="campaign-map-area-motion-edge" d={outline} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
        </>}
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
