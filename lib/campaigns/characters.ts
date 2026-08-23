import {
  canAttachCharacterToCampaign,
  canDetachCharacterFromCampaign,
  canViewCampaignLinkedCharacter,
} from "./authorization.ts";
import {
  CampaignServiceError,
  loadCampaignAccess,
} from "./service.ts";
import type {
  CampaignActor,
  CampaignCharacterLinkRecord,
  CampaignCharacterRecord,
} from "./types.ts";
import type { CharacterVisibility } from "../characters/authorization.ts";
import { isPlausiblePublicCharacterId } from "../characters/identifiers.ts";
import { parseCharacter } from "../characters/sanitize.ts";
import { effectiveDisplayName } from "../account/display-name.ts";
import { campaignCardArmorClass, campaignCardClassLabel, campaignCardHpMax, type CampaignCharacterCardData } from "./character-card.ts";

interface CharacterLinkRow extends CampaignCharacterRecord {
  publicId: string;
  name: string;
  classLabel: string;
  level: number;
  visibility: CharacterVisibility;
  updatedAt: string;
  providerName: string;
  customDisplayName: string | null;
  portraitKey: string | null;
  data: string;
}

interface CampaignLinkedCharacterRow extends CharacterLinkRow {
  data: string;
  version: number;
  createdAt: string;
  portraitKey: string | null;
}

export interface CampaignCharacterSummaryPayload {
  id: string;
  name: string;
  classLabel: string;
  level: number;
  visibility: CharacterVisibility;
  updatedAt: string;
  ownerName: string;
  portraitUrl: string | null;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  isMine: boolean;
  permissions: {
    canUnlink: boolean;
    canEdit: boolean;
    adminReadOnly: boolean;
  };
}

export interface CampaignLinkedCharacterPayload {
  id: string;
  character: Record<string, unknown>;
  version: number;
  visibility: CharacterVisibility;
  createdAt: string;
  updatedAt: string;
  permissions: {
    canEdit: boolean;
    adminReadOnly: boolean;
  };
  campaignContext: {
    id: string;
    name: string;
    readOnly: boolean;
  };
  campaigns: CharacterCampaignLink[];
}

export interface CharacterCampaignLink {
  id: string;
  name: string;
}

function requireActor(actor: CampaignActor | null): CampaignActor {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  return actor;
}

function characterNotFound(): CampaignServiceError {
  return new CampaignServiceError("Character not found.", 404);
}

function normalizeCharacterId(value: unknown): string {
  if (typeof value !== "string" || !isPlausiblePublicCharacterId(value)) {
    throw new CampaignServiceError("A valid character is required.", 422);
  }
  return value;
}

function summaryPayload(
  actor: CampaignActor,
  row: CharacterLinkRow,
  campaignPublicId: string,
): CampaignCharacterSummaryPayload {
  const isMine = row.ownerUserId === actor.userId;
  let cardData: CampaignCharacterCardData = {};
  try {
    cardData = JSON.parse(row.data || "{}") as CampaignCharacterCardData;
  } catch {
    cardData = {};
  }
  return {
    id: row.publicId,
    name: row.name,
    classLabel: campaignCardClassLabel(cardData, row.classLabel),
    level: Number(row.level) || 1,
    visibility: row.visibility,
    updatedAt: row.updatedAt,
    ownerName: effectiveDisplayName(row.customDisplayName, row.providerName),
    portraitUrl: row.portraitKey ? `/api/campaigns/${campaignPublicId}/characters/${row.publicId}/portrait` : null,
    hpCurrent: Math.max(0, Number(cardData.hpCurrent) || 0),
    hpMax: campaignCardHpMax(cardData),
    armorClass: campaignCardArmorClass(cardData),
    isMine,
    permissions: {
      canUnlink: actor.role !== "admin" && isMine,
      canEdit: isMine,
      adminReadOnly: actor.role === "admin" && !isMine,
    },
  };
}

