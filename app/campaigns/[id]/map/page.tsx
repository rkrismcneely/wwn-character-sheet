import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { CampaignServiceError, getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { CampaignMapLauncher } from "../../campaign-map-launcher";
import "../../campaign-ui.css";
import "../../campaign-map.css";

export const metadata = { title: "Campaign Map | Tales Without End", robots: { index: false, follow: false } };

/** Same-origin independent map host used by the desktop pop-out fallback. */
export default async function CampaignMapPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id } = await params;
  let context: Awaited<ReturnType<typeof loadCampaignAccess>>;
  try {
    context = await loadCampaignAccess(await getCampaignD1(), actor, id);
  } catch (error) {
    if (error instanceof CampaignServiceError && error.status < 500) notFound();
    throw error;
  }
  const { campaign, membership } = context;
  return <CampaignMapLauncher
    campaignId={id}
    campaignName={campaign.name}
    canManage={canManageCampaignContent(actor, campaign, membership)}
    showFloatingButton={false}
    initialOpen
    initialPresentation="standalone"
  />;
}
