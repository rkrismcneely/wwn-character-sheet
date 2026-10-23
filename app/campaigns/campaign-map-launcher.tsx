"use client";

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  memo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  CampaignMapCharacterOption,
  CampaignMapPayload,
  CampaignMapSummary,
  CampaignMapToken,
} from "@/lib/campaigns/map";
import type { CampaignMapCompanionOption } from "@/lib/campaigns/map-companions";
import { translateCampaignMapAnnotationGeometry, type CampaignMapAnnotation } from "@/lib/campaigns/map-annotation-model";
import type { CampaignMapAreaTemplate } from "@/lib/campaigns/map-area-template-model";
import { pinchMapView, touchPairMetrics, type MapTouchPoint } from "@/lib/campaigns/map-pinch-zoom";
import { autoGridSubdivisionOptions, detectSquareGrid, subdividedDetectedGridSize, type SquareGridEstimate } from "@/lib/campaigns/map-grid-auto-align";
import {
  clampTokenSizeCells,
  MAX_CAMPAIGN_MAP_GRID_SIZE,
  gridCellPath,
  gridCellsInRectangle,
  gridMovementDistanceLabel,
  hexPatternPaths,
  hexPatternSize,
  snapTokenCenterOnGrid,
  tokenRadius as gridTokenRadius,
  type CampaignMapGridCell,
  type CampaignMapGridType,
} from "@/lib/campaigns/map-grid";
import {
  createMapWorkspaceState,
  mapWorkspaceReducer,
  type InPageMapPresentation,
} from "@/lib/campaigns/map-workspace-lifecycle";
import {
  campaignMapDrawerDefaultWidth,
  clampCampaignMapDrawerWidth,
  resizedCampaignMapDrawerWidth,
  type CampaignMapDrawerDock,
} from "@/lib/campaigns/map-drawer";
import {
  campaignMapDockEvent,
  campaignMapOpenEvent,
  campaignMapStateEvent,
  type CampaignMapOpenDetail,
} from "./campaign-map-events";
import { CampaignMapSharedDice } from "./campaign-map-shared-dice";
import { MapObjectActionIcon } from "./map-object-action-icon";
import {
  CampaignMapAnnotationLayer,
  CampaignMapDrawingPalette,
  useCampaignMapAnnotations,
} from "./campaign-map-annotations";
import {
  CampaignMapAreaTemplateLayer,
  CampaignMapAreaTemplatePalette,
  CampaignMapAreaTemplateInspector,
  useCampaignMapAreaTemplates,
} from "./campaign-map-area-templates";
import { campaignMapChangedEvent, useCampaignLiveSession } from "./use-live-session";

// Fog can contain hundreds of SVG paths. Wheel zoom and panning only update
// the parent viewBox, so preserve these nodes until cells or grid truly change.
const CampaignMapFogLayer = memo(function CampaignMapFogLayer({
  cells, grid, previewLayerRef,
}: {
  cells: CampaignMapPayload["fogCells"];
  grid: CampaignMapPayload["grid"];
  previewLayerRef: RefObject<SVGGElement | null>;
}) {
  return <g className="campaign-map-fog-layer" pointerEvents="none">
    {cells.map(cell => <path key={`${cell.q}:${cell.r}`} d={gridCellPath(cell, grid)} className="campaign-map-fog-cell" />)}
    <g ref={previewLayerRef} />
  </g>;
});

type ViewBox = { x: number; y: number; width: number; height: number };
type GridDraft = { enabled: boolean; type: CampaignMapGridType; size: number; offsetX: number; offsetY: number };
type MapInteractions = { snapEnabled: boolean; tokenSizes: Record<string, number> };
type FogMode = "hide" | "reveal";
type TokenDragMeasurement = { tokenId: string; distance: string };
type TokenDragOrigin = { tokenId: string; x: number; y: number };
type PipExitIntent = "close" | "return";

type MapHistoryEdit =
  | { kind: "annotation"; mapId: string; before: CampaignMapAnnotation | null; after: CampaignMapAnnotation | null; currentId: string | null }
  | { kind: "area"; mapId: string; before: CampaignMapAreaTemplate | null; after: CampaignMapAreaTemplate | null; currentId: string | null }
  | { kind: "token-move"; mapId: string; before: CampaignMapToken; after: CampaignMapToken; currentId: string };
type MapClipboard =
  | { kind: "annotation"; object: CampaignMapAnnotation; copies: number }
  | { kind: "area"; object: CampaignMapAreaTemplate; copies: number };
type MapEditHistory = { mapId: string | null; undo: MapHistoryEdit[]; redo: MapHistoryEdit[] };

type DocumentPictureInPictureController = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};

const mapPresentationStorageKey = "twe:campaign-map:presentation";
const mapDrawerDockStorageKey = "twe:campaign-map:drawer-dock";
const mapDrawerWidthStorageKey = "twe:campaign-map:drawer-width";

function isMapPresentation(value: unknown): value is InPageMapPresentation {
  return value === "fullscreen" || value === "drawer";
}

function preferredMapPresentation(): InPageMapPresentation {
  if (typeof window === "undefined") return "fullscreen";
  try {
    const value = window.localStorage.getItem(mapPresentationStorageKey);
    return isMapPresentation(value) ? value : "fullscreen";
  } catch {
    return "fullscreen";
  }
}

