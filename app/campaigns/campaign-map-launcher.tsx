"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { CampaignMapCharacterOption, CampaignMapPayload, CampaignMapToken } from "@/lib/campaigns/map";
import { campaignMapChangedEvent } from "./use-live-session";

type ViewBox = { x: number; y: number; width: number; height: number };
type GridDraft = { enabled: boolean; size: number; offsetX: number; offsetY: number };

type MapResponse = {
  map?: CampaignMapPayload | null;
  permissions?: { canManage?: boolean };
  characters?: CampaignMapCharacterOption[];
  encounterAvailable?: boolean;
  error?: string;
};

function defaultGrid(): GridDraft {
  return { enabled: false, size: 64, offsetX: 0, offsetY: 0 };
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

function tokenInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

function snapToken(value: number, offset: number, size: number, maximum: number): number {
  const snapped = offset + (Math.round((value - offset) / size - 0.5) + 0.5) * size;
  return clamp(snapped, 0, maximum);
}

export function CampaignMapLauncher({
  campaignId,
  campaignName,
  canManage: initialCanManage,
}: {
  campaignId: string;
  campaignName: string;
  canManage: boolean;
}) {
  const patternId = useId().replaceAll(":", "");
  const svgRef = useRef<SVGSVGElement>(null);
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
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    view: ViewBox;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [map, setMap] = useState<CampaignMapPayload | null>(null);
  const [canManage, setCanManage] = useState(initialCanManage);
  const [characters, setCharacters] = useState<CampaignMapCharacterOption[]>([]);
  const [encounterAvailable, setEncounterAvailable] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [grid, setGrid] = useState<GridDraft>(defaultGrid());
  const [view, setView] = useState<ViewBox | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const loadMap = useCallback(async (preserveView = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map`, { cache: "no-store" });
      const body = await response.json() as MapResponse;
      if (!response.ok) throw new Error(body.error || "The campaign map could not be loaded.");
      const nextMap = body.map ?? null;
      setMap(nextMap);
      setCanManage(Boolean(body.permissions?.canManage));
      setCharacters(body.characters ?? []);
      setEncounterAvailable(Boolean(body.encounterAvailable));
      setGrid(gridFor(nextMap));
      setView(current => preserveView && current && nextMap?.backgroundWidth && nextMap.backgroundHeight ? current : fullView(nextMap));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The campaign map could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!open) return;
    const onMapChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId?: string }>).detail;
      if (detail?.campaignId === campaignId) void loadMap(true);
    };
    window.addEventListener(campaignMapChangedEvent, onMapChanged);
    return () => window.removeEventListener(campaignMapChangedEvent, onMapChanged);
  }, [campaignId, loadMap, open]);

  function showMap() {
    setOpen(true);
    setSettingsOpen(false);
    void loadMap(false);
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

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!view || event.button !== 0 || tokenDragRef.current) return;
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - drag.clientX) * (drag.view.width / rect.width);
    const dy = (event.clientY - drag.clientY) * (drag.view.height / rect.height);
    setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy });
  }

  function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleTokenPointerDown(event: ReactPointerEvent<SVGGElement>, token: CampaignMapToken) {
    if (!token.canMove || !view || event.button !== 0) return;
    event.stopPropagation();
    tokenDragRef.current = {
      pointerId: event.pointerId,
      tokenId: token.id,
      version: token.version,
      clientX: event.clientX,
      clientY: event.clientY,
      x: token.x,
      y: token.y,
      view,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTokenPointerMove(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !map?.backgroundWidth || !map.backgroundHeight || !svgRef.current) return;
    event.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let x = clamp(drag.x + (event.clientX - drag.clientX) * (drag.view.width / rect.width), 0, map.backgroundWidth);
    let y = clamp(drag.y + (event.clientY - drag.clientY) * (drag.view.height / rect.height), 0, map.backgroundHeight);
    if (map.grid.enabled) {
      x = snapToken(x, map.grid.offsetX, map.grid.size, map.backgroundWidth);
      y = snapToken(y, map.grid.offsetY, map.grid.size, map.backgroundHeight);
    }
    setMap(current => current ? { ...current, tokens: current.tokens.map(token => token.id === drag.tokenId ? { ...token, x, y } : token) } : current);
  }

  async function persistTokenMove(drag: NonNullable<typeof tokenDragRef.current>) {
    const token = map?.tokens.find(candidate => candidate.id === drag.tokenId);
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "move", tokenId: drag.tokenId, version: drag.version, x: token.x, y: token.y }),
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The token could not be moved.");
      setMap(body.map);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "The token could not be moved.");
      void loadMap(true);
    } finally {
      setBusy(false);
    }
  }

  function handleTokenPointerEnd(event: ReactPointerEvent<SVGGElement>) {
    const drag = tokenDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    tokenDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void persistTokenMove(drag);
  }

  async function tokenAction(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as MapResponse;
      if (!response.ok || !result.map) throw new Error(result.error || "The map token could not be updated.");
      setMap(result.map);
      return result.map;
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : "The map token could not be updated.");
      throw tokenError;
    } finally {
      setBusy(false);
    }
  }

  async function saveGrid() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: map?.version ?? 0,
          gridEnabled: grid.enabled,
          gridSize: Number(grid.size),
          gridOffsetX: Number(grid.offsetX),
          gridOffsetY: Number(grid.offsetY),
        }),
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The grid settings could not be saved.");
      setMap(body.map);
      setGrid(gridFor(body.map));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The grid settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/background`, {
        method: "POST",
        headers: {
          "content-type": file.type,
          "x-campaign-map-version": String(map?.version ?? 0),
        },
        body: file,
      });
      const body = await response.json() as MapResponse;
      if (!response.ok || !body.map) throw new Error(body.error || "The map image could not be uploaded.");
      setMap(body.map);
      setGrid(gridFor(body.map));
      setView(fullView(body.map));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The map image could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBackground() {
    if (!map?.backgroundUrl || !window.confirm("Remove the current campaign map image? Grid settings and token placements will be kept.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map/background`, {
        method: "DELETE",
        headers: { "x-campaign-map-version": String(map.version) },
      });
      const body = await response.json() as MapResponse;
      if (!response.ok) throw new Error(body.error || "The map image could not be removed.");
      const nextMap = body.map ?? null;
      setMap(nextMap);
      setGrid(gridFor(nextMap));
      setView(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "The map image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const placedCharacterIds = new Set(map?.tokens.filter(token => token.kind === "pc").map(token => token.sourceId) ?? []);
  const tokenRadius = clamp((map?.grid.size ?? 64) * 0.4, 18, 80);

  return <>
    <button type="button" className="campaign-map-launcher-button" onClick={showMap}>Map</button>
    {open && <div className="campaign-map-backdrop" role="presentation">
      <section className="campaign-map-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-map-title">
        <header className="campaign-map-toolbar">
          <div>
            <p className="campaign-kicker">CAMPAIGN MAP</p>
            <h2 id="campaign-map-title">{campaignName}</h2>
          </div>
          <div className="campaign-map-toolbar-actions">
            {map?.backgroundUrl && <>
              <button type="button" className="campaign-quiet" onClick={() => zoom(1.2)} aria-label="Zoom out">−</button>
              <button type="button" className="campaign-quiet" onClick={() => zoom(0.82)} aria-label="Zoom in">+</button>
              <button type="button" className="campaign-secondary" onClick={resetView}>Fit Map</button>
            </>}
            {canManage && <button type="button" className="campaign-secondary" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(current => !current)}>Map Settings</button>}
            <button type="button" className="campaign-secondary" onClick={() => setOpen(false)}>Close</button>
          </div>
        </header>

        {error && <div className="campaign-error campaign-map-error" role="alert">{error}</div>}
        <div className={`campaign-map-workspace${settingsOpen && canManage ? " settings-open" : ""}`}>
          <div className="campaign-map-stage" aria-busy={loading || busy}>
            {loading && <div className="campaign-map-empty" role="status">Loading campaign map…</div>}
            {!loading && !map?.backgroundUrl && <div className="campaign-map-empty">
              <h3>No map image yet</h3>
              <p>{canManage ? "Open Map Settings to upload the first campaign map." : "The GM has not shared a campaign map yet."}</p>
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
              <defs>
                <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={map.grid.size} height={map.grid.size}>
                  <path d={`M ${map.grid.size} 0 L 0 0 0 ${map.grid.size}`} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                </pattern>
              </defs>
              <image href={map.backgroundUrl} x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} preserveAspectRatio="none" />
              {map.grid.enabled && <rect x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} fill={`url(#${patternId})`} pointerEvents="none" />}
              <g className="campaign-map-token-layer">
                {map.tokens.map(token => <g
                  key={token.id}
                  className={`campaign-map-token campaign-map-token-${token.kind}${token.canMove ? " is-movable" : ""}`}
                  transform={`translate(${token.x} ${token.y})`}
                  onPointerDown={event => handleTokenPointerDown(event, token)}
                  onPointerMove={handleTokenPointerMove}
                  onPointerUp={handleTokenPointerEnd}
                  onPointerCancel={handleTokenPointerEnd}
                  role="img"
                  aria-label={`${token.name} ${token.kind === "pc" ? "player character" : "NPC"} token${token.canMove ? ", draggable" : ""}`}
                >
                  <title>{token.name}</title>
                  <circle r={tokenRadius} className="campaign-map-token-disc" vectorEffect="non-scaling-stroke" />
                  <text className="campaign-map-token-initials" textAnchor="middle" dominantBaseline="central" fontSize={tokenRadius * 0.72}>{tokenInitials(token.name)}</text>
                  <text className="campaign-map-token-name" textAnchor="middle" y={tokenRadius + Math.max(12, tokenRadius * 0.48)} fontSize={Math.max(11, tokenRadius * 0.42)}>{token.name}</text>
                </g>)}
              </g>
            </svg>}
          </div>

          {settingsOpen && canManage && <aside className="campaign-map-settings" aria-label="Campaign map settings">
            <div className="campaign-map-settings-heading">
              <div><p className="campaign-kicker">GM CONTROLS</p><h3>Map Settings</h3></div>
              <button type="button" className="campaign-quiet" onClick={() => setSettingsOpen(false)}>Hide</button>
            </div>
            <section>
              <h4>Background</h4>
              <p>JPG or PNG · up to 15 MB.</p>
              <label className="campaign-map-upload campaign-primary">
                <span>{map?.backgroundUrl ? "Replace Map Image" : "Upload Map Image"}</span>
                <input type="file" accept="image/jpeg,image/png" disabled={busy} onChange={uploadBackground} />
              </label>
              {map?.backgroundUrl && <button type="button" className="campaign-danger" disabled={busy} onClick={() => void removeBackground()}>Remove Map Image</button>}
            </section>
            <section className="campaign-map-grid-settings">
              <h4>Square Grid</h4>
              <label className="campaign-map-grid-toggle"><input type="checkbox" checked={grid.enabled} onChange={event => setGrid(current => ({ ...current, enabled: event.target.checked }))} /><span>Show grid</span></label>
              <label><span>Cell size</span><input type="number" min="8" max="512" step="1" value={grid.size} onChange={event => setGrid(current => ({ ...current, size: Number(event.target.value) }))} /></label>
              <label><span>Horizontal offset</span><input type="number" step="1" value={grid.offsetX} onChange={event => setGrid(current => ({ ...current, offsetX: Number(event.target.value) }))} /></label>
              <label><span>Vertical offset</span><input type="number" step="1" value={grid.offsetY} onChange={event => setGrid(current => ({ ...current, offsetY: Number(event.target.value) }))} /></label>
              <button type="button" className="campaign-primary" disabled={busy} onClick={() => void saveGrid()}>Save Grid</button>
            </section>
            <section className="campaign-map-token-settings">
              <h4>Tokens</h4>
              <p>GMs can move any token. Players can drag their own linked character token. Grid-enabled maps snap token centers to cells.</p>
              <button type="button" className="campaign-primary" disabled={busy || !map?.backgroundUrl || !encounterAvailable} onClick={() => void tokenAction({ action: "place_encounter" })}>Place Active Encounter</button>
              {!encounterAvailable && <small>Start a live encounter to place all of its current combatants at once.</small>}
              {characters.length > 0 && <div className="campaign-map-character-tokens">
                {characters.map(character => <div key={character.id}><span>{character.name}</span>{placedCharacterIds.has(character.id) ? <small>On map</small> : <button type="button" className="campaign-secondary" disabled={busy || !map?.backgroundUrl} onClick={() => void tokenAction({ action: "place_pc", characterId: character.id })}>Place</button>}</div>)}
              </div>}
              {map?.tokens.length ? <div className="campaign-map-placed-tokens">
                <strong>On the map</strong>
                {map.tokens.map(token => <div key={token.id}><span><b>{token.name}</b><small>{token.kind === "pc" ? "PC" : "NPC"}</small></span><button type="button" className="campaign-quiet" disabled={busy} onClick={() => void tokenAction({ action: "remove", tokenId: token.id })}>Remove</button></div>)}
              </div> : <p>No tokens placed yet.</p>}
            </section>
            <p className="campaign-map-foundation-note">Persistent tokens and live movement are active. Measuring, drawing, fog, lighting, and multiple map layers remain later map phases.</p>
          </aside>}
        </div>
      </section>
    </div>}
  </>;
}
