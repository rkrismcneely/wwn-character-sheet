import { isPlausiblePublicCharacterId } from "../characters/identifiers.ts";
import type { InventoryItemKind } from "../inventory/items.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type CampaignItemVisibility = "all" | "selected";

export interface CampaignItem {
  id: string;
  campaignId: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  visibility: CampaignItemVisibility;
  characterIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AvailableCampaignItem {
  id: string;
  campaignId: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignItemTarget {
  id: string;
  name: string;
}

export interface CampaignItemManagementPayload {
  items: CampaignItem[];
  characters: CampaignItemTarget[];
}

export interface CampaignItemDraft {
  name?: unknown;
  kind?: unknown;
  description?: unknown;
  visibility?: unknown;
  characterIds?: unknown;
}

interface CampaignItemRow {
  id: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  visibility: CampaignItemVisibility;
  createdAt: string;
  updatedAt: string;
}

interface LinkedCharacterRow {
  id: string;
  publicId: string;
  name: string;
  ownerUserId: string;
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
  allowLineBreaks = false,
): string {
  if ((value === undefined || value === null || value === "") && !required) return "";
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const result = value.trim();
  const invalidControl = allowLineBreaks
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  if ((!result && required) || result.length > maximum || invalidControl.test(result)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return result;
}

function kind(value: unknown): InventoryItemKind {
  if (value === "mundane" || value === "magical") return value;
  throw new CampaignServiceError("Item type is invalid.", 422);
}

function visibility(value: unknown): CampaignItemVisibility {
  if (value === undefined || value === "all") return "all";
  if (value === "selected") return "selected";
  throw new CampaignServiceError("Item visibility is invalid.", 422);
}

function targetIds(value: unknown, mode: CampaignItemVisibility): string[] {
  if (mode === "all") return [];
  if (!Array.isArray(value)) throw new CampaignServiceError("Choose at least one visible character.", 422);
  const ids = [...new Set(value.filter((candidate): candidate is string => typeof candidate === "string"))];
  if (!ids.length || ids.length > 100 || ids.some(id => !isPlausiblePublicCharacterId(id))) {
    throw new CampaignServiceError("Choose at least one valid visible character.", 422);
  }
  return ids;
}

async function ownerCampaign(db: D1Database, actor: CampaignActor, campaignPublicId: string, mutation = false) {
  const { campaign } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (campaign.ownerUserId !== actor.userId) {
    throw new CampaignServiceError("Only the campaign owner can manage campaign items.", 403);
  }
  if (mutation) requireActiveCampaign(campaign);
  return campaign;
}

async function linkedCharacters(db: D1Database, campaignId: string): Promise<LinkedCharacterRow[]> {
  const result = await db.prepare(
    `SELECT ch.id, ch.public_id AS publicId, ch.name, ch.owner_user_id AS ownerUserId
     FROM campaign_characters cc
     INNER JOIN characters ch ON ch.id = cc.character_id
     WHERE cc.campaign_id = ? AND ch.public_id IS NOT NULL
     ORDER BY lower(ch.name), ch.updated_at DESC`,
  ).bind(campaignId).all<LinkedCharacterRow>();
  return result.results;
}

async function resolveTargets(
  db: D1Database,
  campaignId: string,
  requestedPublicIds: readonly string[],
): Promise<LinkedCharacterRow[]> {
  if (!requestedPublicIds.length) return [];
  const candidates = await linkedCharacters(db, campaignId);
  const requested = new Set(requestedPublicIds);
  const resolved = candidates.filter(character => requested.has(character.publicId));
  if (resolved.length !== requested.size) {
    throw new CampaignServiceError("Every selected character must be linked to this campaign.", 422);
  }
  return resolved;
}

function normalizedDraft(draft: CampaignItemDraft) {
  const itemVisibility = visibility(draft.visibility);
  return {
    name: text(draft.name, "Item name", 80),
    kind: kind(draft.kind ?? "mundane"),
    description: text(draft.description, "Item description", 2000, false, true),
    visibility: itemVisibility,
    characterIds: targetIds(draft.characterIds, itemVisibility),
  };
}

async function targetMap(db: D1Database, campaignId: string): Promise<Map<string, string[]>> {
  const result = await db.prepare(
    `SELECT cic.campaign_item_id AS itemId, ch.public_id AS publicId
     FROM campaign_item_characters cic
     INNER JOIN campaign_items ci ON ci.id = cic.campaign_item_id
     INNER JOIN characters ch ON ch.id = cic.character_id
     INNER JOIN campaign_characters cc
       ON cc.campaign_id = ci.campaign_id AND cc.character_id = ch.id
     WHERE ci.campaign_id = ? AND ch.public_id IS NOT NULL
     ORDER BY lower(ch.name)`,
  ).bind(campaignId).all<{ itemId: string; publicId: string }>();
  const map = new Map<string, string[]>();
  for (const row of result.results) map.set(row.itemId, [...(map.get(row.itemId) ?? []), row.publicId]);
  return map;
}

function toManagedItem(row: CampaignItemRow, campaignPublicId: string, targets: Map<string, string[]>): CampaignItem {
  return {
    id: row.id,
    campaignId: campaignPublicId,
    name: row.name,
    kind: row.kind,
    description: row.description,
    visibility: row.visibility,
    characterIds: row.visibility === "selected" ? targets.get(row.id) ?? [] : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCampaignItemsForManagement(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
): Promise<CampaignItemManagementPayload> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId);
  const [itemResult, characters, targets] = await Promise.all([
    db.prepare(
      `SELECT id, name, kind, description, visibility_mode AS visibility,
              created_at AS createdAt, updated_at AS updatedAt
       FROM campaign_items WHERE campaign_id = ?
       ORDER BY lower(name), updated_at DESC`,
    ).bind(campaign.id).all<CampaignItemRow>(),
    linkedCharacters(db, campaign.id),
    targetMap(db, campaign.id),
  ]);
  return {
    items: itemResult.results.map(row => toManagedItem(row, campaign.publicId, targets)),
    characters: characters.map(character => ({ id: character.publicId, name: character.name })),
  };
}

export async function listCampaignItemsForCharacter(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  rawCharacterId: unknown,
): Promise<AvailableCampaignItem[]> {
  if (typeof rawCharacterId !== "string" || !isPlausiblePublicCharacterId(rawCharacterId)) {
    throw new CampaignServiceError("A valid character is required.", 422);
  }
  const { campaign, membership } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (actor.role === "admin" && actor.userId !== campaign.ownerUserId && !membership) {
    throw new CampaignServiceError("Campaign not found.", 404);
  }
  const character = await db.prepare(
    `SELECT ch.id, ch.public_id AS publicId, ch.name, ch.owner_user_id AS ownerUserId
     FROM campaign_characters cc
     INNER JOIN characters ch ON ch.id = cc.character_id
     WHERE cc.campaign_id = ? AND ch.public_id = ?`,
  ).bind(campaign.id, rawCharacterId).first<LinkedCharacterRow>();
  if (!character) throw new CampaignServiceError("Character not found.", 404);
  if (actor.userId !== campaign.ownerUserId && character.ownerUserId !== actor.userId) {
    throw new CampaignServiceError("Character not found.", 404);
  }
  const result = await db.prepare(
    `SELECT ci.id, ci.name, ci.kind, ci.description,
            ci.created_at AS createdAt, ci.updated_at AS updatedAt
     FROM campaign_items ci
     WHERE ci.campaign_id = ?
       AND (
         ci.visibility_mode = 'all'
         OR EXISTS (
           SELECT 1 FROM campaign_item_characters cic
           WHERE cic.campaign_item_id = ci.id AND cic.character_id = ?
         )
       )
     ORDER BY lower(ci.name), ci.updated_at DESC`,
  ).bind(campaign.id, character.id).all<Omit<CampaignItemRow, "visibility">>();
  return result.results.map(row => ({
    id: row.id,
    campaignId: campaign.publicId,
    name: row.name,
    kind: row.kind,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createCampaignItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  draft: CampaignItemDraft,
  now = new Date().toISOString(),
): Promise<CampaignItem> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const value = normalizedDraft(draft);
  const targets = await resolveTargets(db, campaign.id, value.characterIds);
  const id = `citem_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.batch([
    db.prepare(
      `INSERT INTO campaign_items
        (id, campaign_id, name, kind, description, visibility_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, campaign.id, value.name, value.kind, value.description, value.visibility, now, now),
    ...targets.map(target => db.prepare(
      `INSERT INTO campaign_item_characters (campaign_item_id, character_id) VALUES (?, ?)`,
    ).bind(id, target.id)),
  ]);
  return { id, campaignId: campaign.publicId, ...value, createdAt: now, updatedAt: now };
}

export async function updateCampaignItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  itemId: string,
  draft: CampaignItemDraft,
  now = new Date().toISOString(),
): Promise<CampaignItem> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const existing = await db.prepare(
    `SELECT id, created_at AS createdAt FROM campaign_items WHERE campaign_id = ? AND id = ?`,
  ).bind(campaign.id, itemId).first<{ id: string; createdAt: string }>();
  if (!existing) throw new CampaignServiceError("Campaign item not found.", 404);
  const value = normalizedDraft(draft);
  const targets = await resolveTargets(db, campaign.id, value.characterIds);
  await db.batch([
    db.prepare(
      `UPDATE campaign_items
       SET name = ?, kind = ?, description = ?, visibility_mode = ?, updated_at = ?
       WHERE campaign_id = ? AND id = ?`,
    ).bind(value.name, value.kind, value.description, value.visibility, now, campaign.id, itemId),
    db.prepare("DELETE FROM campaign_item_characters WHERE campaign_item_id = ?").bind(itemId),
    ...targets.map(target => db.prepare(
      `INSERT INTO campaign_item_characters (campaign_item_id, character_id) VALUES (?, ?)`,
    ).bind(itemId, target.id)),
  ]);
  return { id: itemId, campaignId: campaign.publicId, ...value, createdAt: existing.createdAt, updatedAt: now };
}

export async function deleteCampaignItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  itemId: string,
): Promise<void> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const result = await db.prepare(
    "DELETE FROM campaign_items WHERE campaign_id = ? AND id = ?",
  ).bind(campaign.id, itemId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Campaign item not found.", 404);
}
