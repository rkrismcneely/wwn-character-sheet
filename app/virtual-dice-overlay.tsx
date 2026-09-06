"use client";

import { createPortal } from "react-dom";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  VirtualDiceRendererAdapter,
  type VirtualDiceRequest,
  type VirtualDiceTheme,
} from "./virtual-dice-adapter";

export type VirtualDiceOverlayHandle = {
  roll: (request: VirtualDiceRequest) => Promise<void>;
  cancel: () => void;
};

export const VirtualDiceOverlay = forwardRef<VirtualDiceOverlayHandle, { theme: VirtualDiceTheme }>(
  function VirtualDiceOverlay({ theme }, ref) {
    const [mounted, setMounted] = useState(false);
    const [active, setActive] = useState(false);
    const scene = useRef<HTMLDivElement>(null);
    const adapter = useRef<VirtualDiceRendererAdapter | null>(null);

    useEffect(() => {
      setMounted(true);
      return () => adapter.current?.destroy();
    }, []);

    useImperativeHandle(ref, () => ({
      async roll(request) {
        if (!scene.current) throw new Error("The virtual dice overlay is unavailable.");
        setActive(true);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        adapter.current ||= new VirtualDiceRendererAdapter(scene.current);
        try {
          await adapter.current.roll(request);
        } finally {
          setActive(false);
          adapter.current.cancel();
        }
      },
      cancel() {
        adapter.current?.cancel();
        setActive(false);
      },
    }), []);

    if (!mounted) return null;
    return createPortal(
      <div
        className={`virtual-dice-overlay ${active ? "is-active" : ""}`}
        aria-hidden="true"
        data-theme={theme}
        style={{
          background: active
            ? theme === "dark" ? "rgba(0, 0, 0, 0.36)" : "rgba(35, 24, 12, 0.20)"
            : "transparent",
        }}
      >
        <div ref={scene} className="virtual-dice-scene" />
      </div>,
      document.body,
    );
  },
);

VirtualDiceOverlay.displayName = "VirtualDiceOverlay";