async function findCharacterForCampaign(
  db: D1Database,
  publicId: string,
): Promise<CharacterLinkRow | null> {
  return db
    .prepare(
      `SELECT ch.id, ch.owner_user_id AS ownerUserId,
              ch.public_id AS publicId, ch.visibility, ch.name,
              ch.class_label AS classLabel, ch.level,
              ch.updated_at AS updatedAt, ch.portrait_key AS portraitKey, ch.data, u.name AS providerName, u.display_name AS customDisplayName
       FROM characters ch
       INNER JOIN user u ON u.id = ch.owner_user_id
       WHERE ch.public_id = ?`,
    )
    .bind(publicId)
    .first<CharacterLinkRow>();
}

export async function listCampaignCharacters(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
): Promise<CampaignCharacterSummaryPayload[]> {
  const authenticatedActor = requireActor(actor);
  const { campaign } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const result = await db
    .prepare(
      `SELECT ch.id, ch.owner_user_id AS ownerUserId,
              ch.public_id AS publicId, ch.visibility, ch.name,
              ch.class_label AS classLabel, ch.level,
              ch.updated_at AS updatedAt, ch.portrait_key AS portraitKey, ch.data, u.name AS providerName, u.display_name AS customDisplayName
       FROM campaign_characters cc
       INNER JOIN characters ch ON ch.id = cc.character_id
       INNER JOIN user u ON u.id = ch.owner_user_id
       WHERE cc.campaign_id = ? AND ch.public_id IS NOT NULL
       ORDER BY lower(ch.name), ch.updated_at DESC`,
    )
    .bind(campaign.id)
    .all<CharacterLinkRow>();
  return result.results.map(row => summaryPayload(authenticatedActor, row, campaignPublicId));
}

/**
 * Return only the minimal campaign navigation projection the character owner
 * is authorized to see. A public/unlisted reader (including a site admin who
 * is not the owner) learns nothing about private campaign membership.
 */
export async function listAuthorizedCharacterCampaigns(
  db: D1Database,
  actor: CampaignActor | null,
  rawCharacterId: unknown,
): Promise<CharacterCampaignLink[]> {
  if (!actor || typeof rawCharacterId !== "string" || !isPlausiblePublicCharacterId(rawCharacterId)) {
    return [];
  }
  const result = await db
    .prepare(
      `SELECT c.public_id AS id, c.name
       FROM characters ch
       INNER JOIN campaign_characters cc ON cc.character_id = ch.id
       INNER JOIN campaigns c ON c.id = cc.campaign_id
       INNER JOIN campaign_members cm
         ON cm.campaign_id = c.id AND cm.user_id = ?
       WHERE ch.public_id = ? AND ch.owner_user_id = ?
       ORDER BY lower(c.name), c.updated_at DESC`,
    )
    .bind(actor.userId, rawCharacterId, actor.userId)
    .all<CharacterCampaignLink>();
  return result.results.map(({ id, name }) => ({ id, name }));
}

export async function listEligibleCampaignCharacters(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
): Promise<CampaignCharacterSummaryPayload[]> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  if (authenticatedActor.role === "admin") return [];

  const existingLink = await db
    .prepare(
      `SELECT linked.id AS characterId
       FROM campaign_characters cc
       INNER JOIN characters linked ON linked.id = cc.character_id
       WHERE cc.campaign_id = ? AND linked.owner_user_id = ?
       LIMIT 1`,
    )
    .bind(campaign.id, authenticatedActor.userId)
    .first<{ characterId: string }>();
  // GMs retain the existing optional-link behavior. Ordinary players with a
  // link receive owned alternatives so they can replace it atomically.
  if (existingLink && membership?.role !== "player") return [];

  const result = await db
    .prepare(
      `SELECT ch.id, ch.owner_user_id AS ownerUserId,
              ch.public_id AS publicId, ch.visibility, ch.name,
              ch.class_label AS classLabel, ch.level,
              ch.updated_at AS updatedAt, ch.portrait_key AS portraitKey, ch.data, u.name AS providerName, u.display_name AS customDisplayName
       FROM characters ch
       INNER JOIN user u ON u.id = ch.owner_user_id
       WHERE ch.owner_user_id = ? AND ch.public_id IS NOT NULL
         AND ch.id <> coalesce(?, '')
         AND NOT EXISTS (
           SELECT 1 FROM campaign_characters cc
           WHERE cc.campaign_id = ? AND cc.character_id = ch.id
         )
       ORDER BY ch.updated_at DESC`,
    )
    .bind(authenticatedActor.userId, existingLink?.characterId ?? null, campaign.id)
    .all<CharacterLinkRow>();
  return result.results
    .filter(row => canAttachCharacterToCampaign(
      authenticatedActor,
      campaign,
      membership,
      row,
    ))
    .map(row => summaryPayload(authenticatedActor, row, campaignPublicId));
}

