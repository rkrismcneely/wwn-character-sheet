import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { GmConsole } from "@/app/campaigns/gm-console";
import { CampaignMapLauncher } from "@/app/campaigns/campaign-map-launcher";
import { canManageCampaignRuntime } from "@/lib/campaigns/authorization";
import { CampaignServiceError, getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import "../../campaign-ui.css";
import "../../campaign-map.css";
import "../../gm-encounter-drawer.css";
import "../../campaign-store.css";
import "../../gm-console-roll-toolbar.css";

export const metadata = { title: "GM Console | Tales Without End", robots: { index: false, follow: false } };

export default async function GmConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id } = await params;
  let campaignName: string;
  try {
    const { campaign } = await loadCampaignAccess(await getCampaignD1(), actor, id);
    if (!canManageCampaignRuntime(actor, campaign)) notFound();
    campaignName = campaign.name;
  } catch (error) {
    if (error instanceof CampaignServiceError && error.status < 500) notFound();
    throw error;
  }
  return <>
    <GmConsole campaignId={id} campaignName={campaignName} />
    <CampaignMapLauncher campaignId={id} campaignName={campaignName} canManage />
  </>;
}
