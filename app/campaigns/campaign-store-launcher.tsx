"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CampaignStore, CampaignStoreItem, CampaignStoreItemKind } from "@/lib/campaigns/stores";
import { campaignMapDockEvent, campaignMapOpenEvent } from "./campaign-map-events";
import {
  campaignStoreOpenEvent,
  campaignStoreStateEvent,
  type CampaignStoreOpenDetail,
} from "./campaign-store-events";

type ActiveStoreResponse = {
  store?: CampaignStore | null;
  error?: string;
};

type CampaignStoreDrawerDock = "left" | "right";

const mapDrawerDockStorageKey = "twe:campaign-map:drawer-dock";

function preferredStoreDrawerDock(): CampaignStoreDrawerDock {
  if (typeof window === "undefined") return "right";
  try {
    return window.localStorage.getItem(mapDrawerDockStorageKey) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

function kindLabel(kind: CampaignStoreItemKind): string {
  if (kind === "armor") return "Armour";
  if (kind === "magical") return "Magical Item";
  if (kind === "weapon") return "Weapon";
  if (kind === "shield") return "Shield";
  if (kind === "bundle") return "Gear Bundle";
  if (kind === "gear") return "Adventuring Gear";
  return "Mundane Item";
}

function stockLabel(item: CampaignStoreItem): string {
  if (item.quantity === null) return "Unlimited stock";
  if (item.quantity === 0) return "Out of stock";
  return `${item.quantity} in stock`;
}

function StoreItemCard({ item }: { item: CampaignStoreItem }) {
  return <article className="campaign-store-item">
    <div className="campaign-store-item-heading">
      <div>
        <p className="campaign-store-kind">{kindLabel(item.kind)}</p>
        <h3>{item.name}</h3>
      </div>
      <strong className="campaign-store-cost">{item.cost}</strong>
    </div>
    {item.description && <p className="campaign-store-description">{item.description}</p>}
    {item.details && <p className="campaign-store-details">{item.details}</p>}
    {item.note && <p className="campaign-store-note">{item.note}</p>}
    <small className={item.quantity === 0 ? "campaign-store-item-stock sold-out" : "campaign-store-item-stock"}>{stockLabel(item)}</small>
  </article>;
}

/**
 * Players read store-item snapshots through this drawer. The request is scoped
 * to their linked character, but intentionally does not consult the source
 * campaign item's normal visibility setting.
 */
export function CampaignStoreLauncher({
  campaignId,
  campaignName,
  characterId,
}: {
  campaignId: string;
  campaignName: string;
  characterId: string;
}) {
  const [open, setOpen] = useState(false);
  const [drawerDock, setDrawerDock] = useState<CampaignStoreDrawerDock>(preferredStoreDrawerDock);
  const [store, setStore] = useState<CampaignStore | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadStore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ characterId });
      const response = await fetch(`/api/campaigns/${campaignId}/stores/active?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json() as ActiveStoreResponse;
      if (!response.ok) throw new Error(body.error || "The active store could not be opened.");
      setStore(body.store ?? null);
    } catch (loadError) {
      setStore(null);
      setError(loadError instanceof Error ? loadError.message : "The active store could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, characterId]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    const syncDock = (nextDock?: CampaignStoreDrawerDock) => {
      setDrawerDock(nextDock ?? preferredStoreDrawerDock());
    };
    const onDockChange = (event: Event) => {
      const detail = (event as CustomEvent<{ dock?: CampaignStoreDrawerDock }>).detail;
      if (detail?.dock === "left" || detail?.dock === "right") {
        syncDock(detail.dock);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === mapDrawerDockStorageKey) syncDock();
    };
    window.addEventListener(campaignMapDockEvent, onDockChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(campaignMapDockEvent, onDockChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const onOpenStore = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreOpenDetail>).detail;
      if (detail?.campaignId !== campaignId) return;
      if (detail.action === "close") {
        close();
        return;
      }
      window.dispatchEvent(new CustomEvent(campaignMapOpenEvent, {
        detail: { campaignId, action: "close" },
      }));
      setOpen(true);
      void loadStore();
    };
    window.addEventListener(campaignStoreOpenEvent, onOpenStore);
    return () => window.removeEventListener(campaignStoreOpenEvent, onOpenStore);
  }, [campaignId, close, loadStore]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(campaignStoreStateEvent, {
      detail: { campaignId, open },
    }));
  }, [campaignId, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const clear = () => {
      delete root.dataset.campaignStoreDrawer;
      root.style.removeProperty("--campaign-store-drawer-space");
      delete root.dataset.campaignStorePane;
    };
    const sync = () => {
      if (!window.matchMedia("(min-width: 821px)").matches) {
        clear();
        return;
      }
      const width = Math.min(460, Math.max(320, window.innerWidth - 32));
      root.dataset.campaignStoreDrawer = drawerDock;
      const remainingWidth = Math.max(0, window.innerWidth - width);
      root.dataset.campaignStorePane = remainingWidth < 760 ? "narrow" : remainingWidth < 1120 ? "compact" : "wide";
      root.style.setProperty("--campaign-store-drawer-space", `${width}px`);
    };
    sync();
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      clear();
    };
  }, [drawerDock, open]);

  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return store?.items ?? [];
    return (store?.items ?? []).filter(item =>
      [item.name, item.kind, item.description, item.details, item.note]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [query, store]);

  if (!open) return null;
  const drawerCollapseControl = <button
    type="button"
    className={`campaign-store-drawer-collapse campaign-store-drawer-collapse-${drawerDock}`}
    aria-label="Close Store"
    aria-expanded="true"
    title="Close Store"
    onClick={close}
  >
    <span className="campaign-store-drawer-collapse-label">Close Store</span>
  </button>;
  return <div className="campaign-store-backdrop" role="presentation">
    {drawerCollapseControl}
    <aside className={`campaign-store-drawer campaign-store-drawer-${drawerDock}`} role="dialog" aria-modal="false" aria-labelledby="campaign-store-title">
      <header className="campaign-store-header">
        <div>
          <p className="campaign-kicker">CAMPAIGN STORE</p>
          <h2 id="campaign-store-title">{store?.name ?? campaignName}</h2>
          {store?.description && <p>{store.description}</p>}
        </div>
        <button type="button" className="campaign-store-close" onClick={close} aria-label="Close Store">×</button>
      </header>
      {error && <p className="campaign-error campaign-store-error" role="alert">{error}</p>}
      {loading && <p className="campaign-store-empty" role="status">Opening store…</p>}
      {!loading && !error && !store && <div className="campaign-store-empty">
        <h3>No store is currently open</h3>
        <p>The GM can make a prepared store visible to the party from the GM Console.</p>
      </div>}
      {!loading && !error && store && <>
        <div className="campaign-store-search">
          <label>
            <span>Browse {store.items.length} stocked {store.items.length === 1 ? "item" : "items"}</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search stock…"
              aria-label="Search store stock"
            />
          </label>
        </div>
        <div className="campaign-store-list">
          {!items.length && <p className="campaign-store-empty">No stocked items match that search.</p>}
          {items.map(item => <StoreItemCard key={item.id} item={item} />)}
        </div>
      </>}
    </aside>
  </div>;
}
