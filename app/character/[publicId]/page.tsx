import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CharacterSheet, { type InitialCharacterPayload } from "../../character-sheet";
import { CampaignCharacterMapControl } from "@/app/campaigns/campaign-character-map-control";
import { CampaignCharacterStoreControl } from "@/app/campaigns/campaign-character-store-control";
import { CampaignMapLauncher } from "@/app/campaigns/campaign-map-launcher";
import { CampaignStoreLauncher } from "@/app/campaigns/campaign-store-launcher";
import { getSessionActor } from "@/lib/auth-session";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import {
  canReadRow,
  characterApiPayload,
  characterSummary,
  findCharacterByPublicId,
  getD1,
} from "@/app/api/characters/db";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { listAuthorizedCharacterCampaigns } from "@/lib/campaigns/characters";
import "../../campaigns/campaign-ui.css";
import "../../campaigns/campaign-map.css";
import "../../campaigns/campaign-store.css";

type RouteContext = { params: Promise<{ publicId: string }> };

async function loadCharacter(publicId: string): Promise<InitialCharacterPayload | null> {
  if (!isPlausiblePublicCharacterId(publicId)) return null;
  const requestHeaders = await headers();
  const actor = await getSessionActor({ headers: requestHeaders });
  const db = await getD1();
  const row = await findCharacterByPublicId(db, publicId);
  if (!row || !canReadRow(actor, row)) return null;
  return {
    ...characterApiPayload(row, actor),
    campaigns: await listAuthorizedCharacterCampaigns(db, actor, publicId),
  } as InitialCharacterPayload;
}

export async function generateMetadata(
  context: RouteContext,
): Promise<Metadata> {
  const { publicId } = await context.params;
  const payload = await loadCharacter(publicId);
  if (!payload) {
    return {
      title: "Character not found | Tales Without End",
      robots: { index: false, follow: false },
    };
  }

  const summary = characterSummary(payload.character);
  const canonical = `${CANONICAL_ORIGIN}/character/${publicId}`;
  const indexable = payload.visibility === "public";
  return {
    title: `${summary.name} | Tales Without End`,
    description: `${summary.classLabel}, level ${summary.level}. A Worlds Without Number character sheet.`,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      title: `${summary.name} | Tales Without End`,
      description: `${summary.classLabel}, level ${summary.level}.`,
      type: "website",
      url: canonical,
    },
  };
}

export default async function CharacterPage(context: RouteContext) {
  const { publicId } = await context.params;
  const payload = await loadCharacter(publicId);
  if (!payload) notFound();
  const campaigns = payload.campaigns ?? [];
  return <>
    <CharacterSheet initialCharacter={payload} />
    {campaigns.length > 0 && <>
      <CampaignCharacterMapControl campaigns={campaigns} />
      <CampaignCharacterStoreControl campaigns={campaigns} />
      {campaigns.map(campaign => <CampaignMapLauncher
        key={campaign.id}
        campaignId={campaign.id}
        campaignName={campaign.name}
        canManage={false}
        showFloatingButton={campaigns.length === 1}
      />)}
      {campaigns.map(campaign => <CampaignStoreLauncher key={`store-${campaign.id}`} campaignId={campaign.id} campaignName={campaign.name} characterId={publicId} />)}
    </>}
  </>;
}
