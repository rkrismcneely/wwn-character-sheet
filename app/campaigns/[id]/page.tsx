import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CampaignDetail } from "../campaign-detail";
import { CampaignMapLauncher } from "../campaign-map-launcher";
import "../campaign-ui.css";
import "../campaign-map.css";

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
    <CampaignMapLauncher campaignId={id} campaignName="Shared Campaign Map" canManage={false} />
  </>;
}
