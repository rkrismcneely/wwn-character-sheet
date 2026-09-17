"use client";

import { useEffect, useState } from "react";
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

/**
 * Character-sheet launcher rail for campaign table tools. This intentionally
 * lives at the viewport edge rather than in the global header, matching the
 * map drawer's existing pull-tab interaction.
 */
export function CampaignCharacterSideTools({ campaigns }: { campaigns: CharacterSideToolCampaign[] }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [mapOpenIds, setMapOpenIds] = useState<Set<string>>(() => new Set());
  const [storeOpenIds, setStoreOpenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const campaignIds = new Set(campaigns.map(campaign => campaign.id));
    const onMapState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapStateDetail>).detail;
      if (!detail || !campaignIds.has(detail.campaignId)) return;
      setMapOpenIds(current => {
        const next = new Set(current);
        if (detail.open) next.add(detail.campaignId);
        else next.delete(detail.campaignId);
        return next;
      });
    };
    const onStoreState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreStateDetail>).detail;
      if (!detail || !campaignIds.has(detail.campaignId)) return;
      setStoreOpenIds(current => {
        const next = new Set(current);
        if (detail.open) next.add(detail.campaignId);
        else next.delete(detail.campaignId);
        return next;
      });
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

  const toggleMap = () => {
    if (!mapIsOpen) {
      window.dispatchEvent(new CustomEvent<CampaignStoreOpenDetail>(campaignStoreOpenEvent, {
        detail: { campaignId, action: "close" },
      }));
    }
    window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
      detail: { campaignId, action: mapIsOpen ? "close" : "open" },
    }));
  };

  const toggleStore = () => {
    if (!storeIsOpen) {
      window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
        detail: { campaignId, action: "close" },
      }));
    }
    window.dispatchEvent(new CustomEvent<CampaignStoreOpenDetail>(campaignStoreOpenEvent, {
      detail: { campaignId, action: storeIsOpen ? "close" : "open" },
    }));
  };

  return <div className="campaign-character-side-tools" aria-label="Campaign tools">
    {campaigns.length > 1 && <select
      className="campaign-character-side-tools-campaign"
      aria-label="Campaign for side tools"
      value={campaignId}
      onChange={event => setSelectedCampaignId(event.target.value)}
    >
      {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
    </select>}
    <button
      type="button"
      className={`campaign-character-side-tool${mapIsOpen ? " is-open" : ""}`}
      aria-label={`${mapIsOpen ? "Close" : "Open"} ${selectedCampaign.name} map`}
      aria-pressed={mapIsOpen}
      onClick={toggleMap}
    >
      {mapIsOpen ? "Close Map" : "Open Map"}
    </button>
    <button
      type="button"
      className={`campaign-character-side-tool${storeIsOpen ? " is-open" : ""}`}
      aria-label={`${storeIsOpen ? "Close" : "Open"} ${selectedCampaign.name} store`}
      aria-pressed={storeIsOpen}
      onClick={toggleStore}
    >
      {storeIsOpen ? "Close Store" : "Open Store"}
    </button>
  </div>;
}