function preferredDrawerDock(): CampaignMapDrawerDock {
  if (typeof window === "undefined") return "right";
  try {
    return window.localStorage.getItem(mapDrawerDockStorageKey) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

function preferredDrawerWidth(): number {
  if (typeof window === "undefined") return campaignMapDrawerDefaultWidth;
  try {
    const value = Number(window.localStorage.getItem(mapDrawerWidthStorageKey));
    return Number.isFinite(value)
      ? clampCampaignMapDrawerWidth(value, window.innerWidth)
      : campaignMapDrawerDefaultWidth;
  } catch {
    return campaignMapDrawerDefaultWidth;
  }
}

function mapViewStorageKey(campaignId: string, mapId: string): string {
  return `twe:campaign-map:view:${campaignId}:${mapId}`;
}

function readMapView(campaignId: string, map: CampaignMapPayload | null): ViewBox | null {
  if (!map?.backgroundWidth || !map.backgroundHeight || typeof window === "undefined") return null;
  try {
    const candidate = JSON.parse(window.localStorage.getItem(mapViewStorageKey(campaignId, map.id)) || "null") as Partial<ViewBox> | null;
    if (!candidate || ![candidate.x, candidate.y, candidate.width, candidate.height].every(Number.isFinite)) return null;
    if ((candidate.width as number) <= 0 || (candidate.height as number) <= 0) return null;
    return candidate as ViewBox;
  } catch {
    return null;
  }
}

function documentPictureInPictureController(): DocumentPictureInPictureController | null {
  if (typeof window === "undefined") return null;
  return (window as typeof window & { documentPictureInPicture?: DocumentPictureInPictureController }).documentPictureInPicture ?? null;
}

function copyMapWorkspaceStyles(target: Document): void {
  for (const node of document.head.querySelectorAll("link[rel='stylesheet'], style")) {
    target.head.appendChild(node.cloneNode(true));
  }
  target.documentElement.dataset.theme = document.documentElement.dataset.theme;
  target.body.className = "campaign-map-pip-document";
}

type MapResponse = {
  map?: CampaignMapPayload | null;
  maps?: CampaignMapSummary[];
  permissions?: { canManage?: boolean };
  characters?: CampaignMapCharacterOption[];
  companions?: CampaignMapCompanionOption[];
  encounterAvailable?: boolean;
  error?: string;
};

type InteractionResponse = {
  interactions?: MapInteractions;
  token?: { id: string; x: number; y: number; version: number };
  map?: CampaignMapPayload;
  error?: string;
};

function defaultGrid(): GridDraft {
  return { enabled: false, type: "square", size: 64, offsetX: 0, offsetY: 0 };
}

function gridFor(map: CampaignMapPayload | null): GridDraft {
  return map ? { ...map.grid } : defaultGrid();
}

function fullView(map: CampaignMapPayload | null): ViewBox | null {
  if (!map?.backgroundWidth || !map.backgroundHeight) return null;
  return { x: 0, y: 0, width: map.backgroundWidth, height: map.backgroundHeight };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tokenKindLabel(kind: CampaignMapToken["kind"]): string {
  return kind === "pc" ? "PC" : kind === "companion" ? "Companion" : "NPC";
}

/** Conventional square-grid creature footprints; larger tokens retain their precise footprint. */
function tokenFootprintSizeLabel(size: number): string {
  if (size <= 1) return "Medium";
  if (size === 2) return "Large";
  if (size === 3) return "Huge";
  return size === 4 ? "Gargantuan" : `Gargantuan (${size}×${size})`;
}

function tokenAriaKind(kind: CampaignMapToken["kind"]): string {
  return kind === "pc" ? "player character" : kind === "companion" ? "companion" : "NPC";
}

function tokenInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

// The token's visual SVG only depends on its label and radius. Keep these
// nodes stable while the map viewBox, toolbar or unrelated tokens update.
const MapTokenArtwork = memo(function MapTokenArtwork({
  name, radius, distance,
}: { name: string; radius: number; distance?: string }) {
  return <>
    <title>{name}</title>
    <circle r={radius} className="campaign-map-token-disc" vectorEffect="non-scaling-stroke" />
    <text className="campaign-map-token-initials" textAnchor="middle" dominantBaseline="central" fontSize={radius * 0.72}>{tokenInitials(name)}</text>
    {distance !== undefined && <text className="campaign-map-token-distance" textAnchor="middle" y={-(radius + Math.max(14, radius * 0.5))} fontSize={Math.max(12, radius * 0.44)}>{distance}</text>}
    <text className="campaign-map-token-name" textAnchor="middle" y={radius + Math.max(12, radius * 0.48)} fontSize={Math.max(11, radius * 0.42)}>{name}</text>
  </>;
});

function filenameMapName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/u, "").trim();
  return withoutExtension.slice(0, 80) || "Map";
}

function clientPointToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

function sameView(a: ViewBox | null, b: ViewBox | null): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

export type CampaignMapWorkspaceProps = {
  campaignId: string;
  campaignName: string;
  canManage: boolean;
  showFloatingButton?: boolean;
  initialOpen?: boolean;
  initialPresentation?: "standalone";
};

/**
 * The one map renderer/controller used in every supported host. Presentation
 * changes only the surrounding shell; it never forks local map authority.
 */
export function CampaignMapWorkspace({
  campaignId,
  campaignName,
  canManage: initialCanManage,
  showFloatingButton = true,
  initialOpen = false,
  initialPresentation,
}: CampaignMapWorkspaceProps) {
  const patternId = useId().replaceAll(":", "");
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mapToolbarRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [inspectorAnchor, setInspectorAnchor] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const drawerElementRef = useRef<HTMLElement>(null);
  const selectedMapIdRef = useRef<string | null>(null);
  const gmMapBeforePreviewRef = useRef<string | null>(null);
  const playerPreviewRef = useRef(false);
  const editHistoryRef = useRef<MapEditHistory>({ mapId: null, undo: [], redo: [] });
  const editClipboardRef = useRef<MapClipboard | null>(null);
  const editInProgressRef = useRef(false);
  const [keyboardFeedback, setKeyboardFeedback] = useState("");
  const canManageRef = useRef(initialCanManage);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; view: ViewBox; latestView: ViewBox } | null>(null);
  const touchPointersRef = useRef<Map<number, MapTouchPoint>>(new Map());
  const pinchRef = useRef<{ startView: ViewBox; startDistance: number; anchor: MapTouchPoint; latestView: ViewBox } | null>(null);
  // Suppress one-finger actions until every finger has lifted after a pinch.
  const suppressTouchRef = useRef(false);
  const updateInspectorAnchorRef = useRef<(() => void) | null>(null);
  const tokenMovePendingRef = useRef(false);
  const tokenDragRef = useRef<{
    pointerId: number; tokenId: string; version: number; pointerMapX: number; pointerMapY: number;
    x: number; y: number; latestX: number; latestY: number; element: SVGGElement; distanceElement: SVGTextElement | null;
  } | null>(null);
  const fogDragRef = useRef<{ pointerId: number; start: { x: number; y: number }; latest: { x: number; y: number } } | null>(null);
  const fogPreviewRef = useRef<CampaignMapGridCell[]>([]);
  const fogPreviewLayerRef = useRef<SVGGElement>(null);
  const fogPreviewFrameRef = useRef<number | null>(null);
  const mapSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const [workspace, dispatchWorkspace] = useReducer(mapWorkspaceReducer, { initialOpen, initialPresentation, preferredPresentation: preferredMapPresentation() }, createMapWorkspaceState);
  const open = workspace.presentation !== "closed";
  const presentation = workspace.presentation;
  const [pipDocument, setPipDocument] = useState<Document | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const pipExitIntentRef = useRef<PipExitIntent>("close");
  const drawerResizeRef = useRef<{ pointerId: number; clientX: number; width: number; latestWidth: number; source: "divider" | "collapse"; didDrag: boolean } | null>(null);
  const suppressDrawerCollapseClickRef = useRef(false);
  const [drawerDock, setDrawerDock] = useState<CampaignMapDrawerDock>(preferredDrawerDock);
  const [drawerWidth, setDrawerWidth] = useState(preferredDrawerWidth);
  const [closingDrawer, setClosingDrawer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [map, setMap] = useState<CampaignMapPayload | null>(null);
  const [maps, setMaps] = useState<CampaignMapSummary[]>([]);
  const [canManage, setCanManage] = useState(initialCanManage);
  const [playerPreview, setPlayerPreview] = useState(false);
  const [characters, setCharacters] = useState<CampaignMapCharacterOption[]>([]);
  const [companions, setCompanions] = useState<CampaignMapCompanionOption[]>([]);
  const [encounterAvailable, setEncounterAvailable] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editSection, setEditSection] = useState<"maps" | "grid" | "tokens">("maps");
  const [grid, setGrid] = useState<GridDraft>(defaultGrid());
  const [autoAlignBusy, setAutoAlignBusy] = useState(false);
  const [autoAlignPreview, setAutoAlignPreview] = useState(false);
  const [autoAlignDetected, setAutoAlignDetected] = useState<SquareGridEstimate | null>(null);
  const [autoAlignSubdivision, setAutoAlignSubdivision] = useState(1);
  const [autoAlignNotice, setAutoAlignNotice] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [tokenSizes, setTokenSizes] = useState<Record<string, number>>({});
  const [mapNameDraft, setMapNameDraft] = useState("");
  const [view, setView] = useState<ViewBox | null>(null);
  const [tokenDragMeasurement, setTokenDragMeasurement] = useState<TokenDragMeasurement | null>(null);
  const [tokenDragOrigin, setTokenDragOrigin] = useState<TokenDragOrigin | null>(null);
  const [fogMode, setFogMode] = useState<FogMode | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);
  const measureDragRef = useRef<{ pointerId: number } | null>(null);
  const spacePanRef = useRef(false);
  const recordMapEdit = useCallback((edit: MapHistoryEdit) => {
    const history = editHistoryRef.current;
    if (history.mapId !== edit.mapId) {
      history.mapId = edit.mapId;
      history.undo = [];
      history.redo = [];
    }
    history.undo.push(edit);
    if (history.undo.length > 75) history.undo.shift();
    history.redo = [];
  }, []);
  const recordAnnotationEdit = useCallback((before: CampaignMapAnnotation | null, after: CampaignMapAnnotation | null) => {
    const mapId = selectedMapIdRef.current;
    if (!mapId || editInProgressRef.current) return;
    recordMapEdit({ kind: "annotation", mapId, before, after, currentId: after?.id ?? null });
  }, [recordMapEdit]);
  const recordAreaEdit = useCallback((before: CampaignMapAreaTemplate | null, after: CampaignMapAreaTemplate | null) => {
    const mapId = selectedMapIdRef.current;
    if (!mapId || editInProgressRef.current) return;
    recordMapEdit({ kind: "area", mapId, before, after, currentId: after?.id ?? null });
  }, [recordMapEdit]);
  const publishMapInvalidation = useCallback((scope?: "tokens") => {
    mapSyncChannelRef.current?.postMessage({ type: "map-changed", campaignId, scope });
  }, [campaignId]);
  const annotations = useCampaignMapAnnotations({
    campaignId,
    mapId: map?.id ?? null,
    mapName: map?.name ?? campaignName,
    width: map?.backgroundWidth ?? null,
    height: map?.backgroundHeight ?? null,
    open,
    canManage,
    onChanged: publishMapInvalidation,
    onEdited: recordAnnotationEdit,
  });
  const areaTemplates = useCampaignMapAreaTemplates({
    campaignId,
    mapId: map?.id ?? null,
    width: map?.backgroundWidth ?? null,
    height: map?.backgroundHeight ?? null,
    grid: map?.grid ?? null,
    openMap: open,
    onChanged: publishMapInvalidation,
    onEdited: recordAreaEdit,
  });

  const closeMap = useCallback(() => {
    playerPreviewRef.current = false; gmMapBeforePreviewRef.current = null; setPlayerPreview(false);
    if (presentation === "pip") { pipExitIntentRef.current = "close"; pipWindowRef.current?.close(); pipWindowRef.current = null; setPipDocument(null); dispatchWorkspace({ type: "close" }); setSettingsOpen(false); return; }
    if (presentation === "standalone") { if (window.opener) window.close(); else window.location.assign(`/campaigns/${campaignId}`); return; }
    if (presentation === "drawer") setClosingDrawer(true);
    dispatchWorkspace({ type: "close" }); setSettingsOpen(false);
  }, [campaignId, presentation]);

  useEffect(() => {
    if (!closingDrawer) return;
    const timeout = window.setTimeout(() => setClosingDrawer(false), 240);
    return () => window.clearTimeout(timeout);
  }, [closingDrawer]);

  useCampaignLiveSession(campaignId, open);
  useEffect(() => {
    if (!open || !mapToolbarRef.current || !drawerElementRef.current) return;
    const header = mapToolbarRef.current;
    const host = drawerElementRef.current;
    const update = () => host.style.setProperty("--map-hud-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      host.style.removeProperty("--map-hud-height");
    };
  }, [open, presentation]);
  useEffect(() => {
    if (!open) return;
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") { spacePanRef.current = true; event.preventDefault(); }
      if (event.key === "Escape") {
        annotations.stopDrawing(); areaTemplates.close(); setFogMode(null);
        annotations.selectAnnotation(null); areaTemplates.selectTemplate(null);
        setSelectedTokenId(null); setAddOpen(false); setSettingsOpen(false);
        setMeasureEnabled(false); setMeasureStart(null); setMeasureEnd(null);
      }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") spacePanRef.current = false; };
    const reset = () => { spacePanRef.current = false; };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", reset);
      spacePanRef.current = false;
    };
  }, [open, annotations, areaTemplates]);

  useEffect(() => {
    // A different map/host cannot inherit pointers or an unfinished pinch.
    touchPointersRef.current.clear();
    pinchRef.current = null;
    suppressTouchRef.current = false;
  }, [map?.id, open, presentation]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!open || !svg) return;

    // WebKit (including Chrome on iOS) may browser-zoom the whole page despite
    // SVG touch-action:none. Prevent that only for a two-finger gesture
    // originating inside the map canvas. Toolbar and page gestures outside
    // the canvas retain normal browser accessibility behaviour.
    const keepPinchInMap = (event: TouchEvent) => {
      if (event.touches.length >= 2 && event.cancelable) event.preventDefault();
    };
    const preventSafariPageGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    svg.addEventListener("touchstart", keepPinchInMap, { passive: false });
    svg.addEventListener("touchmove", keepPinchInMap, { passive: false });
    svg.addEventListener("gesturestart", preventSafariPageGesture, { passive: false });
    svg.addEventListener("gesturechange", preventSafariPageGesture, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", keepPinchInMap);
      svg.removeEventListener("touchmove", keepPinchInMap);
      svg.removeEventListener("gesturestart", preventSafariPageGesture);
      svg.removeEventListener("gesturechange", preventSafariPageGesture);
    };
  }, [open, loading, map?.id, presentation]);
  // Zoom/pan emits many view updates per second. Save after interaction settles
  // instead of doing synchronous localStorage writes for every wheel event.
  useEffect(() => {
    if (!map || !view) return;
    const mapId = map.id;
    const saveView = () => {
      try { window.localStorage.setItem(mapViewStorageKey(campaignId, mapId), JSON.stringify(view)); } catch {}
    };
    if (!open) { saveView(); return; }
    const timer = window.setTimeout(saveView, 180);
    return () => window.clearTimeout(timer);
  }, [campaignId, map?.id, open, view]);
  useEffect(() => { try { window.localStorage.setItem(mapDrawerDockStorageKey, drawerDock); window.localStorage.setItem(mapDrawerWidthStorageKey, String(drawerWidth)); } catch {} }, [drawerDock, drawerWidth]);
  useEffect(() => {
    const documentElement = document.documentElement;
    const clearDrawerState = () => { delete documentElement.dataset.campaignMapDrawer; delete documentElement.dataset.campaignMapPane; documentElement.style.removeProperty("--campaign-map-drawer-space"); };
    if (!open || presentation !== "drawer") { clearDrawerState(); return; }
    const syncDrawerState = () => { const remainingWidth = Math.max(0, window.innerWidth - drawerWidth); documentElement.dataset.campaignMapDrawer = drawerDock; documentElement.dataset.campaignMapPane = remainingWidth < 760 ? "narrow" : remainingWidth < 1120 ? "compact" : "wide"; documentElement.style.setProperty("--campaign-map-drawer-space", `${drawerWidth}px`); };
    syncDrawerState(); window.addEventListener("resize", syncDrawerState); return () => { window.removeEventListener("resize", syncDrawerState); if (documentElement.dataset.campaignMapDrawer === drawerDock) clearDrawerState(); };
  }, [drawerDock, drawerWidth, open, presentation]);
  useEffect(() => { if (!open || (presentation !== "fullscreen" && presentation !== "standalone")) return; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeMap(); }; window.addEventListener("keydown", onKeyDown); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); }; }, [closeMap, open, presentation]);
  useEffect(() => { window.dispatchEvent(new CustomEvent(campaignMapStateEvent, { detail: { campaignId, open } })); }, [campaignId, open]);

  const applyResponse = useCallback((body: MapResponse, preserveView: boolean) => {
    const previousMapId = selectedMapIdRef.current; const nextMap = body.map ?? null; setMap(nextMap); selectedMapIdRef.current = nextMap?.id ?? null;
    if (body.maps) setMaps(body.maps); if (body.permissions) { const nextCanManage = Boolean(body.permissions.canManage); setCanManage(nextCanManage); canManageRef.current = nextCanManage; }
    if (body.characters) setCharacters(body.characters); if (body.companions) setCompanions(body.companions); if (typeof body.encounterAvailable === "boolean") setEncounterAvailable(body.encounterAvailable);
    setAutoAlignPreview(false); setAutoAlignDetected(null); setAutoAlignSubdivision(1); setAutoAlignNotice("");
    setGrid(gridFor(nextMap)); setMapNameDraft(nextMap?.name ?? ""); setView(current => preserveView && previousMapId === nextMap?.id && current && nextMap?.backgroundWidth && nextMap.backgroundHeight ? current : readMapView(campaignId, nextMap) ?? fullView(nextMap));
  }, [campaignId]);

  const loadInteractions = useCallback(async (mapId: string) => { const params = new URLSearchParams({ mapId }); const response = await fetch(`/api/campaigns/${campaignId}/map/interactions?${params.toString()}`, { cache: "no-store" }); const body = await response.json() as InteractionResponse; if (!response.ok || !body.interactions) throw new Error(body.error || "The map interaction settings could not be loaded."); setSnapToGrid(body.interactions.snapEnabled); setTokenSizes(body.interactions.tokenSizes); }, [campaignId]);
  const loadMap = useCallback(async (preserveView = false, requestedMapId?: string | null, showLoading = true): Promise<boolean> => { if (showLoading) setLoading(true); setError(""); try { const params = requestedMapId ? `?${new URLSearchParams({ mapId: requestedMapId }).toString()}` : ""; const response = await fetch(`/api/campaigns/${campaignId}/map${params}`, { cache: "no-store" }); const body = await response.json() as MapResponse; if (!response.ok) throw new Error(body.error || "The campaign map could not be loaded."); if (tokenDragRef.current || tokenMovePendingRef.current) return false; applyResponse(body, preserveView); if (body.map) await loadInteractions(body.map.id); else { setSnapToGrid(false); setTokenSizes({}); } return true; } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "The campaign map could not be loaded."); return false; } finally { if (showLoading) setLoading(false); } }, [applyResponse, campaignId, loadInteractions]);

  useEffect(() => {
    if (!open) return;
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const mapId = playerPreviewRef.current ? null : canManageRef.current ? selectedMapIdRef.current : null;
        void loadMap(true, mapId, false);
      }, 60);
    };
    const onLocal = (event: Event) => {
      if ((event as CustomEvent<{ campaignId?: string }>).detail?.campaignId === campaignId) refresh();
    };
    window.addEventListener(campaignMapChangedEvent, onLocal);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`twe:campaign-map:${campaignId}`) : null;
    if (channel) {
      mapSyncChannelRef.current = channel;
      channel.onmessage = event => {
        const msg = event.data as { type?: unknown; campaignId?: unknown } | null;
        if (msg?.type === "map-changed" && msg.campaignId === campaignId) refresh();
      };
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(campaignMapChangedEvent, onLocal);
      if (mapSyncChannelRef.current === channel) mapSyncChannelRef.current = null;
      channel?.close();
    };
  }, [campaignId, loadMap, open]);
  useEffect(() => { if (!initialOpen) return; const initialLoad = window.setTimeout(() => { void loadMap(false); }, 0); return () => window.clearTimeout(initialLoad); }, [initialOpen, initialPresentation, loadMap]);
  useEffect(() => { const onOpenMap = (event: Event) => { const detail = (event as CustomEvent<CampaignMapOpenDetail>).detail; if (detail?.campaignId !== campaignId) return; if (detail.action === "close") { closeMap(); return; } if (open) return; setClosingDrawer(false); dispatchWorkspace({ type: "open" }); setSettingsOpen(false); void loadMap(false); }; window.addEventListener(campaignMapOpenEvent, onOpenMap); return () => window.removeEventListener(campaignMapOpenEvent, onOpenMap); }, [campaignId, closeMap, loadMap, open]);

  function showMap() { if (open) { closeMap(); return; } dispatchWorkspace({ type: "open" }); setSettingsOpen(false); void loadMap(false); }
  function rememberPresentation(nextPresentation: InPageMapPresentation) { try { window.localStorage.setItem(mapPresentationStorageKey, nextPresentation); } catch {} }
  function choosePresentation(nextPresentation: InPageMapPresentation) { dispatchWorkspace({ type: "choose-in-page-presentation", presentation: nextPresentation }); rememberPresentation(nextPresentation); setSettingsOpen(false); }
  function chooseDrawerDock(nextDock: CampaignMapDrawerDock) {
    setDrawerDock(nextDock);
    try { window.localStorage.setItem(mapDrawerDockStorageKey, nextDock); } catch {}
    window.dispatchEvent(new CustomEvent(campaignMapDockEvent, { detail: { dock: nextDock } }));
  }
  async function openMapPictureInPicture() { const controller = documentPictureInPictureController(); if (!controller) { setError("Picture-in-Picture is not available in this browser. Keep the map in the page and choose Side drawer instead."); return; } try { const pipWindow = await controller.requestWindow({ width: 1060, height: 760 }); copyMapWorkspaceStyles(pipWindow.document); pipWindowRef.current = pipWindow; pipWindow.addEventListener("pagehide", () => { const returnToPage = pipExitIntentRef.current === "return"; pipExitIntentRef.current = "close"; pipWindowRef.current = null; setPipDocument(null); dispatchWorkspace({ type: "picture-in-picture-closed", returnToPage }); setSettingsOpen(false); }, { once: true }); setPipDocument(pipWindow.document); dispatchWorkspace({ type: "move-to-picture-in-picture" }); setSettingsOpen(false); } catch { setError("Picture-in-Picture could not be opened. Keep the map in the page and choose Side drawer instead."); } }
  function returnFromPictureInPicture() { if (presentation !== "pip") return; pipExitIntentRef.current = "return"; pipWindowRef.current?.close(); }

  function handleDrawerResizeStart(event: ReactPointerEvent<HTMLElement>, source: "divider" | "collapse" = "divider") { if (presentation !== "drawer" || event.button !== 0) return; drawerResizeRef.current = { pointerId: event.pointerId, clientX: event.clientX, width: drawerWidth, latestWidth: drawerWidth, source, didDrag: false }; if (source === "collapse") suppressDrawerCollapseClickRef.current = false; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }
  function handlePresentationSelect(value: string) { if (value === "pip") { void openMapPictureInPicture(); return; } if (value === "fullscreen" || value === "drawer") choosePresentation(value); }
  function handleDrawerResizeMove(event: ReactPointerEvent<HTMLElement>) { const resize = drawerResizeRef.current; if (!resize || resize.pointerId !== event.pointerId) return; if (!resize.didDrag && Math.abs(event.clientX - resize.clientX) < 3) return; resize.didDrag = true; const nextWidth = resizedCampaignMapDrawerWidth({ dock: drawerDock, startWidth: resize.width, startClientX: resize.clientX, clientX: event.clientX, viewportWidth: window.innerWidth }); resize.latestWidth = nextWidth; drawerElementRef.current?.style.setProperty("--campaign-map-drawer-width", `${nextWidth}px`); const documentElement = document.documentElement; documentElement.style.setProperty("--campaign-map-drawer-space", `${nextWidth}px`); const remainingWidth = Math.max(0, window.innerWidth - nextWidth); const nextPane = remainingWidth < 760 ? "narrow" : remainingWidth < 1120 ? "compact" : "wide"; if (documentElement.dataset.campaignMapPane !== nextPane) documentElement.dataset.campaignMapPane = nextPane; }
  function handleDrawerResizeEnd(event: ReactPointerEvent<HTMLElement>) { const resize = drawerResizeRef.current; if (!resize || resize.pointerId !== event.pointerId) return; drawerResizeRef.current = null; if (resize.didDrag) setDrawerWidth(current => current === resize.latestWidth ? current : resize.latestWidth); if (resize.source === "collapse" && resize.didDrag) { suppressDrawerCollapseClickRef.current = true; window.setTimeout(() => { suppressDrawerCollapseClickRef.current = false; }, 0); } if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  function handleDrawerCollapseClick() { if (suppressDrawerCollapseClickRef.current) { suppressDrawerCollapseClickRef.current = false; return; } closeMap(); }
  function resetView() { setView(fullView(map)); }
  function zoom(factor: number) { if (!map?.backgroundWidth || !map.backgroundHeight || !view) return; const nextWidth = clamp(view.width * factor, map.backgroundWidth / 12, map.backgroundWidth * 1.5); const nextHeight = nextWidth * (map.backgroundHeight / map.backgroundWidth); const centerX = view.x + view.width / 2; const centerY = view.y + view.height / 2; setView({ x: centerX - nextWidth / 2, y: centerY - nextHeight / 2, width: nextWidth, height: nextHeight }); }
  // React's delegated wheel listener can be passive, allowing the page behind a
  // docked map to scroll even when the map itself zooms. Listen non-passively
  // on the SVG to prevent the browser's default scrolling at the source.
  useEffect(() => {
    const svg = svgRef.current;
    if (!open || !svg) return;
    const handleMapWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.deltaY) return;
      setView(current => {
        if (!current || !map?.backgroundWidth || !map.backgroundHeight) return current;
        const factor = event.deltaY > 0 ? 1.12 : 0.88;
        const width = clamp(current.width * factor, map.backgroundWidth / 12, map.backgroundWidth * 1.5);
        const height = width * (map.backgroundHeight / map.backgroundWidth);
        return {
          x: current.x + (current.width - width) / 2,
          y: current.y + (current.height - height) / 2,
          width,
          height,
        };
      });
    };
    svg.addEventListener("wheel", handleMapWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleMapWheel);
  }, [open, loading, map?.id, map?.backgroundWidth, map?.backgroundHeight, view !== null]);

  function handleTouchPointerDownCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "touch") return;
    const touches = touchPointersRef.current;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size < 2) return;
    if (!pinchRef.current && view && map?.backgroundWidth && map.backgroundHeight) {
      const svg = event.currentTarget;
      const [first, second] = [...touches.values()];
      const { center, distance } = touchPairMetrics(first, second);
      const anchor = clientPointToSvg(svg, center.x, center.y);
      if (anchor && distance > 0) {
        // Cancel an in-flight single-touch action without committing it.
        // This includes token dragging, pen strokes, area movement, and fog.
        const tokenDrag = tokenDragRef.current;
        if (tokenDrag) {
          tokenDrag.element.setAttribute("transform", `translate(${tokenDrag.x} ${tokenDrag.y})`);
          if (tokenDrag.element.hasPointerCapture(tokenDrag.pointerId))
            tokenDrag.element.releasePointerCapture(tokenDrag.pointerId);
          tokenDragRef.current = null;
          setTokenDragMeasurement(null);
          setTokenDragOrigin(null);
        }
        const pan = dragRef.current;
        dragRef.current = null;
        if (pan && svg.hasPointerCapture(pan.pointerId)) svg.releasePointerCapture(pan.pointerId);
        const fog = fogDragRef.current;
        fogDragRef.current = null;
        if (fog) clearFogPreview();
        const measure = measureDragRef.current;
        measureDragRef.current = null;
        if (measure) { setMeasureStart(null); setMeasureEnd(null); }
        annotations.cancelPointerInteraction();
        areaTemplates.cancelPointerInteraction();
        for (const id of touches.keys()) {
          if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
        }
        const startView = pan?.latestView ?? view;
        pinchRef.current = { startView, startDistance: distance, anchor, latestView: startView };
        suppressTouchRef.current = true;
      }
    }
    if (suppressTouchRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleTouchPointerMoveCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "touch") return;
    const touches = touchPointersRef.current;
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!suppressTouchRef.current) return;
    const gesture = pinchRef.current;
    if (gesture && touches.size >= 2 && map?.backgroundWidth && map.backgroundHeight) {
      const [first, second] = [...touches.values()];
      const { center, distance } = touchPairMetrics(first, second);
      const rect = event.currentTarget.getBoundingClientRect();
      const nextView = pinchMapView({
        startView: gesture.startView,
        startDistance: gesture.startDistance,
        distance,
        anchor: gesture.anchor,
        center,
        viewport: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        mapWidth: map.backgroundWidth,
        mapHeight: map.backgroundHeight,
      });
      gesture.latestView = nextView;
      event.currentTarget.setAttribute("viewBox", `${nextView.x} ${nextView.y} ${nextView.width} ${nextView.height}`);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTouchPointerEndCapture(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.delete(event.pointerId);
    if (!suppressTouchRef.current) return;
    const svg = event.currentTarget;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (pinchRef.current && touchPointersRef.current.size < 2) {
      const finalView = pinchRef.current.latestView;
      pinchRef.current = null;
      setView(current => sameView(current, finalView) ? current : finalView);
    }
    if (!touchPointersRef.current.size) suppressTouchRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function selectedFogCells(start: { x: number; y: number }, end: { x: number; y: number }): CampaignMapGridCell[] { if (!map) return []; return gridCellsInRectangle(start, end, map.grid, 500); }
  function renderFogPreview(cells: CampaignMapGridCell[], mode: FogMode) { const layer = fogPreviewLayerRef.current; if (!layer || !map) return; const ownerDocument = layer.ownerDocument; const fragment = ownerDocument.createDocumentFragment(); for (const cell of cells) { const path = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", gridCellPath(cell, map.grid)); path.setAttribute("class", `campaign-map-fog-preview is-${mode}`); fragment.appendChild(path); } layer.replaceChildren(fragment); }
  function clearFogPreview() { if (fogPreviewFrameRef.current !== null) { window.cancelAnimationFrame(fogPreviewFrameRef.current); fogPreviewFrameRef.current = null; } fogPreviewRef.current = []; fogPreviewLayerRef.current?.replaceChildren(); }
  function scheduleFogPreview(mode: FogMode) { if (fogPreviewFrameRef.current !== null) return; fogPreviewFrameRef.current = window.requestAnimationFrame(() => { fogPreviewFrameRef.current = null; const drag = fogDragRef.current; if (!drag) return; const cells = selectedFogCells(drag.start, drag.latest); fogPreviewRef.current = cells; renderFogPreview(cells, mode); }); }
  async function saveFogCells(mode: FogMode, cells: CampaignMapGridCell[]) { if (!map || !cells.length) return; setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_fog", mapId: map.id, mode, cells }) }); const body = await response.json() as InteractionResponse; if (!response.ok || !body.map) throw new Error(body.error || "Map visibility could not be updated."); setMap(body.map); publishMapInvalidation(); } catch (fogError) { setError(fogError instanceof Error ? fogError.message : "Map visibility could not be updated."); void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false); } finally { setBusy(false); } }

  function stopMeasuring() {
    const capturedPointer = measureDragRef.current?.pointerId;
    const svg = svgRef.current;
    measureDragRef.current = null;
    if (capturedPointer !== undefined && svg?.hasPointerCapture(capturedPointer)) {
      svg.releasePointerCapture(capturedPointer);
    }
    setMeasureEnabled(false);
    setMeasureStart(null);
    setMeasureEnd(null);
  }

  function toggleMeasuring() {
    if (measureEnabled) {
      stopMeasuring();
      return;
    }
    annotations.stopDrawing();
    areaTemplates.close();
    setFogMode(null);
    clearFogPreview();
    setAddOpen(false);
    setMeasureStart(null);
    setMeasureEnd(null);
    setMeasureEnabled(true);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) { if (!view || event.button !== 0 || tokenDragRef.current) return;
    stageRef.current?.focus({ preventScroll: true });
    if (!spacePanRef.current && measureEnabled && svgRef.current) {
      const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      if (point) {
        measureDragRef.current = { pointerId: event.pointerId };
        setMeasureStart(point); setMeasureEnd(point);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (!spacePanRef.current && areaTemplates.handlePointerDown(event)) return;
    if (!spacePanRef.current && annotations.handlePointerDown(event)) return;
    annotations.selectAnnotation(null); areaTemplates.selectTemplate(null); setSelectedTokenId(null);
    if (!spacePanRef.current && fogMode && canManage && svgRef.current) { const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY); if (!point) return; fogDragRef.current = { pointerId: event.pointerId, start: point, latest: point }; const cells = selectedFogCells(point, point); fogPreviewRef.current = cells; renderFogPreview(cells, fogMode); event.currentTarget.setPointerCapture(event.pointerId); return; } dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, view, latestView: view }; event.currentTarget.setPointerCapture(event.pointerId); }
  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (measureDragRef.current?.pointerId === event.pointerId && svgRef.current) {
      const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      if (point) setMeasureEnd(point);
      return;
    }
    if (areaTemplates.handlePointerMove(event)) return; if (annotations.handlePointerMove(event)) return; const fogDrag = fogDragRef.current; if (fogDrag?.pointerId === event.pointerId && svgRef.current) { const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY); if (point && fogMode && (point.x !== fogDrag.latest.x || point.y !== fogDrag.latest.y)) { fogDrag.latest = point; scheduleFogPreview(fogMode); } return; } const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return; const dx = (event.clientX - drag.clientX) * (drag.view.width / rect.width); const dy = (event.clientY - drag.clientY) * (drag.view.height / rect.height); const nextView = { ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }; drag.latestView = nextView; event.currentTarget.setAttribute("viewBox", `${nextView.x} ${nextView.y} ${nextView.width} ${nextView.height}`); }
  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (measureDragRef.current?.pointerId === event.pointerId) {
      measureDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (areaTemplates.handlePointerEnd(event)) return; if (annotations.handlePointerEnd(event)) return; const fogDrag = fogDragRef.current; if (fogDrag?.pointerId === event.pointerId) { const endPoint = svgRef.current ? clientPointToSvg(svgRef.current, event.clientX, event.clientY) : null; const cells = selectedFogCells(fogDrag.start, endPoint ?? fogDrag.latest); const mode = fogMode; fogDragRef.current = null; clearFogPreview(); setFogMode(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (mode && cells.length) void saveFogCells(mode, cells); return; } const drag = dragRef.current; if (drag?.pointerId === event.pointerId) { dragRef.current = null; const finalView = drag.latestView; setView(current => sameView(current, finalView) ? current : finalView); } if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }

  function handleTokenPointerDown(event: ReactPointerEvent<SVGGElement>, token: CampaignMapToken) {
    if (!view || tokenMovePendingRef.current || event.button !== 0 || !svgRef.current || annotations.tool || areaTemplates.open || fogMode || measureEnabled || spacePanRef.current) return;
    event.stopPropagation(); stageRef.current?.focus({ preventScroll: true }); setSelectedTokenId(token.id); annotations.selectAnnotation(null); areaTemplates.selectTemplate(null);
    if (!token.canMove) return; const pointer = clientPointToSvg(svgRef.current, event.clientX, event.clientY); if (!pointer) return;
    tokenDragRef.current = { pointerId: event.pointerId, tokenId: token.id, version: token.version, pointerMapX: pointer.x, pointerMapY: pointer.y, x: token.x, y: token.y, latestX: token.x, latestY: token.y, element: event.currentTarget, distanceElement: null };
    setTokenDragMeasurement({ tokenId: token.id, distance: "0 ft" }); setTokenDragOrigin({ tokenId: token.id, x: token.x, y: token.y }); event.currentTarget.setPointerCapture(event.pointerId);
  }
  function positionDraggedTokenToolbar(tokenElement: SVGGElement) {
    const stage = stageRef.current;
    const inspector = inspectorRef.current;
    if (!stage || !inspector) return;
    const tokenBounds = tokenElement.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const barWidth = Math.min(inspector.offsetWidth || 440, Math.max(0, stageBounds.width - 16));
    const half = barWidth / 2 + 8;
    const center = tokenBounds.left + tokenBounds.width / 2 - stageBounds.left;
    const left = stageBounds.width > barWidth + 16
      ? clamp(center, half, stageBounds.width - half)
      : stageBounds.width / 2;
    const above = tokenBounds.top - stageBounds.top - 12;
    const below = above < 132;
    const top = below ? tokenBounds.bottom - stageBounds.top + 12 : above;
    inspector.style.left = `${left}px`;
    inspector.style.top = `${top}px`;
    inspector.style.visibility = "visible";
    inspector.classList.toggle("is-below", below);
  }

  function handleTokenPointerMove(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current; if (!drag || drag.pointerId !== event.pointerId || !map?.backgroundWidth || !map.backgroundHeight || !svgRef.current) return; event.stopPropagation(); const pointer = clientPointToSvg(svgRef.current, event.clientX, event.clientY); if (!pointer) return;
    let x = clamp(drag.x + (pointer.x - drag.pointerMapX), 0, map.backgroundWidth); let y = clamp(drag.y + (pointer.y - drag.pointerMapY), 0, map.backgroundHeight);
    if (snapToGrid) { const sizeCells = tokenSizes[drag.tokenId] ?? 1; const snapped = snapTokenCenterOnGrid({ x, y }, map.grid, sizeCells, map.backgroundWidth, map.backgroundHeight); x = snapped.x; y = snapped.y; }
    // Most pointer events stay in the same grid cell when snapping is on.
    // Avoid rebuilding map/token state or measuring the toolbar until the
    // token actually moves to a new coordinate.
    if (x === drag.latestX && y === drag.latestY) return;
    drag.latestX = x; drag.latestY = y;
    // Keep React's token position in sync with the live drag. Otherwise a
    // measurement/selection render can restore the old transform mid-drag.
    setMap(current => {
      if (!current) return current;
      const token = current.tokens.find(candidate => candidate.id === drag.tokenId);
      if (!token || (token.x === x && token.y === y)) return current;
      return { ...current, tokens: current.tokens.map(candidate =>
        candidate.id === drag.tokenId ? { ...candidate, x, y } : candidate
      ) };
    });
    drag.element.setAttribute("transform", `translate(${x} ${y})`);
    const distance = gridMovementDistanceLabel(drag.x, drag.y, x, y, map.grid); const distanceElement = drag.element.querySelector<SVGTextElement>(".campaign-map-token-distance"); if (distanceElement) distanceElement.textContent = distance;
    // Treat the token and its toolbar as one drag surface. Position directly
    // from the just-transformed SVG element, independently of React effects.
    positionDraggedTokenToolbar(drag.element);
  }
  async function persistTokenMove(drag: NonNullable<typeof tokenDragRef.current>) { if (!map) return; tokenMovePendingRef.current = true; setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "move", mapId: map.id, tokenId: drag.tokenId, version: drag.version, x: drag.latestX, y: drag.latestY }) }); const body = await response.json() as MapResponse; if (!response.ok || !body.map) throw new Error(body.error || "The token could not be moved.");
    setMap(body.map);
    const previous = map.tokens.find(token => token.id === drag.tokenId);
    const moved = body.map.tokens.find(token => token.id === drag.tokenId);
    if (previous && moved && (drag.x !== moved.x || drag.y !== moved.y)) {
      recordMapEdit({ kind: "token-move", mapId: map.id,
        before: { ...previous, x: drag.x, y: drag.y }, after: moved, currentId: moved.id });
    }
    publishMapInvalidation("tokens"); } catch (moveError) { setError(moveError instanceof Error ? moveError.message : "The token could not be moved."); void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false); } finally { tokenMovePendingRef.current = false; setBusy(false); } }
  function handleTokenPointerEnd(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    tokenDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === "pointercancel") {
      // A canceled pointer is not a drop. Never send its provisional position to the server.
      drag.element.setAttribute("transform", `translate(${drag.x} ${drag.y})`);
      setMap(current => current ? { ...current, tokens: current.tokens.map(token =>
        token.id === drag.tokenId ? { ...token, x: drag.x, y: drag.y } : token
      ) } : current);
      setTokenDragMeasurement(null);
      setTokenDragOrigin(null);
      window.requestAnimationFrame(() => updateInspectorAnchorRef.current?.());
      return;
    }
    setMap(current => current ? { ...current, tokens: current.tokens.map(token => token.id === drag.tokenId ? { ...token, x: drag.latestX, y: drag.latestY } : token) } : current);
    setTokenDragMeasurement(null);
    setTokenDragOrigin(null);
    // Reconcile the inspector after React has committed the final token position.
    window.requestAnimationFrame(() => updateInspectorAnchorRef.current?.());
    if (Math.abs(drag.latestX - drag.x) > 0.01 || Math.abs(drag.latestY - drag.y) > 0.01)
      void persistTokenMove(drag);
  }

  async function tokenAction(body: Record<string, unknown>) { if (!map) return null; setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, mapId: map.id }) }); const result = await response.json() as MapResponse; if (!response.ok || !result.map) throw new Error(result.error || "The map token could not be updated."); setMap(result.map); setTokenSizes(current => Object.fromEntries(Object.entries(current).filter(([tokenId]) => result.map?.tokens.some(token => token.id === tokenId)))); publishMapInvalidation(); return result.map; } catch (tokenError) { setError(tokenError instanceof Error ? tokenError.message : "The map token could not be updated."); return null; } finally { setBusy(false); } }
  async function resizeToken(token: CampaignMapToken, nextSize: number) { if (!map) return; const sizeCells = clampTokenSizeCells(nextSize); if (sizeCells === (tokenSizes[token.id] ?? 1)) return; setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "resize", mapId: map.id, tokenId: token.id, sizeCells }) }); const body = await response.json() as InteractionResponse; if (!response.ok || !body.interactions || !body.token) throw new Error(body.error || "The token could not be resized."); setSnapToGrid(body.interactions.snapEnabled); setTokenSizes(body.interactions.tokenSizes); setMap(current => current ? { ...current, tokens: current.tokens.map(candidate => candidate.id === body.token?.id ? { ...candidate, x: body.token.x, y: body.token.y, version: body.token.version } : candidate) } : current); publishMapInvalidation("tokens"); } catch (resizeError) { setError(resizeError instanceof Error ? resizeError.message : "The token could not be resized."); void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false); } finally { setBusy(false); } }
  async function mapAction(body: Record<string, unknown>, preserveView = true) { setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as MapResponse; if (!response.ok) throw new Error(result.error || "The campaign map could not be updated."); applyResponse(result, preserveView); if (result.map) await loadInteractions(result.map.id); else { setSnapToGrid(false); setTokenSizes({}); } publishMapInvalidation(); return result; } catch (mapError) { setError(mapError instanceof Error ? mapError.message : "The campaign map could not be updated."); return null; } finally { setBusy(false); } }
  async function autoAlignGrid() {
    if (!map?.backgroundUrl || !map.backgroundWidth || !map.backgroundHeight
      || grid.type !== "square" || autoAlignBusy || busy) return;
    const mapId = map.id;
    setAutoAlignBusy(true);
    setAutoAlignNotice("Analyzing square grid lines in the uploaded image…");
    try {
      const response = await fetch(map.backgroundUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the map image for analysis.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        let estimate: SquareGridEstimate | null;
        try {
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) throw new Error("This browser cannot analyze map images.");
          ctx.drawImage(image, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          estimate = detectSquareGrid(pixels, width, height, image.naturalWidth, image.naturalHeight);
        } finally {
          // Release the pixel buffer immediately instead of retaining it until
          // the next garbage collection (particularly costly on mobile Safari).
          canvas.width = 0;
          canvas.height = 0;
        }
        if (selectedMapIdRef.current !== mapId) return;
        if (!estimate) {
          setAutoAlignNotice("Could not confidently detect a square grid. Nothing changed; adjust alignment manually.");
          return;
        }
        setGrid(current => ({ ...current, type: "square", size: estimate.size,
          offsetX: estimate.offsetX, offsetY: estimate.offsetY }));
        setAutoAlignDetected(estimate);
        setAutoAlignSubdivision(1);
        setAutoAlignPreview(true);
        setAutoAlignNotice(`${estimate.confidence === "high" ? "Strong" : "Possible"} match: ${estimate.size}px squares. Check the turquoise overlay, adjust if needed, then Save alignment.`);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (caught) {
      if (selectedMapIdRef.current === mapId) setAutoAlignNotice(
        caught instanceof Error ? caught.message : "Unable to analyze the map image.");
    } finally {
      setAutoAlignBusy(false);
    }
  }

  function setDetectedGridSubdivision(count: number) {
    if (!autoAlignDetected || !autoAlignPreview) return;
    const size = subdividedDetectedGridSize(autoAlignDetected.size, count);
    if (size === null) return;
    // The detected X/Y origins anchor a large printed square. Keeping those
    // origins places each finer line on a subdivision of that same lattice.
    setGrid(current => ({ ...current, size }));
    setAutoAlignSubdivision(count);
  }

  async function saveGrid() { if (!map) return; setBusy(true); setError(""); try { const response = await fetch(`/api/campaigns/${campaignId}/map`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mapId: map.id, version: map.version, gridEnabled: grid.enabled, gridType: grid.type, gridSize: Number(grid.size), gridOffsetX: Number(grid.offsetX), gridOffsetY: Number(grid.offsetY) }) }); const body = await response.json() as MapResponse; if (!response.ok || !body.map) throw new Error(body.error || "The grid settings could not be saved."); applyResponse(body, true); const interactionResponse = await fetch(`/api/campaigns/${campaignId}/map/interactions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_snap", mapId: body.map.id, enabled: snapToGrid }) }); const interactionBody = await interactionResponse.json() as InteractionResponse; if (!interactionResponse.ok || !interactionBody.interactions) throw new Error(interactionBody.error || "The grid snapping setting could not be saved."); setSnapToGrid(interactionBody.interactions.snapEnabled); setTokenSizes(interactionBody.interactions.tokenSizes); setAutoAlignPreview(false); setAutoAlignDetected(null); setAutoAlignSubdivision(1); setAutoAlignNotice(""); publishMapInvalidation(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The grid settings could not be saved."); } finally { setBusy(false); } }
  async function uploadNewMap(event: ChangeEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; setBusy(true); setError(""); try { const params = new URLSearchParams({ name: filenameMapName(file.name) }); const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, { method: "POST", headers: { "content-type": file.type }, body: file }); const body = await response.json() as MapResponse; if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be uploaded."); applyResponse(body, false); await loadInteractions(body.map.id); setSettingsOpen(true); publishMapInvalidation(); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "The map image could not be uploaded."); } finally { setBusy(false); } }
  async function replaceBackground(event: ChangeEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file || !map) return; setBusy(true); setError(""); try { const params = new URLSearchParams({ mapId: map.id }); const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, { method: "POST", headers: { "content-type": file.type, "x-campaign-map-version": String(map.version) }, body: file }); const body = await response.json() as MapResponse; if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be uploaded."); applyResponse(body, false); publishMapInvalidation(); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "The map image could not be uploaded."); } finally { setBusy(false); } }
  async function removeBackground() { if (!map?.backgroundUrl || !window.confirm(`Remove the image from “${map.name}”? Grid settings and token placements will be kept.`)) return; setBusy(true); setError(""); try { const params = new URLSearchParams({ mapId: map.id }); const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, { method: "DELETE", headers: { "x-campaign-map-version": String(map.version) } }); const body = await response.json() as MapResponse; if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be removed."); applyResponse(body, false); publishMapInvalidation(); } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "The map image could not be removed."); } finally { setBusy(false); } }
  async function togglePlayerPreview() {
    if (!canManage || busy || loading) return;
    annotations.stopDrawing(); areaTemplates.close();
    annotations.selectAnnotation(null); areaTemplates.selectTemplate(null); setSelectedTokenId(null);
    setAddOpen(false); setFogMode(null); clearFogPreview(); stopMeasuring(); setSettingsOpen(false);
    if (playerPreview) {
      playerPreviewRef.current = false;
      setPlayerPreview(false);
      const previous = gmMapBeforePreviewRef.current;
      gmMapBeforePreviewRef.current = null;
      if (previous && previous !== map?.id) await loadMap(false, previous);
      return;
    }
    const active = maps.find(candidate => candidate.isActive);
    const previous = map?.id ?? null;
    // Only preview the map shared with players; never activate a map here.
    if (active && active.id !== map?.id && !(await loadMap(false, active.id))) return;
    gmMapBeforePreviewRef.current = previous;
    playerPreviewRef.current = true;
    setPlayerPreview(true);
  }

  async function selectMap(mapId: string) {
    if (mapId === map?.id || !canManage || playerPreview || busy) return;
    editHistoryRef.current = { mapId, undo: [], redo: [] };
    setKeyboardFeedback("");
    annotations.stopDrawing();
    areaTemplates.close();
    annotations.selectAnnotation(null);
    areaTemplates.selectTemplate(null);
    setSelectedTokenId(null);
    setAddOpen(false);
    setFogMode(null);
    stopMeasuring();
    await loadMap(false, mapId);
  }
  async function renameMap() { if (!map || mapNameDraft.trim() === map.name) return; await mapAction({ action: "rename", mapId: map.id, version: map.version, name: mapNameDraft.trim() }); }
  async function showToPlayers() { if (!map || map.isActive) return; await mapAction({ action: "activate", mapId: map.id }); }
  function selectedEditableObject(): MapHistoryEdit | null {
    if (!map) return null;
    if (annotations.selected?.canEdit)
      return { kind: "annotation", mapId: map.id, before: annotations.selected, after: null, currentId: annotations.selected.id };
    if (areaTemplates.selected?.canEdit)
      return { kind: "area", mapId: map.id, before: areaTemplates.selected, after: null, currentId: areaTemplates.selected.id };
    return null;
  }

  async function postKeyboardEdit<T extends { error?: string }>(kind: "annotations" | "templates" | "tokens", body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`/api/campaigns/${campaignId}/map/${kind}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json() as T;
    if (!response.ok) throw new Error(result.error || "Unable to save the map edit.");
    return result;
  }

  async function replayMapEdit(entry: MapHistoryEdit, direction: "before" | "after") {
    if (!map || entry.mapId !== map.id) throw new Error("The history belongs to a different map.");
    if (entry.kind === "token-move") {
      const current = map.tokens.find(token => token.id === entry.currentId);
      if (!current?.canMove) throw new Error("That token is no longer movable.");
      const position = entry[direction];
      const result = await postKeyboardEdit<{ map?: CampaignMapPayload; error?: string }>("tokens", {
        action: "move", mapId: map.id, tokenId: current.id, version: current.version,
        x: position.x, y: position.y,
      });
      if (!result.map) throw new Error("Token movement could not be restored.");
      setMap(result.map);
    } else {
      const saved = entry[direction];
      const category = entry.kind === "annotation" ? "annotations" : "templates";
      let payload: Record<string, unknown>;
      if (!saved) {
        if (!entry.currentId) return;
        payload = { action: "delete", mapId: map.id,
          [entry.kind === "annotation" ? "annotationId" : "templateId"]: entry.currentId };
      } else if (entry.kind === "annotation") {
        const annotation = saved as CampaignMapAnnotation;
        payload = { action: entry.currentId ? "update" : "create", mapId: map.id,
          ...(entry.currentId ? { annotationId: entry.currentId } : { kind: annotation.kind, visibility: annotation.visibility }),
          geometry: annotation.geometry, color: annotation.color };
      } else {
        const area = saved as CampaignMapAreaTemplate;
        payload = { action: entry.currentId ? "update" : "create", mapId: map.id,
          ...(entry.currentId ? { templateId: entry.currentId } : {}),
          shape: area.shape, x: area.x, y: area.y, sizeSpaces: area.sizeSpaces,
          widthSpaces: area.widthSpaces, tipFlip: area.tipFlip, angleDegrees: area.angleDegrees,
          color: area.color, motionEffect: area.motionEffect };
      }
      const result = await postKeyboardEdit<{ annotation?: CampaignMapAnnotation; template?: CampaignMapAreaTemplate; error?: string }>(category, payload);
      entry.currentId = saved ? (result.annotation?.id ?? result.template?.id ?? entry.currentId) : null;
      annotations.selectAnnotation(null);
      areaTemplates.selectTemplate(null);
      window.dispatchEvent(new CustomEvent(campaignMapChangedEvent, { detail: { campaignId } }));
    }
    publishMapInvalidation();
  }

  async function runMapKeyboardCommand(command: "copy" | "cut" | "paste" | "undo" | "redo" | "delete") {
    if (!map || loading || busy || annotations.busy || areaTemplates.busy || editInProgressRef.current) return;
    const selected = selectedEditableObject();
    if (command === "copy" || command === "cut") {
      if (!selected || !selected.before || selected.kind === "token-move") {
        setKeyboardFeedback("Select an editable drawing or spell area.");
        return;
      }
      editClipboardRef.current = selected.kind === "annotation"
        ? { kind: "annotation", object: selected.before, copies: 0 }
        : { kind: "area", object: selected.before, copies: 0 };
      if (command === "copy") {
        setKeyboardFeedback("Copied map object.");
        return;
      }
    }
    if (editHistoryRef.current.mapId !== map.id)
      editHistoryRef.current = { mapId: map.id, undo: [], redo: [] };
    const history = editHistoryRef.current;
    let entry: MapHistoryEdit | null = null;
    if (command === "undo") entry = history.undo.at(-1) ?? null;
    else if (command === "redo") entry = history.redo.at(-1) ?? null;
    else if (command === "cut" || command === "delete") entry = selected;
    else if (command === "paste") {
      const clipboard = editClipboardRef.current;
      if (!clipboard || !map.backgroundWidth || !map.backgroundHeight) {
        setKeyboardFeedback("Copy a drawing or spell area first.");
        return;
      }
      const offset = (clipboard.copies + 1) * (clipboard.kind === "area" ? map.grid.size : 16);
      if (clipboard.kind === "annotation") {
        const geometry = translateCampaignMapAnnotationGeometry(clipboard.object.geometry, offset, offset, map.backgroundWidth, map.backgroundHeight);
        if (!geometry) { setKeyboardFeedback("No room to paste on this map."); return; }
        entry = { kind: "annotation", mapId: map.id, before: null,
          after: { ...clipboard.object, geometry }, currentId: null };
      } else {
        entry = { kind: "area", mapId: map.id, before: null, after: {
          ...clipboard.object,
          x: Math.min(map.backgroundWidth, clipboard.object.x + offset),
          y: Math.min(map.backgroundHeight, clipboard.object.y + offset),
        }, currentId: null };
      }
    }
    if (!entry) {
      if (command === "delete" && selectedTokenId && canManage) {
        if (!window.confirm("Remove this token? This action cannot yet be undone.")) return;
        const removed = await tokenAction({ action: "remove", tokenId: selectedTokenId });
        if (removed) { setSelectedTokenId(null); setKeyboardFeedback("Removed token."); }
      } else setKeyboardFeedback(command === "undo" || command === "redo"
        ? "Nothing to " + command + "." : "Select an editable drawing or spell area.");
      return;
    }
    editInProgressRef.current = true;
    try {
      await replayMapEdit(entry, command === "undo" ? "before" : command === "redo" || command === "paste" ? "after" : "after");
      if (command === "undo") { history.undo.pop(); history.redo.push(entry); }
      else if (command === "redo") { history.redo.pop(); history.undo.push(entry); }
      else {
        recordMapEdit(entry);
        if (command === "paste" && editClipboardRef.current) editClipboardRef.current.copies++;
      }
      setKeyboardFeedback(command === "undo" ? "Undone." : command === "redo" ? "Redone." :
        command === "paste" ? "Pasted object." : command === "cut" ? "Cut object." : "Deleted object.");
    } catch (editError) {
      setKeyboardFeedback(editError instanceof Error ? editError.message : "Unable to save the change.");
    } finally { editInProgressRef.current = false; }
  }

  useEffect(() => {
    if (!open || playerPreview) return;
    const keyWindow = drawerElementRef.current?.ownerDocument.defaultView ?? window;
    const keyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (!target || !drawerElementRef.current?.contains(target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      let command: "copy" | "cut" | "paste" | "undo" | "redo" | "delete" | null = null;
      if (modifier && !event.altKey) {
        if (key === "c" && !event.shiftKey) command = "copy";
        if (key === "x" && !event.shiftKey) command = "cut";
        if (key === "v" && !event.shiftKey) command = "paste";
        if (key === "z") command = event.shiftKey ? "redo" : "undo";
        if (key === "y") command = "redo";
      } else if (!modifier && !event.altKey && (key === "delete" || key === "backspace"))
        command = "delete";
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      void runMapKeyboardCommand(command);
    };
    keyWindow.addEventListener("keydown", keyDown);
    return () => keyWindow.removeEventListener("keydown", keyDown);
  }, [open, pipDocument, map, annotations, areaTemplates, busy, canManage, playerPreview, loading, selectedTokenId, campaignId]);

  async function deleteMap() { if (!map || !window.confirm(`Delete “${map.name}” and all of its token placements? This cannot be undone.`)) return; await mapAction({ action: "delete", mapId: map.id }, false); }

  // Keep the contextual editing bar next to the actual selected SVG object.
  useEffect(() => {
    if (!open || (!annotations.selected && !areaTemplates.selected && !selectedTokenId)) return;
    const updateAnchor = () => {
      const stage = stageRef.current;
      const svg = svgRef.current;
      if (!stage || !svg) return;
      const target = svg.querySelector<SVGGElement>(
        areaTemplates.selected ? ".campaign-map-area-template.is-selected" :
        annotations.selected ? ".campaign-map-annotation-group.is-selected" :
        ".campaign-map-token.is-selected"
      );
      if (!target) { setInspectorAnchor(null); return; }
      const bounds = target.getBoundingClientRect();
      const stageBounds = stage.getBoundingClientRect();
      const barWidth = Math.min(inspectorRef.current?.offsetWidth ?? 440, Math.max(0, stageBounds.width - 16));
      const half = barWidth / 2 + 8;
      const center = bounds.left + bounds.width / 2 - stageBounds.left;
      const left = stageBounds.width > barWidth + 16
        ? Math.max(half, Math.min(stageBounds.width - half, center))
        : stageBounds.width / 2;
      const above = bounds.top - stageBounds.top - 12;
      const below = above < 132;
      const top = below ? bounds.bottom - stageBounds.top + 12 : above;
      setInspectorAnchor(previous =>
        previous && Math.abs(previous.left - left) < 1 && Math.abs(previous.top - top) < 1 && previous.below === below
          ? previous : { left, top, below });
    };
    updateInspectorAnchorRef.current = updateAnchor;
    const frame = window.requestAnimationFrame(updateAnchor);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateAnchor) : null;
    if (stageRef.current) observer?.observe(stageRef.current);
    window.addEventListener("resize", updateAnchor);
    return () => {
      if (updateInspectorAnchorRef.current === updateAnchor) updateInspectorAnchorRef.current = null;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateAnchor);
    };
  }, [open, annotations.selected, areaTemplates.selected, selectedTokenId, view, presentation, settingsOpen, drawerWidth, map?.id]);

  const placedCharacterIds = new Set(map?.tokens.filter(token => token.kind === "pc").map(token => token.sourceId) ?? []);
  const placedCompanionIds = new Set(map?.tokens.filter(token => token.kind === "companion").map(token => token.sourceId) ?? []);
  const inPageHost = presentation !== "pip" && presentation !== "standalone" && presentation !== "closed";

  const previewHasNoSharedMap = playerPreview && !map?.isActive;
  const showAutoAlignOverlay = !playerPreview && autoAlignPreview && settingsOpen && editSection === "grid"
    && grid.type === "square" && Boolean(map?.backgroundUrl);
  const autoGridPatternId = `${patternId}-auto-align`;
  const mapSurface = (open || closingDrawer) ? <section ref={drawerElementRef} className={`campaign-map-dialog campaign-map-host-${open ? presentation : "drawer"}${(presentation === "drawer" || closingDrawer) ? ` campaign-map-drawer-${drawerDock}` : ""}${closingDrawer && !open ? " campaign-map-drawer-exiting" : ""}`} role="dialog" aria-modal={presentation === "fullscreen"} aria-labelledby="campaign-map-title" style={(presentation === "drawer" || closingDrawer) ? { "--campaign-map-drawer-width": `${drawerWidth}px` } as CSSProperties : undefined}>
    {presentation === "drawer" && <div className="campaign-map-drawer-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize map side drawer" onPointerDown={handleDrawerResizeStart} onPointerMove={handleDrawerResizeMove} onPointerUp={handleDrawerResizeEnd} onPointerCancel={handleDrawerResizeEnd} />}
    <header ref={mapToolbarRef} className="campaign-map-toolbar" aria-label="Campaign map tools">
      <div className="campaign-map-toolbar-primary">
        <div className="campaign-map-title-block">
          {canManage && !playerPreview && maps.length > 0 ? <label id="campaign-map-title" className="campaign-map-picker">
            <span className="sr-only">Current campaign map</span>
            <select aria-label="Current campaign map" value={map?.id ?? ""}
              disabled={busy || loading} onChange={event => void selectMap(event.target.value)}>
              {maps.map(candidate => <option key={candidate.id} value={candidate.id}>
                {candidate.name}{candidate.isActive ? " · Visible" : ""}
              </option>)}
            </select>
          </label> : <h2 id="campaign-map-title">{map?.name ?? campaignName}</h2>}
          {canManage && playerPreview ? <span className="campaign-map-sharing is-visible">Player preview · read-only</span>
           : canManage && map ? map.isActive
            ? <span className="campaign-map-sharing is-visible" title="Players currently see this map">◉ Visible to players</span>
            : <button type="button" className="campaign-map-share-button"
                disabled={busy || loading} onClick={() => void showToPlayers()}
                title="Make this the map your players see">Show to players</button>
            : map && <span className="campaign-map-sharing is-visible">Visible to players</span>}
        </div>
      </div>
      <div className="campaign-map-toolbar-actions">
        {map && <div className="campaign-map-quick-actions">
          {canManage && <button type="button" className={`campaign-secondary campaign-map-view-toggle${playerPreview ? " is-active" : ""}`}
            aria-pressed={playerPreview} aria-label={playerPreview ? "Return to GM View" : "Preview Player View"}
            title={playerPreview ? "Return to your GM map" : "Preview the map shared with players"}
            disabled={busy || loading} onClick={() => void togglePlayerPreview()}>
            {playerPreview ? "GM View" : "Player View"}
          </button>}
          {!playerPreview && <>
          {map.backgroundUrl && <div className="campaign-map-menu-wrap">
            <button type="button" className="campaign-primary" aria-expanded={addOpen} onClick={() => setAddOpen(current => !current)}>+ Add</button>
            {addOpen && <div className="campaign-map-popover" role="menu" aria-label="Add map object">
              {(["freehand","line","arrow","rect","circle","text"] as const).map(kind => <button type="button" role="menuitem" key={kind} onClick={() => {
                areaTemplates.close(); setFogMode(null); setMeasureEnabled(false); setMeasureStart(null);
                annotations.setTool(kind); setAddOpen(false);
              }}>{kind === "freehand" ? "Pen" : kind === "rect" ? "Rectangle" : kind === "text" ? "Note / Label" : kind[0].toUpperCase()+kind.slice(1)}</button>)}
              <button type="button" role="menuitem" onClick={() => {
                annotations.stopDrawing(); setFogMode(null); setMeasureEnabled(false); setMeasureStart(null);
                areaTemplates.setMode("place"); if (!areaTemplates.open) areaTemplates.toggle(); setAddOpen(false);
              }}>Spell Area</button>
              {canManage && <button type="button" role="menuitem" onClick={() => { setEditSection("tokens"); setSettingsOpen(true); setAddOpen(false); }}>Add Tokens…</button>}
            </div>}
          </div>}
          {canManage && map.backgroundUrl && <div className="campaign-map-menu-wrap">
            <button type="button" className={fogMode ? "campaign-secondary is-active" : "campaign-secondary"} aria-expanded={Boolean(fogMode)} onClick={() => {
              annotations.stopDrawing(); areaTemplates.close(); setMeasureEnabled(false); setMeasureStart(null);
              setFogMode(current => current ? null : "hide"); clearFogPreview();
            }}>Fog</button>
            {fogMode && <div className="campaign-map-popover" role="group" aria-label="Fog actions">
              <button type="button" className={fogMode === "hide" ? "is-active" : ""} onClick={() => setFogMode("hide")}>Hide</button>
              <button type="button" className={fogMode === "reveal" ? "is-active" : ""} onClick={() => setFogMode("reveal")}>Reveal</button>
              <button type="button" onClick={() => { setFogMode(null); clearFogPreview(); }}>Done</button>
            </div>}
          </div>}
          {map.backgroundUrl && <button type="button"
            className={measureEnabled ? "campaign-secondary is-active" : "campaign-secondary"}
            aria-pressed={measureEnabled}
            aria-label={measureEnabled ? "Turn off measuring" : "Start measuring"}
            title={measureEnabled ? "Click to turn off measuring" : "Measure a distance on the map"}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => { event.stopPropagation(); toggleMeasuring(); }}
          >Measure</button>}
          <CampaignMapSharedDice campaignId={campaignId} open={open} canManage={canManage} />
          {canManage && <button type="button"
            className={`campaign-map-edit-button campaign-secondary${settingsOpen ? " is-active" : ""}`}
            aria-expanded={settingsOpen}
            aria-controls="campaign-map-settings"
            onClick={() => { setAddOpen(false); setEditSection("maps"); setSettingsOpen(current => !current); }}>
            Edit Map
          </button>}
          </>}
        </div>}
      </div></header>
    {error && <div className="campaign-error campaign-map-error" role="alert">{error}</div>}
    <div className={`campaign-map-workspace${settingsOpen && canManage ? " settings-open" : ""}`}><div ref={stageRef} className="campaign-map-stage" tabIndex={-1} aria-busy={loading || busy || annotations.busy || areaTemplates.busy}>{loading && <div className="campaign-map-empty" role="status">Loading campaign map…</div>}
       {playerPreview && !loading && <div className="campaign-map-preview-label" role="status">Player View · Read-only preview</div>}
       {!loading && (previewHasNoSharedMap || !map?.backgroundUrl) && <div className="campaign-map-empty"><h3>{previewHasNoSharedMap ? "No map shared with players" : map ? "No map image" : "No campaign maps yet"}</h3><p>{previewHasNoSharedMap ? "Switch to GM View and choose Show to players to share a map." : canManage ? "Open Edit Map to upload a new map." : "The GM has not shared a campaign map yet."}</p></div>}
      {!playerPreview && map?.backgroundUrl && <CampaignMapDrawingPalette controller={annotations} />}
      {!playerPreview && map?.backgroundUrl && <CampaignMapAreaTemplatePalette controller={areaTemplates} grid={map.grid} />}
      {!loading && !previewHasNoSharedMap && map?.backgroundUrl && map.backgroundWidth && map.backgroundHeight && view && <svg ref={svgRef} className={`campaign-map-svg${annotations.tool ? ` is-drawing is-${annotations.tool}` : ""}${areaTemplates.open ? " is-area-template-mode" : ""}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDownCapture={handleTouchPointerDownCapture} onPointerMoveCapture={handleTouchPointerMoveCapture} onPointerUpCapture={handleTouchPointerEndCapture} onPointerCancelCapture={handleTouchPointerEndCapture} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} aria-label="Campaign map. Drag to pan, pinch with two fingers to zoom, drag an allowed token to move it, or use the mouse wheel and zoom buttons.">
        <defs>{map.grid.type === "hex" ? (() => { const pattern = hexPatternSize(map.grid.size); return <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={pattern.width} height={pattern.height}>{hexPatternPaths(map.grid.size).map((path, index) => <path key={index} d={path} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />)}</pattern>; })() : <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={map.grid.size} height={map.grid.size}><path d={`M ${map.grid.size} 0 L 0 0 0 ${map.grid.size}`} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" /></pattern>}{showAutoAlignOverlay && <pattern id={autoGridPatternId} patternUnits="userSpaceOnUse"
          x={grid.offsetX} y={grid.offsetY} width={grid.size} height={grid.size}>
          <path d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`} fill="none" stroke="#4df0e0"
            strokeWidth="1.8" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        </pattern>}</defs>
        <image href={map.backgroundUrl} x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} preserveAspectRatio="none" />{!showAutoAlignOverlay && map.grid.enabled && <rect x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} fill={`url(#${patternId})`} pointerEvents="none" />}
        {showAutoAlignOverlay && <rect x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight}
          fill={`url(#${autoGridPatternId})`} pointerEvents="none" aria-label="Grid auto-alignment preview" />}
        {(!canManage || playerPreview) && <CampaignMapAnnotationLayer controller={annotations} playerPreview={playerPreview} interactionEnabled={!playerPreview && !fogMode && !measureEnabled && !areaTemplates.open} onSelect={() => { stageRef.current?.focus({ preventScroll: true }); areaTemplates.selectTemplate(null); setSelectedTokenId(null); }} />}
        <CampaignMapFogLayer cells={map.fogCells} grid={map.grid} previewLayerRef={fogPreviewLayerRef} />
        {canManage && !playerPreview && <CampaignMapAnnotationLayer controller={annotations} interactionEnabled={!fogMode && !measureEnabled && !areaTemplates.open} onSelect={() => { stageRef.current?.focus({ preventScroll: true }); areaTemplates.selectTemplate(null); setSelectedTokenId(null); }} />}
        <CampaignMapAreaTemplateLayer controller={areaTemplates} grid={map.grid} width={map.backgroundWidth} height={map.backgroundHeight} previewOnly={playerPreview} interactionEnabled={!playerPreview && !fogMode && !measureEnabled && !annotations.tool && !areaTemplates.open} onSelect={() => { stageRef.current?.focus({ preventScroll: true }); annotations.selectAnnotation(null); setSelectedTokenId(null); }} />
        {measureStart && measureEnd && <g className="campaign-map-measure-layer" pointerEvents="none">
          <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} stroke="#f4cd75" strokeWidth="3" strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
          <text className="campaign-map-measure-text" x={(measureStart.x + measureEnd.x)/2} y={(measureStart.y + measureEnd.y)/2-12} textAnchor="middle">{gridMovementDistanceLabel(measureStart.x,measureStart.y,measureEnd.x,measureEnd.y,map.grid)}</text>
        </g>}
        <g className="campaign-map-token-layer">{!playerPreview && tokenDragOrigin && (() => { const token = map.tokens.find(candidate => candidate.id === tokenDragOrigin.tokenId); if (!token || (Math.abs(token.x - tokenDragOrigin.x) < 0.01 && Math.abs(token.y - tokenDragOrigin.y) < 0.01)) return null; const sizeCells = tokenSizes[token.id] ?? 1; const tokenVisualRadius = gridTokenRadius(map.grid.size, sizeCells); return <g className={`campaign-map-token campaign-map-token-${token.kind} campaign-map-token-drag-origin`} transform={`translate(${tokenDragOrigin.x} ${tokenDragOrigin.y})`} opacity={0.5} pointerEvents="none" aria-hidden="true"><circle r={tokenVisualRadius} className="campaign-map-token-disc" vectorEffect="non-scaling-stroke" /><text className="campaign-map-token-initials" textAnchor="middle" dominantBaseline="central" fontSize={tokenVisualRadius * 0.72}>{tokenInitials(token.name)}</text><text className="campaign-map-token-name" textAnchor="middle" y={tokenVisualRadius + Math.max(12, tokenVisualRadius * 0.48)} fontSize={Math.max(11, tokenVisualRadius * 0.42)}>{token.name}</text></g>; })()}
          {map.tokens.map(token => { const sizeCells = tokenSizes[token.id] ?? 1; const tokenVisualRadius = gridTokenRadius(map.grid.size, sizeCells); return <g key={token.id} className={`campaign-map-token campaign-map-token-${token.kind}${!playerPreview && token.canMove ? " is-movable" : ""}${!playerPreview && selectedTokenId === token.id ? " is-selected" : ""}`} transform={`translate(${token.x} ${token.y})`} onPointerDown={playerPreview ? undefined : event => handleTokenPointerDown(event, token)}
             onPointerMove={playerPreview ? undefined : handleTokenPointerMove}
             onPointerUp={playerPreview ? undefined : handleTokenPointerEnd}
             onPointerCancel={playerPreview ? undefined : handleTokenPointerEnd} role="img" aria-label={`${token.name} ${tokenAriaKind(token.kind)} token, ${sizeCells} by ${sizeCells} grid cells${!playerPreview && token.canMove ? ", draggable" : ""}`}><MapTokenArtwork name={token.name} radius={tokenVisualRadius} distance={tokenDragMeasurement?.tokenId === token.id ? tokenDragMeasurement.distance : undefined} /></g>; })}</g>
      </svg>}
        <div className="campaign-map-viewport-tools" role="group" aria-label="Map view and window controls">
          {map?.backgroundUrl && <>
            <button type="button" className="campaign-quiet" onClick={() => zoom(1.2)} aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" className="campaign-quiet" onClick={() => zoom(0.82)} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" className="campaign-quiet" onClick={resetView} title="Fit map to view">Fit</button>
          </>}
          {inPageHost && <label className="campaign-map-presentation-picker"><span className="sr-only">Map display</span>
            <select aria-label="Map display" value={workspace.inPagePresentation} onChange={event => handlePresentationSelect(event.target.value)}>
              <option value="fullscreen">Full screen</option><option value="drawer">Side drawer</option><option value="pip">Picture-in-Picture</option>
            </select>
          </label>}
          {presentation === "drawer" && <div className="campaign-map-dock-control" role="group" aria-label="Side drawer position">
            <button type="button" className={`campaign-quiet${drawerDock === "left" ? " is-active" : ""}`} aria-pressed={drawerDock === "left"} onClick={() => chooseDrawerDock("left")}>Left</button>
            <button type="button" className={`campaign-quiet${drawerDock === "right" ? " is-active" : ""}`} aria-pressed={drawerDock === "right"} onClick={() => chooseDrawerDock("right")}>Right</button>
          </div>}
          {presentation === "pip" && <button type="button" className="campaign-quiet" onClick={returnFromPictureInPicture}>Return</button>}
          {presentation !== "drawer" && <button type="button" className="campaign-quiet campaign-map-close-button"
            onClick={closeMap} aria-label={presentation === "standalone" ? "Close map window" : "Close map"} title="Close map">✕</button>}
        </div></div>
      {!playerPreview && map && !annotations.tool && !areaTemplates.open &&
        (annotations.selected || areaTemplates.selected || (selectedTokenId && map.tokens.some(token => token.id === selectedTokenId))) &&
        <aside ref={inspectorRef}
          className={`campaign-map-object-inspector campaign-map-context-bar${inspectorAnchor?.below ? " is-below" : ""}`}
          aria-label="Selected map object controls"
          style={inspectorAnchor ? { left: inspectorAnchor.left, top: inspectorAnchor.top, visibility: "visible" } : { visibility: "hidden" }}>
          {areaTemplates.selected && <CampaignMapAreaTemplateInspector controller={areaTemplates} grid={map.grid} />}
          {annotations.selected && <div className="campaign-map-context-actions">
            <strong className="campaign-map-context-name">{annotations.selected.geometry.kind === "text" ? "Label" : annotations.selected.kind}</strong>
            {annotations.selected.geometry.kind === "text" && <>
              <input className="campaign-map-context-text" type="text" key={annotations.selected.id}
                aria-label="Selected label text" maxLength={120} defaultValue={annotations.selected.geometry.text}
                onBlur={event => { if (event.target.value.trim()) void annotations.updateSelectedText(event.target.value); }}
                onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
              <label className="campaign-map-context-size"><span className="sr-only">Text size</span>
                <input type="number" min={8} max={200} step={1} aria-label="Label font size" value={annotations.textSize}
                  onChange={event => annotations.setTextSize(Number(event.target.value))}
                  onBlur={() => void annotations.commitTextSize()} /></label>
            </>}
            <span className="campaign-map-context-separator" aria-hidden="true" />
            <label className="campaign-map-context-swatch campaign-map-quick-tooltip" data-tooltip="Colour"><span className="sr-only">Colour</span>
              <input type="color" aria-label="Annotation colour" value={annotations.color}
                onChange={event => annotations.setColor(event.target.value)} /></label>
            <button type="button" className="campaign-map-quick-tooltip" data-tooltip="Duplicate" aria-label="Duplicate annotation"
              disabled={annotations.busy} onClick={() => void annotations.duplicateSelected()}><MapObjectActionIcon kind="duplicate" /></button>
            <button type="button" className="campaign-map-context-danger campaign-map-quick-tooltip" data-tooltip="Delete" aria-label="Delete annotation"
              disabled={annotations.busy} onClick={() => { if (annotations.selected) void annotations.eraseAnnotation(annotations.selected.id); }}><MapObjectActionIcon kind="delete" /></button>
            {annotations.error && <span className="campaign-map-context-error" role="alert">{annotations.error}</span>}
          </div>}
          {selectedTokenId && !annotations.selected && !areaTemplates.selected && map.tokens.filter(token => token.id === selectedTokenId).map(token =>
            <div className="campaign-map-context-actions" key={token.id}>
              <strong className="campaign-map-context-name">{token.name}</strong>
              <span className="campaign-map-context-kind">{tokenKindLabel(token.kind)}</span>
              {canManage && <>
                <span className="campaign-map-context-separator" aria-hidden="true" />
                <button type="button" title="Reduce token size" aria-label="Reduce token size"
                  disabled={busy || (tokenSizes[token.id] ?? 1) <= 1}
                  onClick={() => void resizeToken(token, (tokenSizes[token.id] ?? 1) - 1)}>−</button>
                <span className="campaign-map-context-value" title={`${tokenSizes[token.id] ?? 1}×${tokenSizes[token.id] ?? 1} grid spaces`}>{tokenFootprintSizeLabel(tokenSizes[token.id] ?? 1)}</span>
                <button type="button" title="Increase token size" aria-label="Increase token size"
                  disabled={busy || (tokenSizes[token.id] ?? 1) >= 12}
                  onClick={() => void resizeToken(token, (tokenSizes[token.id] ?? 1) + 1)}>+</button>
                <span className="campaign-map-context-separator" aria-hidden="true" />
                <button type="button" className="campaign-map-context-danger campaign-map-quick-tooltip" data-tooltip="Remove token" aria-label="Remove token"
                  disabled={busy} onClick={() => { void tokenAction({ action: "remove", tokenId: token.id }); setSelectedTokenId(null); }}><MapObjectActionIcon kind="delete" /></button>
              </>}
            </div>)}
          <button type="button" className="campaign-map-context-dismiss" onClick={() => {
            annotations.selectAnnotation(null); areaTemplates.selectTemplate(null); setSelectedTokenId(null);
          }} aria-label="Deselect map object" title="Deselect">✕</button>
        </aside>}
      {keyboardFeedback && <div className="campaign-map-keyboard-feedback" role="status">{keyboardFeedback}</div>}
      {settingsOpen && canManage && !playerPreview && <aside id="campaign-map-settings" className="campaign-map-settings" data-edit-section={editSection} aria-label="Edit map settings">
        <div className="campaign-map-settings-heading">
          <div><p className="campaign-kicker">MAP EDITOR</p><h3>Edit Map</h3></div>
          <button type="button" className="campaign-quiet campaign-map-edit-done" onClick={() => setSettingsOpen(false)}>Done</button>
        </div>
        <nav className="campaign-map-edit-tabs" aria-label="Map editor sections">
          {(["maps", "grid", "tokens"] as const).map(section => <button key={section} type="button"
            className={editSection === section ? "is-active" : ""}
            aria-pressed={editSection === section} onClick={() => setEditSection(section)}>
            {section === "maps" ? "Maps" : section === "grid" ? "Grid" : "Tokens"}
          </button>)}
        </nav>
        <div className="campaign-map-edit-intro" aria-live="polite">
          <strong>{editSection === "maps" ? "Manage maps" : editSection === "grid" ? "Grid & display" : "Manage tokens"}</strong>
          <span>{editSection === "maps" ? "Choose a map, then edit its details." : editSection === "grid" ? "Adjust the grid without changing the artwork." : "Place and manage tokens on this map."}</span>
        </div>
        {editSection === "maps" && <div className="campaign-map-edit-panel" role="region" aria-label="Maps settings">
          <section className="campaign-map-library">
            <div className="campaign-map-edit-section-heading"><h4>Available maps</h4><span className="campaign-map-edit-count">{maps.length}</span></div>
            <p>Choose a map to edit or upload another.</p>
            {maps.length > 0 && <div className="campaign-map-library-list">
              {maps.map(candidate => <button type="button" key={candidate.id}
                className={`campaign-map-library-item${candidate.id === map?.id ? " is-selected" : ""}`}
                disabled={busy} onClick={() => void selectMap(candidate.id)}>
                <span>{candidate.name}</span><small>{candidate.isActive ? "Visible" : "GM only"}</small>
              </button>)}
            </div>}
            <label className="campaign-map-upload campaign-secondary"><span>Upload New Map</span>
              <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={uploadNewMap} />
            </label>
          </section>
          {map && <>
            <section className="campaign-map-selected-controls">
              <h4>Selected map</h4>
              <div className="campaign-map-player-visibility" aria-label="Player visibility">
                <strong className="campaign-map-setting-label">Player Visibility</strong>
                {map.isActive
                  ? <div className="campaign-map-visible-status"><strong>Visible to players</strong><span>This is the map your players see.</span></div>
                  : <div className="campaign-map-hidden-status"><strong>GM only</strong><span>Only you can see this map until you share it.</span></div>}
                {!map.isActive && <button type="button" className="campaign-primary" disabled={busy}
                  onClick={() => void showToPlayers()}>Make Visible to Players</button>}
              </div>
              <div className="campaign-map-edit-name">
                <label><span>Map name</span><input type="text" maxLength={80} value={mapNameDraft}
                  onChange={event => setMapNameDraft(event.target.value)} /></label>
                <button type="button" className="campaign-secondary"
                  disabled={busy || !mapNameDraft.trim() || mapNameDraft.trim() === map.name}
                  onClick={() => void renameMap()}>Save Name</button>
              </div>
            </section>
            <section className="campaign-map-background-settings">
              <h4>Map artwork</h4>
              <p>JPG or PNG · up to 15 MB.</p>
              <label className="campaign-map-upload campaign-secondary">
                <span>{map.backgroundUrl ? "Replace image" : "Add map image"}</span>
                <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={replaceBackground} />
              </label>
              {map.backgroundUrl && <button type="button" className="campaign-secondary" disabled={busy}
                onClick={() => void removeBackground()}>Remove image</button>}
            </section>
          </>}
          <details className="campaign-map-maintenance">
            <summary>Advanced actions</summary>
            <div className="campaign-map-maintenance-content">
              <p>Destructive changes to this map and its annotations.</p>
              {map && <button type="button" className="campaign-danger" disabled={busy}
                onClick={() => void deleteMap()}>Delete Map…</button>}
              <button type="button" className="campaign-danger"
                disabled={annotations.busy || !annotations.annotations.length}
                onClick={() => void annotations.clearAnnotations()}>Clear all annotations…</button>
            </div>
          </details>
        </div>}
        {editSection === "grid" && <div className="campaign-map-edit-panel" role="region" aria-label="Grid settings">
          {map && <>
            <section className="campaign-map-table-controls">
              <h4>Display options</h4>
              <p>Control how the grid and token snapping behave at the table.</p>
              <label className="campaign-map-grid-toggle"><input type="checkbox" checked={grid.enabled}
                onChange={event => setGrid(current => ({ ...current, enabled: event.target.checked }))} />
                <span>Show grid</span></label>
              <label className="campaign-map-grid-toggle"><input type="checkbox" checked={snapToGrid}
                onChange={event => setSnapToGrid(event.target.checked)} /><span>Snap tokens to grid</span></label>
              <button type="button" className="campaign-primary" disabled={busy}
                onClick={() => void saveGrid()}>Save display options</button>
              {fogMode && <small>Drag across the map to {fogMode} whole {grid.type === "hex" ? "hexes" : "cells"}. Up to 500 cells at once.</small>}
            </section>
            <section className="campaign-map-grid-settings">
              <h4>Grid alignment</h4>
              <p>Match grid size and position to the map image.</p>
              <label><span>Grid type</span>
                <select value={grid.type} onChange={event => setGrid(current => ({ ...current, type: event.target.value as CampaignMapGridType }))}>
                  <option value="square">Square · 5 ft cells</option>
                  <option value="hex">Hex · 10 km per hex</option>
                </select>
              </label>
              <div className="campaign-map-auto-align">
                <button type="button" className="campaign-secondary"
                  disabled={busy || autoAlignBusy || !map.backgroundUrl || grid.type !== "square"}
                  onClick={() => void autoAlignGrid()}>{autoAlignBusy ? "Detecting grid…" : "Auto Align Grid"}</button>
                <small>{grid.type !== "square"
                  ? "Auto alignment currently supports square grids. Choose Square above."
                  : "Find lines already printed on the map. Review the preview before saving."}</small>
                {autoAlignNotice && <p className="campaign-map-auto-align-notice" role="status">{autoAlignNotice}</p>}
                {autoAlignPreview && autoAlignDetected && <>
                  <div className="campaign-map-auto-align-scale">
                    <label htmlFor="campaign-map-auto-grid-scale">Squares inside detected square</label>
                    <select id="campaign-map-auto-grid-scale" aria-label="Subdivide detected grid"
                      value={autoAlignSubdivision} disabled={busy || autoAlignBusy}
                      onChange={event => setDetectedGridSubdivision(Number(event.target.value))}>
                      {autoGridSubdivisionOptions.map(count =>
                        <option key={count} value={count}
                          disabled={subdividedDetectedGridSize(autoAlignDetected.size, count) === null}>
                          {count === 1 ? "1 × 1 · as detected" : `${count} × ${count} · smaller squares`}
                        </option>)}
                    </select>
                    <small>Detected: {autoAlignDetected.size}px square · Each preview cell: {grid.size}px.
                      If the detected square contains a 9 × 9 grid, choose 9 × 9.</small>
                  </div>
                  <button type="button" className="campaign-quiet"
                    onClick={() => { setGrid(gridFor(map)); setAutoAlignPreview(false);
                      setAutoAlignDetected(null); setAutoAlignSubdivision(1); setAutoAlignNotice(""); }}>
                    Discard preview
                  </button>
                </>}
              </div>
              <div className="campaign-map-grid-fields">
                <label><span>{grid.type === "hex" ? "Hex height" : "Cell size"}</span>
                  <input type="number" min="8" max={MAX_CAMPAIGN_MAP_GRID_SIZE} step="any" value={grid.size}
                    onChange={event => setGrid(current => ({ ...current, size: Number(event.target.value) }))} /></label>
                <label><span>Horizontal origin</span>
                  <input type="number" step="1" value={grid.offsetX}
                    onChange={event => setGrid(current => ({ ...current, offsetX: Number(event.target.value) }))} /></label>
                <label><span>Vertical origin</span>
                  <input type="number" step="1" value={grid.offsetY}
                    onChange={event => setGrid(current => ({ ...current, offsetY: Number(event.target.value) }))} /></label>
              </div>
              <small>Changing alignment does not move existing tokens.</small>
              <button type="button" className="campaign-primary" disabled={busy}
                onClick={() => void saveGrid()}>Save alignment</button>
            </section>
          </>}
        </div>}
        {editSection === "tokens" && <div className="campaign-map-edit-panel" role="region" aria-label="Token settings">
          {map && <>
            <section className="campaign-map-token-settings">
              <h4>Place tokens</h4>
              <p>Add characters, companions or everyone in a live encounter.</p>
              <button type="button" className="campaign-primary" disabled={busy || !map.backgroundUrl || !encounterAvailable}
                onClick={() => void tokenAction({ action: "place_encounter" })}>Place Active Encounter</button>
              {!encounterAvailable && <small>Start a live encounter to place all combatants together.</small>}
              {characters.length > 0 && <div className="campaign-map-token-group">
                <h5>Characters <span>{characters.length}</span></h5>
                <div className="campaign-map-character-tokens">{characters.map(character =>
                  <div key={character.id}><span>{character.name}</span>
                    {placedCharacterIds.has(character.id) ? <small>On map</small>
                      : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl}
                          onClick={() => void tokenAction({ action: "place_pc", characterId: character.id })}>Place</button>}
                  </div>)}</div>
              </div>}
              {companions.length > 0 && <div className="campaign-map-token-group">
                <h5>Companions <span>{companions.length}</span></h5>
                <div className="campaign-map-character-tokens campaign-map-companion-tokens">{companions.map(companion =>
                  <div key={companion.id}><span><b>{companion.name}</b><small>{companion.characterName} · {companion.label}</small></span>
                    {placedCompanionIds.has(companion.id) ? <small>On map</small>
                      : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl}
                          onClick={() => void tokenAction({ action: "place_companion", companionId: companion.id })}>Place</button>}
                  </div>)}</div>
              </div>}
            </section>
            <section className="campaign-map-placed-section">
              <div className="campaign-map-edit-section-heading"><h4>On this map</h4><span className="campaign-map-edit-count">{map.tokens.length}</span></div>
              {map.tokens.length > 0
                ? <div className="campaign-map-placed-tokens">{map.tokens.map(token => {
                    const sizeCells = tokenSizes[token.id] ?? 1;
                    return <div key={token.id}>
                      <span><b>{token.name}</b><small>{tokenKindLabel(token.kind)} · {tokenFootprintSizeLabel(sizeCells)}</small></span>
                      <div className="campaign-map-token-row-actions">
                        <button type="button" className="campaign-quiet" disabled={busy || sizeCells <= 1}
                          aria-label={`Make ${token.name} smaller`} onClick={() => void resizeToken(token, sizeCells - 1)}>−</button>
                        <button type="button" className="campaign-quiet" disabled={busy || sizeCells >= 12}
                          aria-label={`Make ${token.name} larger`} onClick={() => void resizeToken(token, sizeCells + 1)}>+</button>
                        <button type="button" className="campaign-quiet" disabled={busy}
                          onClick={() => void tokenAction({ action: "remove", tokenId: token.id })}>Remove</button>
                      </div>
                    </div>;
                  })}</div>
                : <p>No tokens placed on this map yet.</p>}
            </section>
          </>}
        </div>}
      </aside>}
    </div>
  </section> : null;

  const drawerCollapseControl = open && presentation === "drawer" ? <button type="button" className={`campaign-map-drawer-collapse campaign-map-drawer-collapse-${drawerDock}`} aria-label="Close map; drag horizontally to resize side drawer" aria-expanded="true" title="Click to close. Drag horizontally to resize the map drawer." onPointerDown={event => handleDrawerResizeStart(event, "collapse")} onPointerMove={handleDrawerResizeMove} onPointerUp={handleDrawerResizeEnd} onPointerCancel={handleDrawerResizeEnd} onClick={handleDrawerCollapseClick}><span className="campaign-map-drawer-collapse-label">Close Map</span></button> : null;
  return <>{showFloatingButton && !open && <button type="button" className={`campaign-map-collapsed-drawer campaign-map-collapsed-drawer-${drawerDock}`} aria-pressed={open} onClick={showMap}>Open Map</button>}{showFloatingButton && <button type="button" className="campaign-map-mobile-launcher-button" aria-pressed={open} onClick={showMap}>{open ? "Close Map" : "Map"}</button>}{mapSurface && (pipDocument ? createPortal(<main className="campaign-map-pip-host">{mapSurface}</main>, pipDocument.body) : <div className={`campaign-map-backdrop campaign-map-presentation-${open ? presentation : "drawer"}`} role="presentation">{drawerCollapseControl}{mapSurface}</div>)}</>;
}

export function CampaignMapLauncher(props: CampaignMapWorkspaceProps) { return <CampaignMapWorkspace {...props} />; }
