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

export type CharacterCampaignSideTab = {
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

export function CampaignCharacterSideTabs({ campaigns }: { campaigns: CharacterCampaignSideTab[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [openMapCampaignIds, setOpenMapCampaignIds] = useState<Set<string>>(() => new Set());
  const [openStoreCampaignIds, setOpenStoreCampaignIds] = useState<Set<string>>(() => new Set());

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
      updateSet(setOpenMapCampaignIds, detail.campaignId, detail.open);
      if (!detail.open) syncDock();
    };
    const onStoreState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreStateDetail>).detail;
      if (!detail) return;
      updateSet(setOpenStoreCampaignIds, detail.campaignId, detail.open);
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
  const mapOpen = openMapCampaignIds.has(campaignId);
  const storeOpen = openStoreCampaignIds.has(campaignId);

  // Once a drawer is open, its own close/collapse control takes over. Keeping
  // the rail hidden prevents duplicate controls sitting on top of the drawer.
  if (mapOpen || storeOpen) return null;

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

  return <div ref={railRef} className="campaign-character-side-tabs is-right" data-campaign-character-side-tabs>
    {campaigns.length > 1 && <select
      className="campaign-character-side-tabs-campaign"
      aria-label="Campaign for Map and Store"
      value={campaignId}
      onChange={event => setSelectedCampaignId(event.target.value)}
    >
      {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
    </select>}
    <button type="button" className="campaign-character-side-tab" onClick={openMap} aria-label={`Open ${selectedCampaign.name} map`}>
      Map
    </button>
    <button type="button" className="campaign-character-side-tab" onClick={openStore} aria-label={`Open ${selectedCampaign.name} store`}>
      Store
    </button>
  </div>;
}
