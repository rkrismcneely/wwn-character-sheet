"use client";

import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
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
import {
  clampTokenSizeCells,
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
  campaignMapOpenEvent,
  campaignMapStateEvent,
  type CampaignMapOpenDetail,
} from "./campaign-map-events";
import { CampaignMapSharedDice } from "./campaign-map-shared-dice";
import { campaignMapChangedEvent, useCampaignLiveSession } from "./use-live-session";

type ViewBox = { x: number; y: number; width: number; height: number };
type GridDraft = { enabled: boolean; type: CampaignMapGridType; size: number; offsetX: number; offsetY: number };
type MapInteractions = { snapEnabled: boolean; tokenSizes: Record<string, number> };
type FogMode = "hide" | "reveal";
type TokenDragMeasurement = { tokenId: string; distance: string };
type TokenDragOrigin = { tokenId: string; x: number; y: number };
type FloatingPosition = { x: number; y: number };
type PipExitIntent = "close" | "return";

type DocumentPictureInPictureController = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};

const mapPresentationStorageKey = "twe:campaign-map:presentation";

function isMapPresentation(value: unknown): value is InPageMapPresentation {
  return value === "fullscreen" || value === "split" || value === "drawer" || value === "floating";
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

function tokenAriaKind(kind: CampaignMapToken["kind"]): string {
  return kind === "pc" ? "player character" : kind === "companion" ? "companion" : "NPC";
}

function tokenInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

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
  const selectedMapIdRef = useRef<string | null>(null);
  const canManageRef = useRef(initialCanManage);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    view: ViewBox;
  } | null>(null);
  const tokenDragRef = useRef<{
    pointerId: number;
    tokenId: string;
    version: number;
    pointerMapX: number;
    pointerMapY: number;
    x: number;
    y: number;
    latestX: number;
    latestY: number;
  } | null>(null);
  const fogDragRef = useRef<{ pointerId: number; start: { x: number; y: number } } | null>(null);
  const fogPreviewRef = useRef<CampaignMapGridCell[]>([]);
  const mapSyncChannelRef = useRef<BroadcastChannel | null>(null);
  const [workspace, dispatchWorkspace] = useReducer(
    mapWorkspaceReducer,
    { initialOpen, initialPresentation, preferredPresentation: preferredMapPresentation() },
    createMapWorkspaceState,
  );
  const open = workspace.presentation !== "closed";
  const presentation = workspace.presentation;
  const [pipDocument, setPipDocument] = useState<Document | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const pipExitIntentRef = useRef<PipExitIntent>("close");
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({ x: 0, y: 0 });
  const floatingDragRef = useRef<{ pointerId: number; clientX: number; clientY: number; position: FloatingPosition } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [map, setMap] = useState<CampaignMapPayload | null>(null);
  const [maps, setMaps] = useState<CampaignMapSummary[]>([]);
  const [canManage, setCanManage] = useState(initialCanManage);
  const [characters, setCharacters] = useState<CampaignMapCharacterOption[]>([]);
  const [companions, setCompanions] = useState<CampaignMapCompanionOption[]>([]);
  const [encounterAvailable, setEncounterAvailable] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [grid, setGrid] = useState<GridDraft>(defaultGrid());
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [tokenSizes, setTokenSizes] = useState<Record<string, number>>({});
  const [mapNameDraft, setMapNameDraft] = useState("");
  const [view, setView] = useState<ViewBox | null>(null);
  const [tokenDragMeasurement, setTokenDragMeasurement] = useState<TokenDragMeasurement | null>(null);
  const [tokenDragOrigin, setTokenDragOrigin] = useState<TokenDragOrigin | null>(null);
  const [fogMode, setFogMode] = useState<FogMode | null>(null);
  const [fogPreview, setFogPreview] = useState<CampaignMapGridCell[]>([]);

  const closeMap = useCallback(() => {
    if (presentation === "pip") {
      pipExitIntentRef.current = "close";
      pipWindowRef.current?.close();
      pipWindowRef.current = null;
      setPipDocument(null);
      dispatchWorkspace({ type: "close" });
      setSettingsOpen(false);
      return;
    }
    if (presentation === "standalone") {
      if (window.opener) window.close();
      else window.location.assign(`/campaigns/${campaignId}`);
      return;
    }
    dispatchWorkspace({ type: "close" });
    setSettingsOpen(false);
  }, [campaignId, presentation]);

  // The active map controller keeps its authenticated live-session connection
  // while its in-page shell changes. A separate window loads the same
  // authoritative map independently rather than borrowing opener state.
  useCampaignLiveSession(campaignId, open);

  useEffect(() => {
    if (!open || !map || !view) return;
    try {
      window.localStorage.setItem(mapViewStorageKey(campaignId, map.id), JSON.stringify(view));
    } catch { /* Local view preference is optional. */ }
  }, [campaignId, map, open, presentation, view]);

  useEffect(() => {
    if (!open || (presentation !== "fullscreen" && presentation !== "standalone")) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMap();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMap, open, presentation]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(campaignMapStateEvent, {
      detail: { campaignId, open },
    }));
  }, [campaignId, open]);

  const applyResponse = useCallback((body: MapResponse, preserveView: boolean) => {
    const previousMapId = selectedMapIdRef.current;
    const nextMap = body.map ?? null;
    setMap(nextMap);
    selectedMapIdRef.current = nextMap?.id ?? null;
    if (body.maps) setMaps(body.maps);
    if (body.permissions) {
      const nextCanManage = Boolean(body.permissions.canManage);
      setCanManage(nextCanManage);
      canManageRef.current = nextCanManage;
    }
    if (body.characters) setCharacters(body.characters);
    if (body.companions) setCompanions(body.companions);
    if (typeof body.encounterAvailable === "boolean") setEncounterAvailable(body.encounterAvailable);
    setGrid(gridFor(nextMap));
    setMapNameDraft(nextMap?.name ?? "");
    setView(current => preserveView && previousMapId === nextMap?.id && current && nextMap?.backgroundWidth && nextMap.backgroundHeight
      ? current
      : readMapView(campaignId, nextMap) ?? fullView(nextMap));
  }, [campaignId]);

  const loadInteractions = useCallback(async (mapId: string) => {
    const params = new URLSearchParams({ mapId });
    const response = await fetch(`/api/campaigns/${campaignId}/map/interactions?${params.toString()}`, { cache: "no-store" });
    const body = await response.json() as InteractionResponse;
    if (!response.ok || !body.interactions) throw new Error(body.error || "The map interaction settings could not be loaded.");
    setSnapToGrid(body.interactions.snapEnabled);
    setTokenSizes(body.interactions.tokenSizes);
  }, [campaignId]);

  const loadMap = useCallback(async (preserveView = false, requestedMapId?: string | null, showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const params = requestedMapId ? `?${new URLSearchParams({ mapId: requestedMapId }).toString()}` : "";
      const response = await fetch(`/api/campaigns/${campaignId}/map${params}`, { cache: "no-store" });
      const body = await response.json() as MapResponse;
      if (!response.ok) throw new Error(body.error || "The campaign map could not be loaded.");
      applyResponse(body, preserveView);
      if (body.map) {
        await loadInteractions(body.map.id);
      } else {
        setSnapToGrid(false);
        setTokenSizes({});
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The campaign map could not be loaded.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [applyResponse, campaignId, loadInteractions]);

  useEffect(() => {
    if (!open || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`twe:campaign-map:${campaignId}`);
    mapSyncChannelRef.current = channel;
    channel.onmessage = event => {
      const message = event.data as { type?: unknown; campaignId?: unknown } | null;
      if (message?.type !== "map-changed" || message.campaignId !== campaignId) return;
      const requestedMapId = canManageRef.current ? selectedMapIdRef.current : null;
      void loadMap(true, requestedMapId, false);
    };
    return () => {
      if (mapSyncChannelRef.current === channel) mapSyncChannelRef.current = null;
      channel.close();
    };
  }, [campaignId, closeMap, loadMap, open]);

  useEffect(() => {
    if (!initialPresentation || !initialOpen) return;
    const initialLoad = window.setTimeout(() => { void loadMap(false); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [initialOpen, initialPresentation, loadMap]);

  function publishMapInvalidation() {
    mapSyncChannelRef.current?.postMessage({ type: "map-changed", campaignId });
  }

  useEffect(() => {
    const onOpenMap = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapOpenDetail>).detail;
      if (detail?.campaignId !== campaignId) return;
      if (detail.action === "close") {
        closeMap();
        return;
      }
      if (open) return;
      dispatchWorkspace({ type: "open" });
      setSettingsOpen(false);
      void loadMap(false);
    };
    window.addEventListener(campaignMapOpenEvent, onOpenMap);
    return () => window.removeEventListener(campaignMapOpenEvent, onOpenMap);
  }, [campaignId, loadMap, open]);

  useEffect(() => {
    if (!open) return;
    const onMapChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId?: string }>).detail;
      if (detail?.campaignId !== campaignId) return;
      const requestedMapId = canManageRef.current ? selectedMapIdRef.current : null;
      void loadMap(true, requestedMapId, false);
    };
    window.addEventListener(campaignMapChangedEvent, onMapChanged);
    return () => window.removeEventListener(campaignMapChangedEvent, onMapChanged);
  }, [campaignId, loadMap, open]);

  function showMap() {
    if (open) {
      closeMap();
      return;
    }
    dispatchWorkspace({ type: "open" });
    setSettingsOpen(false);
    void loadMap(false);
  }

  function rememberPresentation(nextPresentation: InPageMapPresentation) {
    try { window.localStorage.setItem(mapPresentationStorageKey, nextPresentation); } catch { /* Preferences are optional. */ }
  }

  function choosePresentation(nextPresentation: InPageMapPresentation) {
    dispatchWorkspace({ type: "choose-in-page-presentation", presentation: nextPresentation });
    rememberPresentation(nextPresentation);
    setSettingsOpen(false);
  }

  function openMapPopout() {
    const url = new URL(`/campaigns/${campaignId}/map`, window.location.origin);
    const popup = window.open(url.toString(), "twe-campaign-map", "popup=yes,width=1180,height=820,resizable=yes,scrollbars=yes");
    if (!popup) {
      setError("Your browser blocked the map window. Allow pop-ups for Tales Without End and try again.");
      return;
    }
    popup.focus();
    dispatchWorkspace({ type: "move-to-popout" });
    setSettingsOpen(false);
  }

  async function openMapPictureInPicture() {
    const controller = documentPictureInPictureController();
    if (!controller) {
      openMapPopout();
      return;
    }
    try {
      const pipWindow = await controller.requestWindow({ width: 1060, height: 760 });
      copyMapWorkspaceStyles(pipWindow.document);
      pipWindowRef.current = pipWindow;
      pipWindow.addEventListener("pagehide", () => {
        const returnToPage = pipExitIntentRef.current === "return";
        pipExitIntentRef.current = "close";
        pipWindowRef.current = null;
        setPipDocument(null);
        dispatchWorkspace({ type: "picture-in-picture-closed", returnToPage });
        setSettingsOpen(false);
      }, { once: true });
      setPipDocument(pipWindow.document);
      dispatchWorkspace({ type: "move-to-picture-in-picture" });
      setSettingsOpen(false);
    } catch {
      // A denied request is normally a browser capability/gesture problem; a
      // same-origin pop-out preserves the useful multi-view workflow.
      openMapPopout();
    }
  }

  function returnFromPictureInPicture() {
    if (presentation !== "pip") return;
    pipExitIntentRef.current = "return";
    pipWindowRef.current?.close();
  }

  function handleFloatingDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (presentation !== "floating" || event.button !== 0) return;
    floatingDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      position: floatingPosition,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleFloatingDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = floatingDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setFloatingPosition({ x: drag.position.x + event.clientX - drag.clientX, y: drag.position.y + event.clientY - drag.clientY });
  }

  function handleFloatingDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (floatingDragRef.current?.pointerId !== event.pointerId) return;
    floatingDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function resetView() {
    setView(fullView(map));
  }

  function zoom(factor: number) {
    if (!map?.backgroundWidth || !map.backgroundHeight || !view) return;
    const nextWidth = clamp(view.width * factor, map.backgroundWidth / 12, map.backgroundWidth * 1.5);
    const nextHeight = nextWidth * (map.backgroundHeight / map.backgroundWidth);
    const centerX = view.x + view.width / 2;
    const centerY = view.y + view.height / 2;
    setView({ x: centerX - nextWidth / 2, y: centerY - nextHeight / 2, width: nextWidth, height: nextHeight });
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.12 : 0.88);
  }

  function selectedFogCells(start: { x: number; y: number }, end: { x: number; y: number }): CampaignMapGridCell[] {
    if (!map) return [];
    return gridCellsInRectangle(start, end, map.grid, 500);
  }

  async function saveFogCells(mode: FogMode, cells: CampaignMapGridCell[]) {
    if (!map || !cells.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_fog", mapId: map.id, mode, cells }),
      });
      const body = await response.json() as InteractionResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "Map visibility could not be updated.");
      setMap(body.map);
      publishMapInvalidation();
    } catch (fogError) {
      setError(fogError instanceof Error ? fogError.message : "Map visibility could not be updated.");
      void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false);
    } finally {
      setBusy(false);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!view || event.button !== 0 || tokenDragRef.current) return;
    if (fogMode && canManage && svgRef.current) {
      const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      if (!point) return;
      fogDragRef.current = { pointerId: event.pointerId, start: point };
      const cells = selectedFogCells(point, point);
      fogPreviewRef.current = cells;
      setFogPreview(cells);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const fogDrag = fogDragRef.current;
    if (fogDrag?.pointerId === event.pointerId && svgRef.current) {
      const point = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      if (point) {
        const cells = selectedFogCells(fogDrag.start, point);
        fogPreviewRef.current = cells;
        setFogPreview(cells);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - drag.clientX) * (drag.view.width / rect.width);
    const dy = (event.clientY - drag.clientY) * (drag.view.height / rect.height);
    setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    const fogDrag = fogDragRef.current;
    if (fogDrag?.pointerId === event.pointerId) {
      fogDragRef.current = null;
      const cells = fogPreviewRef.current;
      const mode = fogMode;
      setFogPreview([]);
      fogPreviewRef.current = [];
      setFogMode(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (mode && cells.length) void saveFogCells(mode, cells);
      return;
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleTokenPointerDown(event: ReactPointerEvent<SVGGElement>, token: CampaignMapToken) {
    if (!token.canMove || !view || event.button !== 0 || !svgRef.current) return;
    event.stopPropagation();
    const pointer = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
    if (!pointer) return;
    tokenDragRef.current = {
      pointerId: event.pointerId,
      tokenId: token.id,
      version: token.version,
      pointerMapX: pointer.x,
      pointerMapY: pointer.y,
      x: token.x,
      y: token.y,
      latestX: token.x,
      latestY: token.y,
    };
    setTokenDragMeasurement({ tokenId: token.id, distance: "0 ft" });
    setTokenDragOrigin({ tokenId: token.id, x: token.x, y: token.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTokenPointerMove(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !map?.backgroundWidth || !map.backgroundHeight || !svgRef.current) return;
    event.stopPropagation();
    const pointer = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
    if (!pointer) return;
    let x = clamp(drag.x + (pointer.x - drag.pointerMapX), 0, map.backgroundWidth);
    let y = clamp(drag.y + (pointer.y - drag.pointerMapY), 0, map.backgroundHeight);
    if (snapToGrid) {
      const sizeCells = tokenSizes[drag.tokenId] ?? 1;
      const snapped = snapTokenCenterOnGrid(
        { x, y },
        map.grid,
        sizeCells,
        map.backgroundWidth,
        map.backgroundHeight,
      );
      x = snapped.x;
      y = snapped.y;
    }
    drag.latestX = x;
    drag.latestY = y;
    setTokenDragMeasurement({
      tokenId: drag.tokenId,
      distance: gridMovementDistanceLabel(drag.x, drag.y, x, y, map.grid),
    });
    setMap(current => current ? { ...current, tokens: current.tokens.map(token => token.id === drag.tokenId ? { ...token, x, y } : token) } : current);
  }

  async function persistTokenMove(drag: NonNullable<typeof tokenDragRef.current>) {
    if (!map) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "move", mapId: map.id, tokenId: drag.tokenId, version: drag.version, x: drag.latestX, y: drag.latestY }),
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The token could not be moved.");
      setMap(body.map);
      publishMapInvalidation();
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "The token could not be moved.");
      void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false);
    } finally {
      setBusy(false);
    }
  }

  function handleTokenPointerEnd(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    tokenDragRef.current = null;
    setTokenDragMeasurement(null);
    setTokenDragOrigin(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void persistTokenMove(drag);
  }

  async function tokenAction(body: Record<string, unknown>) {
    if (!map) return null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, mapId: map.id }),
      });
      const result = await response.json() as MapResponse;
      if (!response.ok || !result.map) throw new Error(result.error || "The map token could not be updated.");
      setMap(result.map);
      setTokenSizes(current => Object.fromEntries(Object.entries(current).filter(([tokenId]) => result.map?.tokens.some(token => token.id === tokenId))));
      publishMapInvalidation();
      return result.map;
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : "The map token could not be updated.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function resizeToken(token: CampaignMapToken, nextSize: number) {
    if (!map) return;
    const sizeCells = clampTokenSizeCells(nextSize);
    if (sizeCells === (tokenSizes[token.id] ?? 1)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resize", mapId: map.id, tokenId: token.id, sizeCells }),
      });
      const body = await response.json() as InteractionResponse;
      if (!response.ok || !body.interactions || !body.token) throw new Error(body.error || "The token could not be resized.");
      setSnapToGrid(body.interactions.snapEnabled);
      setTokenSizes(body.interactions.tokenSizes);
      setMap(current => current ? {
        ...current,
        tokens: current.tokens.map(candidate => candidate.id === body.token?.id
          ? { ...candidate, x: body.token.x, y: body.token.y, version: body.token.version }
          : candidate),
      } : current);
      publishMapInvalidation();
    } catch (resizeError) {
      setError(resizeError instanceof Error ? resizeError.message : "The token could not be resized.");
      void loadMap(true, canManageRef.current ? selectedMapIdRef.current : null, false);
    } finally {
      setBusy(false);
    }
  }

  async function mapAction(body: Record<string, unknown>, preserveView = true) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as MapResponse;
      if (!response.ok) throw new Error(result.error || "The campaign map could not be updated.");
      applyResponse(result, preserveView);
      if (result.map) {
        await loadInteractions(result.map.id);
      } else {
        setSnapToGrid(false);
        setTokenSizes({});
      }
      publishMapInvalidation();
      return result;
    } catch (mapError) {
      setError(mapError instanceof Error ? mapError.message : "The campaign map could not be updated.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveGrid() {
    if (!map) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mapId: map.id,
          version: map.version,
          gridEnabled: grid.enabled,
          gridType: grid.type,
          gridSize: Number(grid.size),
          gridOffsetX: Number(grid.offsetX),
          gridOffsetY: Number(grid.offsetY),
        }),
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The grid settings could not be saved.");
      applyResponse(body, true);

      const interactionResponse = await fetch(`/api/campaigns/${campaignId}/map/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_snap", mapId: body.map.id, enabled: snapToGrid }),
      });
      const interactionBody = await interactionResponse.json() as InteractionResponse;
      if (!interactionResponse.ok || !interactionBody.interactions) {
        throw new Error(interactionBody.error || "The grid snapping setting could not be saved.");
      }
      setSnapToGrid(interactionBody.interactions.snapEnabled);
      setTokenSizes(interactionBody.interactions.tokenSizes);
      publishMapInvalidation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The grid settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadNewMap(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ name: filenameMapName(file.name) });
      const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be uploaded.");
      applyResponse(body, false);
      await loadInteractions(body.map.id);
      setSettingsOpen(true);
      publishMapInvalidation();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The map image could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !map) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ mapId: map.id });
      const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, {
        method: "POST",
        headers: {
          "content-type": file.type,
          "x-campaign-map-version": String(map.version),
        },
        body: file,
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be uploaded.");
      applyResponse(body, false);
      publishMapInvalidation();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The map image could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBackground() {
    if (!map?.backgroundUrl || !window.confirm(`Remove the image from “${map.name}”? Grid settings and token placements will be kept.`)) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ mapId: map.id });
      const response = await fetch(`/api/campaigns/${campaignId}/map/background?${params.toString()}`, {
        method: "DELETE",
        headers: { "x-campaign-map-version": String(map.version) },
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be removed.");
      applyResponse(body, false);
      publishMapInvalidation();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The map image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function selectMap(mapId: string) {
    if (mapId === map?.id) return;
    await loadMap(false, mapId);
  }

  async function renameMap() {
    if (!map || mapNameDraft.trim() === map.name) return;
    await mapAction({ action: "rename", mapId: map.id, version: map.version, name: mapNameDraft.trim() });
  }

  async function showToPlayers() {
    if (!map || map.isActive) return;
    await mapAction({ action: "activate", mapId: map.id });
  }

  async function deleteMap() {
    if (!map || !window.confirm(`Delete “${map.name}” and all of its token placements? This cannot be undone.`)) return;
    await mapAction({ action: "delete", mapId: map.id }, false);
  }

  const placedCharacterIds = new Set(map?.tokens.filter(token => token.kind === "pc").map(token => token.sourceId) ?? []);
  const placedCompanionIds = new Set(map?.tokens.filter(token => token.kind === "companion").map(token => token.sourceId) ?? []);

  const inPageHost = presentation !== "pip" && presentation !== "standalone" && presentation !== "closed";

  const mapSurface = open ? <section
    className={`campaign-map-dialog campaign-map-host-${presentation}`}
    role="dialog"
    aria-modal={presentation === "fullscreen"}
    aria-labelledby="campaign-map-title"
    style={presentation === "floating" ? { transform: `translate3d(${floatingPosition.x}px, ${floatingPosition.y}px, 0)` } : undefined}
  >
        <header className="campaign-map-toolbar">
          <div
            className={`campaign-map-title-block${presentation === "floating" ? " is-draggable" : ""}`}
            onPointerDown={handleFloatingDragStart}
            onPointerMove={handleFloatingDragMove}
            onPointerUp={handleFloatingDragEnd}
            onPointerCancel={handleFloatingDragEnd}
          >
            <p className="campaign-kicker">CAMPAIGN MAP</p>
            <h2 id="campaign-map-title">{map?.name ?? campaignName}</h2>
            {canManage && map && <small className={map.isActive ? "campaign-map-live-label" : "campaign-map-private-label"}>{map.isActive ? "Visible to players" : "GM preview — players still see the active map"}</small>}
          </div>
          <div className="campaign-map-toolbar-actions">
            {map?.backgroundUrl && <>
              <button type="button" className="campaign-quiet" onClick={() => zoom(1.2)} aria-label="Zoom out">−</button>
              <button type="button" className="campaign-quiet" onClick={() => zoom(0.82)} aria-label="Zoom in">+</button>
              <button type="button" className="campaign-secondary" onClick={resetView}>Fit Map</button>
            </>}
            {map && <CampaignMapSharedDice campaignId={campaignId} mapId={map.id} open={open} canManage={canManage} />}
            {canManage && map?.backgroundUrl && <>
              <button type="button" className={`campaign-secondary${fogMode === "hide" ? " is-active" : ""}`} aria-pressed={fogMode === "hide"} onClick={() => { setFogMode(current => current === "hide" ? null : "hide"); setFogPreview([]); }}>Hide Area</button>
              <button type="button" className={`campaign-secondary${fogMode === "reveal" ? " is-active" : ""}`} aria-pressed={fogMode === "reveal"} onClick={() => { setFogMode(current => current === "reveal" ? null : "reveal"); setFogPreview([]); }}>Reveal Area</button>
            </>}
            {canManage && <button type="button" className="campaign-secondary" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(current => !current)}>Map Settings</button>}
            {inPageHost && <label className="campaign-map-presentation-picker">
              <span className="sr-only">Map display</span>
              <select value={workspace.inPagePresentation} onChange={event => choosePresentation(event.target.value as InPageMapPresentation)}>
                <option value="fullscreen">Full screen</option>
                <option value="split">Split panel</option>
                <option value="drawer">Side drawer</option>
                <option value="floating">Floating window</option>
              </select>
            </label>}
            {inPageHost && <button type="button" className="campaign-secondary campaign-map-desktop-action" onClick={() => void openMapPictureInPicture()}>Move to Picture-in-Picture</button>}
            {inPageHost && <button type="button" className="campaign-secondary campaign-map-desktop-action" onClick={openMapPopout}>Open Separate Window</button>}
            {presentation === "pip" && <button type="button" className="campaign-secondary" onClick={returnFromPictureInPicture}>Return to Page</button>}
            <button type="button" className="campaign-secondary" onClick={closeMap}>{presentation === "standalone" ? "Close Map Window" : "Close Map"}</button>
          </div>
        </header>

        {error && <div className="campaign-error campaign-map-error" role="alert">{error}</div>}
        <div className={`campaign-map-workspace${settingsOpen && canManage ? " settings-open" : ""}`}>
          <div className="campaign-map-stage" aria-busy={loading || busy}>
            {loading && <div className="campaign-map-empty" role="status">Loading campaign map…</div>}
            {!loading && !map?.backgroundUrl && <div className="campaign-map-empty">
              <h3>{map ? "No map image" : "No campaign maps yet"}</h3>
              <p>{canManage ? "Open Map Settings to upload a new map." : "The GM has not shared a campaign map yet."}</p>
            </div>}
            {!loading && map?.backgroundUrl && map.backgroundWidth && map.backgroundHeight && view && <svg
              ref={svgRef}
              className="campaign-map-svg"
              viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              aria-label="Campaign map. Drag to pan; drag an allowed token to move it; use the mouse wheel or toolbar buttons to zoom."
            >
              <defs>{map.grid.type === "hex" ? (() => {
                const pattern = hexPatternSize(map.grid.size);
                return <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={pattern.width} height={pattern.height}>
                  {hexPatternPaths(map.grid.size).map((path, index) => <path key={index} d={path} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />)}
                </pattern>;
              })() : <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={map.grid.size} height={map.grid.size}>
                <path d={`M ${map.grid.size} 0 L 0 0 0 ${map.grid.size}`} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
              </pattern>}</defs>
              <image href={map.backgroundUrl} x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} preserveAspectRatio="none" />
              {map.grid.enabled && <rect x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} fill={`url(#${patternId})`} pointerEvents="none" />}
              <g className="campaign-map-fog-layer" pointerEvents="none">
                {map.fogCells.map(cell => <path key={`${cell.q}:${cell.r}`} d={gridCellPath(cell, map.grid)} className="campaign-map-fog-cell" />)}
                {fogPreview.map(cell => <path key={`${cell.q}:${cell.r}`} d={gridCellPath(cell, map.grid)} className={`campaign-map-fog-preview is-${fogMode ?? "hide"}`} />)}
              </g>
              <g className="campaign-map-token-layer">
                {tokenDragOrigin && (() => {
                  const token = map.tokens.find(candidate => candidate.id === tokenDragOrigin.tokenId);
                  if (!token || (Math.abs(token.x - tokenDragOrigin.x) < 0.01 && Math.abs(token.y - tokenDragOrigin.y) < 0.01)) return null;
                  const sizeCells = tokenSizes[token.id] ?? 1;
                  const tokenVisualRadius = gridTokenRadius(map.grid.size, sizeCells);
                  return <g
                    className={`campaign-map-token campaign-map-token-${token.kind} campaign-map-token-drag-origin`}
                    transform={`translate(${tokenDragOrigin.x} ${tokenDragOrigin.y})`}
                    opacity={0.5}
                    pointerEvents="none"
                    aria-hidden="true"
                  >
                    <circle r={tokenVisualRadius} className="campaign-map-token-disc" vectorEffect="non-scaling-stroke" />
                    <text className="campaign-map-token-initials" textAnchor="middle" dominantBaseline="central" fontSize={tokenVisualRadius * 0.72}>{tokenInitials(token.name)}</text>
                    <text className="campaign-map-token-name" textAnchor="middle" y={tokenVisualRadius + Math.max(12, tokenVisualRadius * 0.48)} fontSize={Math.max(11, tokenVisualRadius * 0.42)}>{token.name}</text>
                  </g>;
                })()}
                {map.tokens.map(token => {
                  const sizeCells = tokenSizes[token.id] ?? 1;
                  const tokenVisualRadius = gridTokenRadius(map.grid.size, sizeCells);
                  return <g
                    key={token.id}
                    className={`campaign-map-token campaign-map-token-${token.kind}${token.canMove ? " is-movable" : ""}`}
                    transform={`translate(${token.x} ${token.y})`}
                    onPointerDown={event => handleTokenPointerDown(event, token)}
                    onPointerMove={handleTokenPointerMove}
                    onPointerUp={handleTokenPointerEnd}
                    onPointerCancel={handleTokenPointerEnd}
                    role="img"
                    aria-label={`${token.name} ${tokenAriaKind(token.kind)} token, ${sizeCells} by ${sizeCells} grid cells${token.canMove ? ", draggable" : ""}`}
                  >
                    <title>{token.name}</title>
                    <circle r={tokenVisualRadius} className="campaign-map-token-disc" vectorEffect="non-scaling-stroke" />
                    <text className="campaign-map-token-initials" textAnchor="middle" dominantBaseline="central" fontSize={tokenVisualRadius * 0.72}>{tokenInitials(token.name)}</text>
                    {tokenDragMeasurement?.tokenId === token.id && <text
                      className="campaign-map-token-distance"
                      textAnchor="middle"
                      y={-(tokenVisualRadius + Math.max(14, tokenVisualRadius * 0.5))}
                      fontSize={Math.max(12, tokenVisualRadius * 0.44)}
                    >{tokenDragMeasurement.distance}</text>}
                    <text className="campaign-map-token-name" textAnchor="middle" y={tokenVisualRadius + Math.max(12, tokenVisualRadius * 0.48)} fontSize={Math.max(11, tokenVisualRadius * 0.42)}>{token.name}</text>
                  </g>;
                })}
              </g>
            </svg>}
          </div>

          {settingsOpen && canManage && <aside className="campaign-map-settings" aria-label="Campaign map settings">
            <div className="campaign-map-settings-heading">
              <div><p className="campaign-kicker">GM CONTROLS</p><h3>Map Settings</h3></div>
              <button type="button" className="campaign-quiet" onClick={() => setSettingsOpen(false)}>Hide</button>
            </div>

            {map && <section className="campaign-map-table-controls">
              <h4>At the Table</h4>
              <p>Controls used during play stay here. Alignment and map-library work are kept below.</p>
              {map.isActive
                ? <div className="campaign-map-visible-status"><strong>Visible to Players</strong><span>Party members opening Map see this map.</span></div>
                : <button type="button" className="campaign-primary" disabled={busy} onClick={() => void showToPlayers()}>Show to Players</button>}
              <div className="campaign-map-table-actions">
                <button type="button" className={`campaign-secondary${fogMode === "hide" ? " is-active" : ""}`} aria-pressed={fogMode === "hide"} onClick={() => { setFogMode(current => current === "hide" ? null : "hide"); setFogPreview([]); }}>Hide Area</button>
                <button type="button" className={`campaign-secondary${fogMode === "reveal" ? " is-active" : ""}`} aria-pressed={fogMode === "reveal"} onClick={() => { setFogMode(current => current === "reveal" ? null : "reveal"); setFogPreview([]); }}>Reveal Area</button>
              </div>
              <label className="campaign-map-grid-toggle"><input type="checkbox" checked={grid.enabled} onChange={event => setGrid(current => ({ ...current, enabled: event.target.checked }))} /><span>Show grid</span></label>
              <label className="campaign-map-grid-toggle"><input type="checkbox" checked={snapToGrid} onChange={event => setSnapToGrid(event.target.checked)} /><span>Snap tokens to grid</span></label>
              <button type="button" className="campaign-primary" disabled={busy} onClick={() => void saveGrid()}>Save Table Controls</button>
              {fogMode && <small>Drag across the map to {fogMode} whole {grid.type === "hex" ? "hexes" : "cells"}. Up to 500 cells are changed at once.</small>}
            </section>}

            <section className="campaign-map-library">
              <h4>Maps</h4>
              <p>Prepare as many maps as you need. Only the map marked Visible to Players is shared with the party.</p>
              <label className="campaign-map-upload campaign-primary">
                <span>Upload New Map</span>
                <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={uploadNewMap} />
              </label>
              {maps.length > 0 && <div className="campaign-map-library-list">
                {maps.map(candidate => <button
                  type="button"
                  key={candidate.id}
                  className={`campaign-map-library-item${candidate.id === map?.id ? " is-selected" : ""}`}
                  disabled={busy}
                  onClick={() => void selectMap(candidate.id)}
                >
                  <span>{candidate.name}</span>
                  {candidate.isActive ? <small>Visible to Players</small> : <small>GM only</small>}
                </button>)}
              </div>}
              {map && <div className="campaign-map-selected-controls">
                <label><span>Map name</span><input type="text" maxLength={80} value={mapNameDraft} onChange={event => setMapNameDraft(event.target.value)} /></label>
                <button type="button" className="campaign-secondary" disabled={busy || !mapNameDraft.trim() || mapNameDraft.trim() === map.name} onClick={() => void renameMap()}>Save Name</button>
                <button type="button" className="campaign-danger" disabled={busy} onClick={() => void deleteMap()}>Delete Map</button>
              </div>}
            </section>

            {map && <>
              <section className="campaign-map-background-settings">
                <h4>Background</h4>
                <p>JPG or PNG · up to 15 MB.</p>
                <label className="campaign-map-upload campaign-secondary">
                  <span>{map.backgroundUrl ? "Replace Map Image" : "Add Map Image"}</span>
                  <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={replaceBackground} />
                </label>
                {map.backgroundUrl && <button type="button" className="campaign-danger" disabled={busy} onClick={() => void removeBackground()}>Remove Map Image</button>}
              </section>
              <section className="campaign-map-grid-settings">
                <h4>Grid & Alignment</h4>
                <p>Choose the grid that matches this map. Square maps keep five-foot movement; hex maps measure each adjacent hex as 10 km.</p>
                <label><span>Grid type</span><select value={grid.type} onChange={event => setGrid(current => ({ ...current, type: event.target.value as CampaignMapGridType }))}>
                  <option value="square">Square · 5 ft cells</option>
                  <option value="hex">Hex · 10 km per hex</option>
                </select></label>
                <small>Snapping works whether or not grid lines are visible. Changing the grid never changes a token until it is moved or resized.</small>
                <label><span>{grid.type === "hex" ? "Hex height" : "Cell size"}</span><input type="number" min="8" max="512" step="1" value={grid.size} onChange={event => setGrid(current => ({ ...current, size: Number(event.target.value) }))} /></label>
                <label><span>Horizontal origin</span><input type="number" step="1" value={grid.offsetX} onChange={event => setGrid(current => ({ ...current, offsetX: Number(event.target.value) }))} /></label>
                <label><span>Vertical origin</span><input type="number" step="1" value={grid.offsetY} onChange={event => setGrid(current => ({ ...current, offsetY: Number(event.target.value) }))} /></label>
                <button type="button" className="campaign-primary" disabled={busy} onClick={() => void saveGrid()}>Save Alignment</button>
              </section>
              <section className="campaign-map-token-settings">
                <h4>Tokens</h4>
                <p>Token placements belong to this map. Sizes are measured in whole grid cells, so larger tokens stay aligned with the selected grid.</p>
                <button type="button" className="campaign-primary" disabled={busy || !map.backgroundUrl || !encounterAvailable} onClick={() => void tokenAction({ action: "place_encounter" })}>Place Active Encounter</button>
                {!encounterAvailable && <small>Start a live encounter to place all of its current combatants at once.</small>}
                {characters.length > 0 && <div className="campaign-map-character-tokens">
                  {characters.map(character => <div key={character.id}><span>{character.name}</span>{placedCharacterIds.has(character.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl} onClick={() => void tokenAction({ action: "place_pc", characterId: character.id })}>Place</button>}</div>)}
                </div>}
                {companions.length > 0 && <div className="campaign-map-character-tokens campaign-map-companion-tokens">
                  {companions.map(companion => <div key={companion.id}><span><b>{companion.name}</b><small>{companion.characterName} · {companion.label}</small></span>{placedCompanionIds.has(companion.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map.backgroundUrl} onClick={() => void tokenAction({ action: "place_companion", companionId: companion.id })}>Place</button>}</div>)}
                </div>}
                {map.tokens.length ? <div className="campaign-map-placed-tokens">
                  <strong>On this map</strong>
                  {map.tokens.map(token => {
                    const sizeCells = tokenSizes[token.id] ?? 1;
                    return <div key={token.id}>
                      <span><b>{token.name}</b><small>{tokenKindLabel(token.kind)} · {sizeCells}×{sizeCells}</small></span>
                      <div className="campaign-map-token-row-actions">
                        <button type="button" className="campaign-quiet" disabled={busy || sizeCells <= 1} aria-label={`Make ${token.name} smaller`} onClick={() => void resizeToken(token, sizeCells - 1)}>−</button>
                        <button type="button" className="campaign-quiet" disabled={busy || sizeCells >= 12} aria-label={`Make ${token.name} larger`} onClick={() => void resizeToken(token, sizeCells + 1)}>+</button>
                        <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void tokenAction({ action: "remove", tokenId: token.id })}>Remove</button>
                      </div>
                    </div>;
                  })}
                </div> : <p>No tokens placed on this map yet.</p>}
              </section>
            </>}
            <p className="campaign-map-foundation-note">Multiple maps, player visibility, hex or square grids, persistent token sizes, cell-based conceal/reveal, live movement, and drag-distance measuring are active. Drawing, lighting, and map layers remain later phases.</p>
          </aside>}
        </div>
      </section> : null;

  return <>
    {showFloatingButton && <button type="button" className="campaign-map-launcher-button" aria-pressed={open} onClick={showMap}>{open ? "Close Map" : "Map"}</button>}
    {mapSurface && (pipDocument
      ? createPortal(<main className="campaign-map-pip-host">{mapSurface}</main>, pipDocument.body)
      : <div className={`campaign-map-backdrop campaign-map-presentation-${presentation}`} role="presentation">{mapSurface}</div>)}
  </>;
}

/** Existing pages keep their public launcher API while using MapWorkspace. */
export function CampaignMapLauncher(props: CampaignMapWorkspaceProps) {
  return <CampaignMapWorkspace {...props} />;
}