export async function replaceCampaignCharacter(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  rawCurrentCharacterId: unknown,
  rawReplacementCharacterId: unknown,
  now = new Date().toISOString(),
): Promise<CampaignCharacterSummaryPayload> {
  const authenticatedActor = requireActor(actor);
  const currentPublicId = normalizeCharacterId(rawCurrentCharacterId);
  const replacementPublicId = normalizeCharacterId(rawReplacementCharacterId);
  if (currentPublicId === replacementPublicId) {
    throw new CampaignServiceError("Choose a different character.", 422);
  }
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  if (authenticatedActor.role === "admin" || membership?.role !== "player") {
    throw new CampaignServiceError("Not permitted.", 403);
  }

  const [current, replacement] = await Promise.all([
    findCharacterForCampaign(db, currentPublicId),
    findCharacterForCampaign(db, replacementPublicId),
  ]);
  if (!current || !replacement) throw characterNotFound();
  if (
    current.ownerUserId !== authenticatedActor.userId
    || replacement.ownerUserId !== authenticatedActor.userId
    || !canAttachCharacterToCampaign(
      authenticatedActor,
      campaign,
      membership,
      replacement,
    )
  ) {
    throw new CampaignServiceError("Not permitted.", 403);
  }

  try {
    // One guarded UPDATE is atomic in D1: the old link remains intact if the
    // membership, ownership, current link, or replacement changes while the
    // confirmation dialog is open.
    const result = await db
      .prepare(
        `UPDATE campaign_characters
         SET character_id = ?, added_at = ?
         WHERE campaign_id = ? AND character_id = ?
           AND EXISTS (
             SELECT 1 FROM campaign_members cm
             WHERE cm.campaign_id = campaign_characters.campaign_id
               AND cm.user_id = ? AND cm.role = 'player'
           )
           AND EXISTS (
             SELECT 1 FROM characters old_character
             WHERE old_character.id = campaign_characters.character_id
               AND old_character.owner_user_id = ?
           )
           AND EXISTS (
             SELECT 1 FROM characters new_character
             WHERE new_character.id = ? AND new_character.owner_user_id = ?
           )`,
      )
      .bind(
        replacement.id,
        now,
        campaign.id,
        current.id,
        authenticatedActor.userId,
        authenticatedActor.userId,
        replacement.id,
        authenticatedActor.userId,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new CampaignServiceError(
        "Your campaign character changed before this request completed. Refresh and try again.",
        409,
      );
    }
  } catch (error) {
    if (error instanceof CampaignServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("PRIMARY KEY")) {
      throw new CampaignServiceError(
        "That character is already linked to this campaign.",
        409,
      );
    }
    throw error;
  }

  return summaryPayload(authenticatedActor, replacement, campaignPublicId);
}

