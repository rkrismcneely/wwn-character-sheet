"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { campaignMapOpenEvent, type CampaignMapOpenDetail } from "./campaign-map-events";

export type CharacterMapCampaign = {
  id: string;
  name: string;
};

export function CampaignCharacterMapControl({ campaigns }: { campaigns: CharacterMapCampaign[] }) {
  const [host, setHost] = useState<Element | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");

  useEffect(() => {
    // This client-only portal target exists only after the character sheet has hydrated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.querySelector(".topbar .status"));
  }, []);

  if (!host || campaigns.length === 0) return null;

  const campaignId = campaigns.some(campaign => campaign.id === selectedCampaignId)
    ? selectedCampaignId
    : campaigns[0].id;

  return createPortal(
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {campaigns.length > 1 && <select
        aria-label="Campaign for map"
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
        aria-label={campaigns.length > 1 ? `Open ${campaigns.find(campaign => campaign.id === campaignId)?.name ?? "campaign"} map` : "Open campaign map"}
        onClick={() => window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
          detail: { campaignId },
        }))}
      >
        Map
      </button>
    </span>,
    host,
  );
}
