"use client";

import { useEffect } from "react";
import {
  campaignMapOpenEvent,
  campaignMapStateEvent,
  type CampaignMapOpenDetail,
  type CampaignMapStateDetail,
} from "./campaigns/campaign-map-events";
import {
  campaignStoreOpenEvent,
  campaignStoreStateEvent,
  type CampaignStoreOpenDetail,
  type CampaignStoreStateDetail,
} from "./campaigns/campaign-store-events";

const mapDrawerDockStorageKey = "twe:campaign-map:drawer-dock";
const mapDrawerRootSelector = ".campaign-map-presentation-drawer, .campaign-map-drawer-collapse";
const storeDrawerRootSelector = ".campaign-store-backdrop";

type DrawerFocusState = {
  campaignId: string | null;
  returnFocus: HTMLElement | null;
};

function activeHTMLElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function rememberReturnFocus(state: DrawerFocusState): void {
  const active = activeHTMLElement();
  if (!active || active === document.body || active === document.documentElement) return;
  if (active.closest(`${mapDrawerRootSelector}, ${storeDrawerRootSelector}`)) return;
  state.returnFocus = active;
}

function focusDrawerControl(selector: string): void {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (target?.isConnected) target.focus();
  });
}

function restoreDrawerFocus(state: DrawerFocusState, rootSelector: string): void {
  const active = activeHTMLElement();
  const returnFocus = state.returnFocus;
  state.returnFocus = null;
  const shouldRestore = !active
    || active === document.body
    || active === document.documentElement
    || Boolean(active.closest(rootSelector));
  if (!shouldRestore || !returnFocus?.isConnected) return;
  window.requestAnimationFrame(() => {
    if (returnFocus.isConnected) returnFocus.focus();
  });
}

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
    const mapFocus: DrawerFocusState = { campaignId: null, returnFocus: null };
    const storeFocus: DrawerFocusState = { campaignId: null, returnFocus: null };

    try {
      const storedDock = window.localStorage.getItem(mapDrawerDockStorageKey);
      if (storedDock === "left" || storedDock === "right") root.dataset.campaignMapPreferredDock = storedDock;
    } catch {}

    const onMapOpen = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapOpenDetail>).detail;
      if (!detail || detail.action === "close") return;
      mapFocus.campaignId = detail.campaignId;
      rememberReturnFocus(mapFocus);
    };
    const onMapState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapStateDetail>).detail;
      if (!detail) return;
      if (detail.open) {
        mapFocus.campaignId = detail.campaignId;
        if (!mapFocus.returnFocus) rememberReturnFocus(mapFocus);
        focusDrawerControl(".campaign-map-drawer-collapse");
        return;
      }
      if (mapFocus.campaignId !== detail.campaignId) return;
      restoreDrawerFocus(mapFocus, mapDrawerRootSelector);
      mapFocus.campaignId = null;
    };
    const onStoreOpen = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreOpenDetail>).detail;
      if (!detail || detail.action === "close") return;
      storeFocus.campaignId = detail.campaignId;
      rememberReturnFocus(storeFocus);
    };
    const onStoreState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreStateDetail>).detail;
      if (!detail) return;
      if (detail.open) {
        storeFocus.campaignId = detail.campaignId;
        if (!storeFocus.returnFocus) rememberReturnFocus(storeFocus);
        focusDrawerControl(".campaign-store-close");
        return;
      }
      if (storeFocus.campaignId !== detail.campaignId) return;
      restoreDrawerFocus(storeFocus, storeDrawerRootSelector);
      storeFocus.campaignId = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !mapFocus.campaignId) return;
      if (!document.querySelector(".campaign-map-host-drawer")) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
        detail: { campaignId: mapFocus.campaignId, action: "close" },
      }));
    };

    syncMapUi();
    const observer = new MutationObserver(syncMapUi);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener(campaignMapOpenEvent, onMapOpen);
    window.addEventListener(campaignMapStateEvent, onMapState);
    window.addEventListener(campaignStoreOpenEvent, onStoreOpen);
    window.addEventListener(campaignStoreStateEvent, onStoreState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      window.removeEventListener(campaignMapOpenEvent, onMapOpen);
      window.removeEventListener(campaignMapStateEvent, onMapState);
      window.removeEventListener(campaignStoreOpenEvent, onStoreOpen);
      window.removeEventListener(campaignStoreStateEvent, onStoreState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
