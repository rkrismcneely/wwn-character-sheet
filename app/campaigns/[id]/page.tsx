import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CampaignDetail } from "../campaign-detail";
import { CampaignMapLazyLauncher } from "../campaign-map-lazy-launcher";
import { CampaignStoreLauncher } from "../campaign-store-launcher";
import "../campaign-ui.css";
import "../campaign-journal.css";
import "../campaign-map.css";
import "../gm-encounter-drawer.css";
import "../campaign-store.css";
import "../gm-console-roll-toolbar.css";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id } = await params;
  const { tab } = await searchParams;
  return <>
    <CampaignDetail campaignId={id} initialTab={tab === "journal" ? "journal" : "campaign"} />
    <CampaignMapLazyLauncher campaignId={id} campaignName="Shared Campaign Map" canManage={false} />
    <CampaignStoreLauncher campaignId={id} campaignName="Campaign Store" />
  </>;
}
