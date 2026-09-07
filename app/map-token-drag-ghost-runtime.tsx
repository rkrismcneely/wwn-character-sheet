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

      // The map's pointer-down handler updates React state for the distance
      // label/origin. An unmanaged SVG clone inserted synchronously gets
      // removed by that render. Wait one animation frame so React finishes
      // that commit, then leave the passive clone behind while the real token
      // continues on the optimized direct-DOM drag path.
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

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("blur", clearGhost);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("blur", clearGhost);
      clearGhost();
    };
  }, []);

  return null;
}
