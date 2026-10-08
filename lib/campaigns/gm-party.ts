import { canManageCampaignRuntime } from "./authorization.ts";
import { campaignGmPartyStatus, type CampaignCharacterCardData, type CampaignGmPartyStatus } from "./character-card.ts";
import { CampaignServiceError, loadCampaignAccess } from "./service.ts";
import type { CampaignActor } from "./types.ts";

interface GmPartyRow {
  publicId: string;
  name: string;
  player: string;
  classLabel: string;
  level: number;
  data: string;
}

export type GmPartyCharacterPayload = CampaignGmPartyStatus;

/** Minimal owner/admin projection for the GM Console Party tab; never exposes raw character data. */
export async function listGmPartyCharacters(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
): Promise<GmPartyCharacterPayload[]> {
  const { campaign } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (!canManageCampaignRuntime(actor, campaign)) throw new CampaignServiceError("Not permitted.", 403);
  const result = await db.prepare(
    `SELECT ch.public_id AS publicId, ch.name, ch.player, ch.class_label AS classLabel,
            ch.level, ch.data
     FROM campaign_characters cc
     INNER JOIN characters ch ON ch.id = cc.character_id
     WHERE cc.campaign_id = ? AND ch.public_id IS NOT NULL
     ORDER BY lower(ch.name), ch.updated_at DESC`,
  ).bind(campaign.id).all<GmPartyRow>();
  return result.results.map(row => {
    let data: CampaignCharacterCardData = {};
    try { data = JSON.parse(row.data || "{}") as CampaignCharacterCardData; } catch { /* use row fallbacks */ }
    return campaignGmPartyStatus(data, {
      id: row.publicId,
      name: row.name,
      player: row.player,
      level: row.level,
      classLabel: row.classLabel,
    });
  });
}
