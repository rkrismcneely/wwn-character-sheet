/** Pinch geometry shared by mobile map hosts. Uses SVG's default xMidYMid meet layout. */
export type MapTouchPoint = { x: number; y: number };
export type MapTouchView = { x: number; y: number; width: number; height: number };
export type MapTouchViewport = { left: number; top: number; width: number; height: number };

export function touchPairMetrics(a: MapTouchPoint, b: MapTouchPoint): { center: MapTouchPoint; distance: number } {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

/**
 * Pinch zooms around the world coordinate initially between the fingers.
 * Translating the midpoint pans the map too, without drifting the anchor.
 * Limits match the existing zoom toolbar and mouse-wheel controls.
 */
export function pinchMapView({
  startView, startDistance, distance, anchor, center, viewport, mapWidth, mapHeight,
}: {
  startView: MapTouchView;
  startDistance: number;
  distance: number;
  anchor: MapTouchPoint;
  center: MapTouchPoint;
  viewport: MapTouchViewport;
  mapWidth: number;
  mapHeight: number;
}): MapTouchView {
  if (![startDistance, distance, mapWidth, mapHeight, viewport.width, viewport.height].every(
    value => Number.isFinite(value) && value > 0,
  ) || distance < 8) return startView;
  const width = Math.min(mapWidth * 1.5, Math.max(mapWidth / 12, startView.width * startDistance / distance));
  const height = width * mapHeight / mapWidth;
  const pixelsPerUnit = Math.min(viewport.width / width, viewport.height / height);
  const padX = (viewport.width - width * pixelsPerUnit) / 2;
  const padY = (viewport.height - height * pixelsPerUnit) / 2;
  return {
    x: anchor.x - (center.x - viewport.left - padX) / pixelsPerUnit,
    y: anchor.y - (center.y - viewport.top - padY) / pixelsPerUnit,
    width,
    height,
  };
}
