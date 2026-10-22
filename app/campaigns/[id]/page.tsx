import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CampaignDetail } from "../campaign-detail";
import { CampaignMapLazyLauncher } from "../campaign-map-lazy-launcher";
import "../campaign-ui.css";
import "../campaign-map.css";
import "../gm-encounter-drawer.css";
import "../campaign-store.css";
import "../gm-console-roll-toolbar.css";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id } = await params;
  return <>
    <CampaignDetail campaignId={id} />
    <CampaignMapLazyLauncher campaignId={id} campaignName="Shared Campaign Map" canManage={false} />
  </>;
}
