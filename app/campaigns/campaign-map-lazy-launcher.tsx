"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { campaignMapOpenEvent, type CampaignMapOpenDetail } from "./campaign-map-events";

// The full editor, annotation tools, and map libraries are not needed until the
// campaign map is opened. Keep the real workspace mounted after first use.
const MapWorkspace = dynamic(
  () => import("./campaign-map-launcher").then(module => module.CampaignMapLauncher),
  { ssr: false, loading: () => <div className="campaign-map-lazy-loading" role="status">Opening map…</div> },
);

type Props = { campaignId: string; campaignName: string; canManage: boolean };

export function CampaignMapLazyLauncher(props: Props) {
  const [opened, setOpened] = useState(false);
  const [drawerDock] = useState<"left" | "right">(() => {
    if (typeof window === "undefined") return "right";
    try { return window.localStorage.getItem("twe:campaign-map:drawer-dock") === "left" ? "left" : "right"; }
    catch { return "right"; }
  });

  useEffect(() => {
    const onMapOpen = (event: Event) => {
      const detail = (event as CustomEvent<CampaignMapOpenDetail>).detail;
      if (detail?.campaignId === props.campaignId && detail.action !== "close") setOpened(true);
    };
    window.addEventListener(campaignMapOpenEvent, onMapOpen);
    return () => window.removeEventListener(campaignMapOpenEvent, onMapOpen);
  }, [props.campaignId]);

  if (opened) return <MapWorkspace {...props} initialOpen />;
  return <>
    <button type="button" className={`campaign-map-collapsed-drawer campaign-map-collapsed-drawer-${drawerDock}`} aria-pressed="false" onClick={() => setOpened(true)}>Open Map</button>
    <button type="button" className="campaign-map-mobile-launcher-button" aria-pressed="false" onClick={() => setOpened(true)}>Map</button>
  </>;
}
