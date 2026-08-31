import { useEffect, type RefObject } from "react";

export function shouldDismissPointerInteraction(startedInside: boolean, endedInside: boolean) {
  return !startedInside && !endedInside;
}

export function useDismissibleSurface({
  open,
  surface,
  onDismiss,
}: {
  open: boolean;
  surface: RefObject<HTMLElement | null>;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    let pointerId: number | null = null;
    let startedInside = false;
    const isInside = (target: EventTarget | null) => target instanceof Node && Boolean(surface.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      pointerId = event.pointerId;
      startedInside = isInside(event.target);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const endedInside = isInside(event.target);
      if (shouldDismissPointerInteraction(startedInside, endedInside)) onDismiss();
      pointerId = null;
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointerId) pointerId = null;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [onDismiss, open, surface]);
}
