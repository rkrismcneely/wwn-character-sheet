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

    const clearGhost = () => {
      ghost?.remove();
      ghost = null;
      source = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const token = movableToken(event.target);
      if (!token) return;
      clearGhost();
      const clone = token.cloneNode(true) as SVGGElement;
      clone.classList.add("campaign-map-token-drag-origin");
      clone.classList.remove("is-movable");
      clone.setAttribute("pointer-events", "none");
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("role");
      token.parentNode?.insertBefore(clone, token);
      ghost = clone;
      source = token;
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!source || event.pointerId !== source.getPointerCapture?.(event.pointerId)) {
        clearGhost();
        return;
      }
      clearGhost();
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", clearGhost, true);
    window.addEventListener("blur", clearGhost);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", clearGhost, true);
      window.removeEventListener("blur", clearGhost);
      clearGhost();
    };
  }, []);

  return null;
}
