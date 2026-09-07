"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  campaignMapOpenEvent,
  campaignMapStateEvent,
  type CampaignMapOpenDetail,
  type CampaignMapStateDetail,
} from "./campaign-map-events";

export type CharacterMapCampaign = {
  id: string;
  name: string;
};

export function CampaignCharacterMapControl({ campaigns }: { campaigns: CharacterMapCampaign[] }) {
  const [host, setHost] = useState<Element | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0]?.id ?? "");
  const [openCampaignIds, setOpenCampaignIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const refreshHost = () => {
      // CharacterSheet starts on the legacy topbar while Better Auth hydrates,
      // then replaces it with the shared signed-in header. Prefer that durable
      // host whenever it exists, while retaining the legacy host as a fallback.
      const durableHost = document.querySelector(".app-header .app-header-utilities");
      const nextHost = durableHost ?? document.querySelector(".topbar .status");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHost(currentHost => currentHost === nextHost ? currentHost : nextHost);
      return Boolean(durableHost);
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

  useEffect(() => {
    const campaignIds = new Set(campaigns.map(campaign => campaign.id));
    const onMapState = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapStateDetail>).detail;
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
    window.addEventListener(campaignMapStateEvent, onMapState);
    return () => window.removeEventListener(campaignMapStateEvent, onMapState);
  }, [campaigns]);

  if (!host || campaigns.length === 0) return null;

  const selectedCampaign = campaigns.find(campaign => campaign.id === selectedCampaignId) ?? campaigns[0];
  const campaignId = selectedCampaign.id;
  const mapIsOpen = openCampaignIds.has(campaignId);

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
        aria-label={campaigns.length > 1
          ? `${mapIsOpen ? "Close" : "Open"} ${selectedCampaign.name} map`
          : `${mapIsOpen ? "Close" : "Open"} campaign map`}
        aria-pressed={mapIsOpen}
        onClick={() => window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
          detail: { campaignId, action: mapIsOpen ? "close" : "open" },
        }))}
      >
        {mapIsOpen ? "Close Map" : "Map"}
      </button>
    </span>,
    host,
  );
}
