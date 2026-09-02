"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { campaignMapOpenEvent, type CampaignMapOpenDetail } from "./campaign-map-events";

export function CampaignCharacterMapControl({ campaignId }: { campaignId: string }) {
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    // This client-only portal target exists only after the character sheet has hydrated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.querySelector(".topbar .status"));
  }, []);

  if (!host) return null;

  return createPortal(
    <button
      type="button"
      data-readonly-interactive="true"
      aria-label="Open campaign map"
      onClick={() => window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
        detail: { campaignId },
      }))}
    >
      Map
    </button>,
    host,
  );
}
