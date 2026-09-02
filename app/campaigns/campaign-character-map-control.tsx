"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { campaignMapOpenEvent, type CampaignMapOpenDetail } from "./campaign-map-events";

export function CampaignCharacterMapControl({ campaignId }: { campaignId: string }) {
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector(".campaign-character-context"));
  }, []);

  if (!host) return null;

  return createPortal(
    <button
      type="button"
      className="campaign-secondary"
      data-readonly-interactive="true"
      style={{ marginLeft: "auto", whiteSpace: "nowrap" }}
      onClick={() => window.dispatchEvent(new CustomEvent<CampaignMapOpenDetail>(campaignMapOpenEvent, {
        detail: { campaignId },
      }))}
    >
      Open Map
    </button>,
    host,
  );
}
