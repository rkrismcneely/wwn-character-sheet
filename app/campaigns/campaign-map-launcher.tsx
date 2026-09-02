"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { CampaignMapPayload } from "@/lib/campaigns/map";

type ViewBox = { x: number; y: number; width: number; height: number };
type GridDraft = { enabled: boolean; size: number; offsetX: number; offsetY: number };

type MapResponse = {
  map?: CampaignMapPayload | null;
  permissions?: { canManage?: boolean };
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [map, setMap] = useState<CampaignMapPayload | null>(null);
  const [canManage, setCanManage] = useState(initialCanManage);
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

  async function loadMap() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/map`, { cache: "no-store" });
      const body = await response.json() as MapResponse;
      if (!response.ok) throw new Error(body.error || "The campaign map could not be loaded.");
      const nextMap = body.map ?? null;
      setMap(nextMap);
      setCanManage(Boolean(body.permissions?.canManage));
      setGrid(gridFor(nextMap));
      setView(fullView(nextMap));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The campaign map could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  function showMap() {
    setOpen(true);
    setSettingsOpen(false);
    void loadMap();
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
    if (!view || event.button !== 0) return;
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
    if (!map?.backgroundUrl || !window.confirm("Remove the current campaign map image? Grid settings will be kept.")) return;
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
              aria-label="Campaign map. Drag to pan and use the mouse wheel or toolbar buttons to zoom."
            >
              <defs>
                <pattern id={patternId} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY} width={map.grid.size} height={map.grid.size}>
                  <path d={`M ${map.grid.size} 0 L 0 0 0 ${map.grid.size}`} fill="none" stroke="rgba(255,255,255,.52)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
                </pattern>
              </defs>
              <image href={map.backgroundUrl} x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} preserveAspectRatio="none" draggable="false" />
              {map.grid.enabled && <rect x="0" y="0" width={map.backgroundWidth} height={map.backgroundHeight} fill={`url(#${patternId})`} pointerEvents="none" />}
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
            <p className="campaign-map-foundation-note">Tokens, encounter placement, measuring, drawing, and live movement are the next map layer.</p>
          </aside>}
        </div>
      </section>
    </div>}
  </>;
}
