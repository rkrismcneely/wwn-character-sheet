"use client";

import { useEffect } from "react";

function movableToken(target: EventTarget | null): SVGGElement | null {
  return target instanceof Element
    ? target.closest<SVGGElement>(".campaign-map-token.is-movable")
    : null;
}

export function MapTokenDragGhostRuntime() {
  useEffect(() => {
    let ghost: SVGGElement | null = null;
    let source: SVGGElement | null = null;
    let activePointerId: number | null = null;
    let originalTransform: string | null = null;
    let frame: number | null = null;

    const clearGhost = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      ghost?.remove();
      ghost = null;
      source = null;
      activePointerId = null;
      originalTransform = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const token = movableToken(event.target);
      if (!token) return;

      clearGhost();
      source = token;
      activePointerId = event.pointerId;
      originalTransform = token.getAttribute("transform");

      // The token's React handler stops propagation, so this listener must run
      // in the capture phase. Wait one animation frame after capture so React
      // can commit its drag-origin/distance state before we add the unmanaged
      // SVG clone. The real token then moves imperatively while this clone
      // remains at the authoritative starting transform.
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!source?.isConnected || activePointerId === null) return;
        const clone = source.cloneNode(true) as SVGGElement;
        clone.classList.add("campaign-map-token-drag-origin");
        clone.classList.remove("is-movable");
        clone.querySelector(".campaign-map-token-distance")?.remove();
        clone.setAttribute("pointer-events", "none");
        clone.setAttribute("aria-hidden", "true");
        clone.setAttribute("opacity", "0.5");
        clone.removeAttribute("role");
        if (originalTransform === null) clone.removeAttribute("transform");
        else clone.setAttribute("transform", originalTransform);
        source.parentNode?.insertBefore(clone, source);
        ghost = clone;
      });
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (activePointerId === event.pointerId) clearGhost();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("blur", clearGhost);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("blur", clearGhost);
      clearGhost();
    };
  }, []);

  return null;
}
