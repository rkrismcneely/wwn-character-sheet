"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  campaignStoreOpenEvent,
  campaignStoreStateEvent,
  type CampaignStoreOpenDetail,
  type CampaignStoreStateDetail,
} from "./campaign-store-events";

export type CharacterStoreCampaign = {
  id: string;
  name: string;
};

export function CampaignCharacterStoreControl({
  campaigns,
}: {
  campaigns: CharacterStoreCampaign[];
}) {
  const [host, setHost] = useState<Element | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [openCampaignIds, setOpenCampaignIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const refreshHost = () => {
      const durableHost = document.querySelector(".app-header .app-header-utilities");
      const nextHost = durableHost ?? document.querySelector(".topbar .status");
      setHost(currentHost => currentHost === nextHost ? currentHost : nextHost);
      return Boolean(durableHost);
    };
    if (refreshHost()) return;
    const observer = new MutationObserver(() => {
      if (refreshHost()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const campaignIds = new Set(campaigns.map(campaign => campaign.id));
    const onStoreState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignStoreStateDetail>).detail;
      if (!detail || !campaignIds.has(detail.campaignId)) return;
      setOpenCampaignIds(current => {
        const alreadyOpen = current.has(detail.campaignId);
        if (alreadyOpen === detail.open) return current;
        const next = new Set(current);
        if (detail.open) next.add(detail.campaignId);
        else next.delete(detail.campaignId);
        return next;
      });
    };
    window.addEventListener(campaignStoreStateEvent, onStoreState);
    return () => window.removeEventListener(campaignStoreStateEvent, onStoreState);
  }, [campaigns]);

  if (!host || campaigns.length === 0) return null;
  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId) ?? campaigns[0];
  const campaignId = selectedCampaign.id;
  const storeIsOpen = openCampaignIds.has(campaignId);

  return createPortal(
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {campaigns.length > 1 && <select
        aria-label="Campaign for store"
        value={campaignId}
        onChange={event => setSelectedCampaignId(event.target.value)}
        style={{
          maxWidth: 180,
          border: "1px solid #806944",
          borderRadius: 2,
          padding: "6px 8px",
          background: "#292116",
          color: "inherit",
        }}
      >
        {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
      </select>}
      <button
        type="button"
        data-readonly-interactive="true"
        aria-label={campaigns.length > 1
          ? `${storeIsOpen ? "Close" : "Open"} ${selectedCampaign.name} store`
          : `${storeIsOpen ? "Close" : "Open"} campaign store`}
        aria-pressed={storeIsOpen}
        onClick={() => window.dispatchEvent(new CustomEvent<CampaignStoreOpenDetail>(campaignStoreOpenEvent, {
          detail: { campaignId, action: storeIsOpen ? "close" : "open" },
        }))}
      >
        {storeIsOpen ? "Close Store" : "Store"}
      </button>
    </span>,
    host,
  );
}
