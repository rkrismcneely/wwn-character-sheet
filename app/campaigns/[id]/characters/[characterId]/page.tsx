import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import CharacterSheet, {
  type InitialCharacterPayload,
} from "@/app/character-sheet";
import { CampaignCharacterSideTools } from "@/app/campaigns/campaign-character-side-tools";
import { CampaignMapLauncher } from "@/app/campaigns/campaign-map-launcher";
import { CampaignStoreLauncher } from "@/app/campaigns/campaign-store-launcher";
import { getSessionActor } from "@/lib/auth-session";
import { readCampaignLinkedCharacter } from "@/lib/campaigns/characters";
import { CampaignServiceError, getCampaignD1 } from "@/lib/campaigns/service";
import "../../../campaign-ui.css";
import "../../../campaign-map.css";
import "../../../campaign-store.css";
import "../../../campaign-character-side-tools.css";

type RouteContext = {
  params: Promise<{ id: string; characterId: string }>;
};

export const metadata: Metadata = {
  title: "Campaign Character | Tales Without End",
  robots: { index: false, follow: false },
};

async function loadCampaignCharacter(
  actor: NonNullable<Awaited<ReturnType<typeof getSessionActor>>>,
  campaignId: string,
  characterId: string,
) {
  try {
    return await readCampaignLinkedCharacter(
      await getCampaignD1(),
      actor,
      campaignId,
      characterId,
    );
  } catch (error) {
    if (error instanceof CampaignServiceError && error.status < 500) notFound();
    throw error;
  }
}

export default async function CampaignCharacterPage(context: RouteContext) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id, characterId } = await context.params;
  const payload = await loadCampaignCharacter(actor, id, characterId);
  const campaigns = [{ id, name: payload.campaignContext.name }];
  return <>
    <CharacterSheet
      initialCharacter={payload as InitialCharacterPayload}
      campaignContext={payload.campaignContext}
    />
    <CampaignCharacterSideTools campaigns={campaigns} />
    <CampaignMapLauncher
      campaignId={id}
      campaignName={payload.campaignContext.name}
      canManage={false}
      showFloatingButton={false}
    />
    <CampaignStoreLauncher
      campaignId={id}
      campaignName={payload.campaignContext.name}
      characterId={characterId}
    />
  </>;
}
