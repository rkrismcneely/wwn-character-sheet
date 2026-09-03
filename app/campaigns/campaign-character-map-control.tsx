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
    const refreshHost = () => {
      // CharacterSheet starts on the legacy topbar while Better Auth hydrates,
      // then replaces it with the shared signed-in header. Prefer that durable
      // host whenever it exists, while retaining the legacy host as a fallback.
      const nextHost = document.querySelector(".app-header .app-header-utilities")
        ?? document.querySelector(".topbar .status");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHost(currentHost => currentHost === nextHost ? currentHost : nextHost);
      return Boolean(document.querySelector(".app-header .app-header-utilities"));
    };

    if (refreshHost()) return;

    // The signed-in header can appear after this control's first effect. Watch
    // only until it does so the portal is moved off the temporary topbar instead
    // of remaining attached to a DOM node that auth hydration removes.
    const observer = new MutationObserver(() => {
      if (refreshHost()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
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
