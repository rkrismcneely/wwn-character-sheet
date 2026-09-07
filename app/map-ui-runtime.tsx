"use client";

import { useEffect } from "react";

const mapDrawerDockStorageKey = "twe:campaign-map:drawer-dock";

function syncMapUi(): void {
  const root = document.documentElement;
  const drawer = document.querySelector(".campaign-map-host-drawer") as unknown as HTMLElement | null;
  if (drawer?.classList.contains("campaign-map-drawer-left")) root.dataset.campaignMapPreferredDock = "left";
  else if (drawer?.classList.contains("campaign-map-drawer-right")) root.dataset.campaignMapPreferredDock = "right";

  for (const node of document.querySelectorAll(".campaign-map-presentation-picker select")) {
    const select = node as unknown as HTMLSelectElement;
    const popOut = Array.from(select.options).find(option => option.value === "pip");
    if (popOut && popOut.textContent !== "Pop Out") popOut.textContent = "Pop Out";
  }
}

export function MapUiRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    try {
      const storedDock = window.localStorage.getItem(mapDrawerDockStorageKey);
      if (storedDock === "left" || storedDock === "right") root.dataset.campaignMapPreferredDock = storedDock;
    } catch {}

    syncMapUi();
    const observer = new MutationObserver(syncMapUi);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