export async function linkCharacterToCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  rawCharacterId: unknown,
  now = new Date().toISOString(),
): Promise<CampaignCharacterSummaryPayload> {
  const authenticatedActor = requireActor(actor);
  const characterPublicId = normalizeCharacterId(rawCharacterId);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const character = await findCharacterForCampaign(db, characterPublicId);
  if (!character) throw characterNotFound();
  if (
    authenticatedActor.role === "admin"
    || !canAttachCharacterToCampaign(
      authenticatedActor,
      campaign,
      membership,
      character,
    )
  ) {
    throw new CampaignServiceError("Not permitted.", 403);
  }

  try {
    const result = await db
      .prepare(
        `INSERT INTO campaign_characters (campaign_id, character_id, added_at)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1
           FROM campaign_characters cc
           INNER JOIN characters linked ON linked.id = cc.character_id
           WHERE cc.campaign_id = ? AND linked.owner_user_id = ?
         )`,
      )
      .bind(
        campaign.id,
        character.id,
        now,
        campaign.id,
        authenticatedActor.userId,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new CampaignServiceError(
        "You already have a character linked to this campaign.",
        409,
      );
    }
  } catch (error) {
    if (error instanceof CampaignServiceError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("PRIMARY KEY")) {
      throw new CampaignServiceError(
        "This character is already linked to the campaign.",
        409,
      );
    }
    throw error;
  }
  return summaryPayload(authenticatedActor, character, campaignPublicId);
}

export async function unlinkCharacterFromCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  rawCharacterId: unknown,
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  const characterPublicId = normalizeCharacterId(rawCharacterId);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const character = await findCharacterForCampaign(db, characterPublicId);
  if (!character) throw characterNotFound();
  if (
    authenticatedActor.role === "admin"
    || !canDetachCharacterFromCampaign(
      authenticatedActor,
      campaign,
      membership,
      character,
    )
  ) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  const result = await db
    .prepare(
      `DELETE FROM campaign_characters
       WHERE campaign_id = ? AND character_id = ?`,
    )
    .bind(campaign.id, character.id)
    .run();
  if (result.meta.changes !== 1) throw characterNotFound();
}

export async function readCampaignLinkedCharacter(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  rawCharacterId: unknown,
  options: { rewritePortrait?: boolean } = {},
): Promise<CampaignLinkedCharacterPayload> {
  const authenticatedActor = requireActor(actor);
  const characterPublicId = normalizeCharacterId(rawCharacterId);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const row = await db
    .prepare(
      `SELECT ch.id, ch.owner_user_id AS ownerUserId,
              ch.public_id AS publicId, ch.visibility, ch.name,
              ch.class_label AS classLabel, ch.level,
              ch.data, ch.version, ch.portrait_key AS portraitKey,
              ch.created_at AS createdAt, ch.updated_at AS updatedAt,
              u.name AS providerName, u.display_name AS customDisplayName
       FROM campaign_characters cc
       INNER JOIN characters ch ON ch.id = cc.character_id
       INNER JOIN user u ON u.id = ch.owner_user_id
       WHERE cc.campaign_id = ? AND ch.public_id = ?`,
    )
    .bind(campaign.id, characterPublicId)
    .first<CampaignLinkedCharacterRow>();
  if (!row) throw characterNotFound();
  const link: CampaignCharacterLinkRecord = {
    campaignId: campaign.id,
    characterId: row.id,
  };
  if (!canViewCampaignLinkedCharacter(
    authenticatedActor,
    campaign,
    membership,
    link,
    row,
  )) {
    throw characterNotFound();
  }
  const character = parseCharacter(JSON.parse(row.data) as unknown);
  if (!character) throw new Error("Stored character data is invalid.");
  const canEdit = row.ownerUserId === authenticatedActor.userId;
  if (
    !canEdit
    && options.rewritePortrait !== false
    && typeof character.portrait === "string"
    && character.portrait.startsWith("/api/portraits/")
  ) {
    character.portrait = `/api/campaigns/${campaign.publicId}/characters/${row.publicId}/portrait`;
  }
  return {
    id: row.publicId,
    character,
    version: row.version,
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    permissions: {
      canEdit,
      adminReadOnly: authenticatedActor.role === "admin" && !canEdit,
    },
    campaignContext: {
      id: campaign.publicId,
      name: campaign.name,
      readOnly: !canEdit,
    },
    campaigns: canEdit
      ? await listAuthorizedCharacterCampaigns(db, authenticatedActor, row.publicId)
      : [],
  };
}
