"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  campaignMapOpenEvent,
  campaignMapStateEvent,
  type CampaignMapOpenDetail,
  type CampaignMapStateDetail,
} from "./campaign-map-events";
import {
  campaignStoreOpenEvent,
  campaignStoreStateEvent,
  type CampaignStoreOpenDetail,
  type CampaignStoreStateDetail,
} from "./campaign-store-events";

export type CharacterSideToolCampaign = {
  id: string;
  name: string;
};

type DrawerDock = "left" | "right";
const drawerDockStorageKey = "twe:campaign-map:drawer-dock";

function readDrawerDock(): DrawerDock {
  try {
    return window.localStorage.getItem(drawerDockStorageKey) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

/**
 * Character-sheet launcher rail for campaign table tools. It occupies the same
 * viewport edge as the map drawer's pull tab, rather than the global header.
 * Once a drawer opens, that drawer's own edge control takes over.
 */
export function CampaignCharacterSideTools({ campaigns }: { campaigns: CharacterSideToolCampaign[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [mapOpenIds, setMapOpenIds] = useState<Set<string>>(() => new Set());
  const [storeOpenIds, setStoreOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const syncDock = () => {
      const rail = railRef.current;
      if (!rail) return;
      const dock = readDrawerDock();
      rail.classList.toggle("is-left", dock === "left");
      rail.classList.toggle("is-right", dock === "right");
    };
    syncDock();

    const campaignIds = new Set(campaigns.map(campaign => campaign.id));
    const updateSet = (
      setter: Dispatch<SetStateAction<Set<string>>>,
      campaignId: string,
      open: boolean,
    ) => {
      if (!campaignIds.has(campaignId)) return;
      setter(current => {
        const alreadyOpen = current.has(campaignId);
        if (alreadyOpen === open) return current;
        const next = new Set(current);
        if (open) next.add(campaignId);
        else next.delete(campaignId);
        return next;
      });
    };

    const onMapState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapStateDetail>).detail;
      if (!detail) return;
      updateSet(setMapOpenIds, detail.campaignId, detail.open);
      if (!detail.open) syncDock();
    };
    const onStoreState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreStateDetail>).detail;
      if (!detail) return;
      updateSet(setStoreOpenIds, detail.campaignId, detail.open);
    };

    window.addEventListener(campaignMapStateEvent, onMapState);
    window.addEventListener(campaignStoreStateEvent, onStoreState);
    return () => {
      window.removeEventListener(campaignMapStateEvent, onMapState);
      window.removeEventListener(campaignStoreStateEvent, onStoreState);
    };
  }, [campaigns]);

  if (campaigns.length === 0) return null;
  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId) ?? campaigns[0];
  const campaignId = selectedCampaign.id;
  const mapIsOpen = mapOpenIds.has(campaignId);
  const storeIsOpen = storeOpenIds.has(campaignId);

  // The open drawer supplies its own close/collapse affordance. Do not leave a
  // second Map/Store control floating over the drawer.
  if (mapIsOpen || storeIsOpen) return null;

  const openMap = () => {
    window.dispatchEvent(new CustomEvent<CampaignStoreOpenDetail>(campaignStoreOpenEvent, {
      detail: { campaignId, action: "close" },
    }));
    window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
      detail: { campaignId, action: "open" },
    }));
  };

  const openStore = () => {
    window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
      detail: { campaignId, action: "close" },
    }));
    window.dispatchEvent(new CustomEvent<CampaignStoreOpenDetail>(campaignStoreOpenEvent, {
      detail: { campaignId, action: "open" },
    }));
  };

  return <div
    ref={railRef}
    className="campaign-character-side-tools is-right"
    aria-label="Campaign tools"
    data-campaign-character-side-tools
  >
    {campaigns.length > 1 && <select
      className="campaign-character-side-tools-campaign"
      aria-label="Campaign for Map and Store"
      value={campaignId}
      onChange={event => setSelectedCampaignId(event.target.value)}
    >
      {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
    </select>}
    <button
      type="button"
      className="campaign-character-side-tool"
      aria-label={`Open ${selectedCampaign.name} map`}
      onClick={openMap}
    >
      Map
    </button>
    <button
      type="button"
      className="campaign-character-side-tool"
      aria-label={`Open ${selectedCampaign.name} store`}
      onClick={openStore}
    >
      Store
    </button>
  </div>;
}
