import {
  canManageCampaignContent,
  canViewCampaign,
} from "./authorization.ts";
import {
  storeCatalog,
  storeCatalogById,
  type StoreCatalogCategory,
  type StoreCatalogKind,
  type StoreCatalogSource,
} from "../../app/store-catalog-data.ts";
import type { CampaignItemProperties, InventoryItemKind } from "../inventory/items.ts";
import {
  CampaignServiceError,
  loadCampaignAccess,
  requireActiveCampaign,
} from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type CampaignStoreSourceType = "srd" | "campaign";
export type CampaignStoreItemKind = StoreCatalogKind;

export interface CampaignStoreItem {
  id: string;
  storeId: string;
  sourceType: CampaignStoreSourceType;
  sourceItemId: string | null;
  name: string;
  kind: CampaignStoreItemKind;
  description: string;
  details: string;
  properties: CampaignItemProperties;
  cost: string;
  quantity: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStore {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  proprietorName: string;
  proprietorDescription: string;
  proprietorNpcId: string | null;
  isActive: boolean;
  items: CampaignStoreItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStoreCatalogItem {
  id: string;
  name: string;
  kind: CampaignStoreItemKind;
  category: StoreCatalogCategory;
  subcategory: string;
  details: string;
  defaultCost: string;
  source: StoreCatalogSource;
  sourceLabel: string;
  license: string;
  priceBasis: string;
}

export interface CampaignStoreCustomItem {
  id: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  details: string;
}

export interface CampaignStoreManagementPayload {
  stores: CampaignStore[];
  catalog: CampaignStoreCatalogItem[];
  campaignItems: CampaignStoreCustomItem[];
}

export interface CampaignStoreDraft {
  name?: unknown;
  description?: unknown;
  proprietorName?: unknown;
  proprietorDescription?: unknown;
  proprietorNpcId?: unknown;
}

export interface CampaignStoreItemDraft {
  sourceType?: unknown;
  sourceItemId?: unknown;
  cost?: unknown;
  quantity?: unknown;
  note?: unknown;
}

export interface CampaignStoreItemUpdate {
  cost?: unknown;
  quantity?: unknown;
  note?: unknown;
}

interface StoreRow {
  id: string;
  name: string;
  description: string;
  proprietorName: string;
  proprietorDescription: string;
  proprietorNpcId: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

interface StoreItemRow {
  id: string;
  storeId: string;
  sourceType: CampaignStoreSourceType;
  sourceItemId: string | null;
  name: string;
  kind: CampaignStoreItemKind;
  description: string;
  details: string;
  propertiesJson: string;
  cost: string;
  quantity: number | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignItemSourceRow {
  id: string;
  name: string;
  kind: InventoryItemKind;
  description: string;
  propertiesJson: string;
}

interface LinkedCharacterRow {
  id: string;
  ownerUserId: string;
}

function plainText(
  value: unknown,
  label: string,
  maximum: number,
  required = true,
  allowLineBreaks = false,
): string {
  if ((value === undefined || value === null || value === "") && !required) return "";
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const result = value.trim();
  const controls = allowLineBreaks
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  if ((!result && required) || result.length > maximum || controls.test(result)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return result;
}

function identifier(value: unknown, label: string): string {
  const result = plainText(value, label, 100);
  if (!/^[A-Za-z0-9_-]+$/u.test(result)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return result;
}

function storeSourceItemId(value: unknown, sourceType: CampaignStoreSourceType): string {
  // Built-in catalog keys intentionally contain punctuation (for example,
  // weapon:Hammer, Great and the imported store-only source prefixes).
  // The authoritative catalog lookup below validates them; campaign item IDs stay strict.
  return sourceType === "srd"
    ? plainText(value, "Source item", 240)
    : identifier(value, "Source item");
}

function quantity(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) {
    throw new CampaignServiceError("Stock quantity is invalid.", 422);
  }
  return value as number;
}

function storedProperties(value: string): CampaignItemProperties {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as CampaignItemProperties
      : {};
  } catch {
    return {};
  }
}

function propertyDetails(kind: InventoryItemKind, properties: CampaignItemProperties): string {
  if (kind === "weapon" && properties.weapon) {
    const weapon = properties.weapon;
    return `${weapon.damage} damage · Shock ${weapon.shock} · ${weapon.skill}/${weapon.attribute} · Range ${weapon.range} · Enc ${weapon.encumbrance}${weapon.traits ? ` · ${weapon.traits}` : ""}`;
  }
  if (kind === "armor" && properties.armor) {
    const armor = properties.armor;
    return `AC ${armor.armorClass} · Enc ${armor.encumbrance}${armor.shield === "none" ? "" : ` · ${armor.shield} shield`}${armor.properties ? ` · ${armor.properties}` : ""}`;
  }
  if (kind === "magical" && properties.magical) {
    const magical = properties.magical;
    return [
      magical.bonuses,
      magical.abilities,
      magical.charges === null ? "" : `${magical.charges} charges`,
      magical.uses,
      magical.rulesText,
    ].filter(Boolean).join(" · ");
  }
  return "";
}

function toStoreItem(row: StoreItemRow): CampaignStoreItem {
  return {
    id: row.id,
    storeId: row.storeId,
    sourceType: row.sourceType,
    sourceItemId: row.sourceItemId,
    name: row.name,
    kind: row.kind,
    description: row.description,
    details: row.details,
    properties: storedProperties(row.propertiesJson),
    cost: row.cost,
    quantity: row.quantity === null ? null : Math.max(0, Number(row.quantity) || 0),
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStore(row: StoreRow, campaignPublicId: string, items: CampaignStoreItem[]): CampaignStore {
  return {
    id: row.id,
    campaignId: campaignPublicId,
    name: row.name,
    description: row.description,
    proprietorName: row.proprietorName,
    proprietorDescription: row.proprietorDescription,
    proprietorNpcId: row.proprietorNpcId,
    isActive: row.isActive === 1,
    items,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function managerCampaign(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  mutation = false,
) {
  const { campaign, membership } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (!canManageCampaignContent(actor, campaign, membership)) {
    throw new CampaignServiceError("Only a campaign GM can manage stores.", 403);
  }
  if (mutation) requireActiveCampaign(campaign);
  return campaign;
}

async function viewerCampaign(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  rawCharacterId: unknown,
) {
  const characterPublicId = identifier(rawCharacterId, "Character");
  const { campaign, membership } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (!canViewCampaign(actor, campaign, membership)) {
    throw new CampaignServiceError("Campaign not found.", 404);
  }
  const character = await db.prepare(
    `SELECT ch.id, ch.owner_user_id AS ownerUserId
     FROM campaign_characters cc
     INNER JOIN characters ch ON ch.id = cc.character_id
     WHERE cc.campaign_id = ? AND ch.public_id = ?`,
  ).bind(campaign.id, characterPublicId).first<LinkedCharacterRow>();
  if (!character) throw new CampaignServiceError("Character not found.", 404);
  if (
    actor.role !== "admin"
    && character.ownerUserId !== actor.userId
    && !canManageCampaignContent(actor, campaign, membership)
  ) {
    throw new CampaignServiceError("Character not found.", 404);
  }
  return campaign;
}

async function itemMap(
  db: D1Database,
  campaignId: string,
): Promise<Map<string, CampaignStoreItem[]>> {
  const result = await db.prepare(
    `SELECT id, store_id AS storeId, source_type AS sourceType,
            source_item_id AS sourceItemId, name, kind, description, details,
            properties_json AS propertiesJson, cost, quantity, shop_note AS note,
            created_at AS createdAt, updated_at AS updatedAt
     FROM campaign_store_items
     WHERE store_id IN (SELECT id FROM campaign_stores WHERE campaign_id = ?)
     ORDER BY lower(name), created_at`,
  ).bind(campaignId).all<StoreItemRow>();
  const resultMap = new Map<string, CampaignStoreItem[]>();
  for (const row of result.results) {
    const item = toStoreItem(row);
    resultMap.set(item.storeId, [...(resultMap.get(item.storeId) ?? []), item]);
  }
  return resultMap;
}

async function storesForCampaign(
  db: D1Database,
  campaignId: string,
  campaignPublicId: string,
): Promise<CampaignStore[]> {
  const [stores, items] = await Promise.all([
    db.prepare(
      `SELECT id, name, description, proprietor_name AS proprietorName, proprietor_description AS proprietorDescription, proprietor_npc_id AS proprietorNpcId, is_active AS isActive,
              created_at AS createdAt, updated_at AS updatedAt
       FROM campaign_stores
       WHERE campaign_id = ?
       ORDER BY is_active DESC, lower(name), created_at`,
    ).bind(campaignId).all<StoreRow>(),
    itemMap(db, campaignId),
  ]);
  return stores.results.map(store => toStore(store, campaignPublicId, items.get(store.id) ?? []));
}

async function storeForManagement(
  db: D1Database,
  campaignId: string,
  storeId: unknown,
): Promise<StoreRow> {
  const id = identifier(storeId, "Store");
  const store = await db.prepare(
    `SELECT id, name, description, proprietor_name AS proprietorName, proprietor_description AS proprietorDescription, proprietor_npc_id AS proprietorNpcId, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM campaign_stores WHERE id = ? AND campaign_id = ?`,
  ).bind(id, campaignId).first<StoreRow>();
  if (!store) throw new CampaignServiceError("Store not found.", 404);
  return store;
}

function catalog(): CampaignStoreCatalogItem[] {
  return storeCatalog.map(item => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    category: item.category,
    subcategory: item.subcategory,
    details: item.details,
    defaultCost: item.defaultCost,
    source: item.source,
    sourceLabel: item.sourceLabel,
    license: item.license,
    priceBasis: item.priceBasis,
  }));
}

async function campaignItems(
  db: D1Database,
  campaignId: string,
): Promise<CampaignStoreCustomItem[]> {
  const result = await db.prepare(
    `SELECT id, name, kind, description, properties_json AS propertiesJson
     FROM campaign_items WHERE campaign_id = ?
     ORDER BY lower(name), updated_at DESC`,
  ).bind(campaignId).all<CampaignItemSourceRow>();
  return result.results.map(item => {
    const properties = storedProperties(item.propertiesJson);
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      description: item.description,
      details: propertyDetails(item.kind, properties),
    };
  });
}

export async function listCampaignStoresForManagement(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
): Promise<CampaignStoreManagementPayload> {
  const campaign = await managerCampaign(db, actor, campaignPublicId);
  const [stores, customItems] = await Promise.all([
    storesForCampaign(db, campaign.id, campaign.publicId),
    campaignItems(db, campaign.id),
  ]);
  return { stores, catalog: catalog(), campaignItems: customItems };
}

export async function createCampaignStore(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  draft: CampaignStoreDraft,
  now = new Date().toISOString(),
): Promise<CampaignStore> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const name = plainText(draft.name, "Store name", 80);
  const description = plainText(draft.description, "Store description", 2000, false, true);
  const proprietorName = plainText(draft.proprietorName, "Proprietor name", 120, false);
  const proprietorDescription = plainText(draft.proprietorDescription, "Proprietor description", 2000, false, true);
  const proprietorNpcId = draft.proprietorNpcId ? identifier(draft.proprietorNpcId,"NPC") : null;
  const id = `cstore_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.prepare(
    `INSERT INTO campaign_stores
      (id, campaign_id, name, description, proprietor_name, proprietor_description, proprietor_npc_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(id, campaign.id, name, description, proprietorName, proprietorDescription, proprietorNpcId, now, now).run();
  return {
    id,
    campaignId: campaign.publicId,
    name,
    description,
    proprietorName, proprietorDescription, proprietorNpcId,
    isActive: false,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateCampaignStore(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
  draft: CampaignStoreDraft,
  now = new Date().toISOString(),
): Promise<CampaignStore> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const existing = await storeForManagement(db, campaign.id, storeId);
  const name = plainText(draft.name, "Store name", 80);
  const description = plainText(draft.description, "Store description", 2000, false, true);
  const proprietorName = plainText(draft.proprietorName ?? existing.proprietorName, "Proprietor name", 120, false);
  const proprietorDescription = plainText(draft.proprietorDescription ?? existing.proprietorDescription, "Proprietor description", 2000, false, true);
  const proprietorNpcId = draft.proprietorNpcId === undefined ? existing.proprietorNpcId : draft.proprietorNpcId ? identifier(draft.proprietorNpcId,"NPC") : null;
  await db.prepare(
    `UPDATE campaign_stores SET name = ?, description = ?, proprietor_name = ?, proprietor_description = ?, proprietor_npc_id = ?, updated_at = ?
     WHERE id = ? AND campaign_id = ?`,
  ).bind(name, description, proprietorName, proprietorDescription, proprietorNpcId, now, existing.id, campaign.id).run();
  const items = (await itemMap(db, campaign.id)).get(existing.id) ?? [];
  return {
    id: existing.id,
    campaignId: campaign.publicId,
    name,
    description,
    proprietorName, proprietorDescription, proprietorNpcId,
    isActive: existing.isActive === 1,
    items,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export async function setCampaignStoreActive(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
  active: unknown,
  now = new Date().toISOString(),
): Promise<CampaignStore> {
  if (typeof active !== "boolean") throw new CampaignServiceError("Store visibility is invalid.", 422);
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const existing = await storeForManagement(db, campaign.id, storeId);
  if (active) {
    await db.batch([
      db.prepare(
        `UPDATE campaign_stores SET is_active = 0, updated_at = ?
         WHERE campaign_id = ? AND is_active = 1`,
      ).bind(now, campaign.id),
      db.prepare(
        `UPDATE campaign_stores SET is_active = 1, updated_at = ?
         WHERE id = ? AND campaign_id = ?`,
      ).bind(now, existing.id, campaign.id),
    ]);
  } else {
    await db.prepare(
      `UPDATE campaign_stores SET is_active = 0, updated_at = ?
       WHERE id = ? AND campaign_id = ?`,
    ).bind(now, existing.id, campaign.id).run();
  }
  const items = (await itemMap(db, campaign.id)).get(existing.id) ?? [];
  return {
    id: existing.id,
    campaignId: campaign.publicId,
    name: existing.name,
    description: existing.description,
    isActive: active,
    items,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export async function deleteCampaignStore(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
): Promise<void> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const store = await storeForManagement(db, campaign.id, storeId);
  await db.prepare(
    "DELETE FROM campaign_stores WHERE id = ? AND campaign_id = ?",
  ).bind(store.id, campaign.id).run();
}

export async function createCampaignStoreItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
  draft: CampaignStoreItemDraft,
  now = new Date().toISOString(),
): Promise<CampaignStoreItem> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const store = await storeForManagement(db, campaign.id, storeId);
  const sourceType = draft.sourceType === "srd" || draft.sourceType === "campaign"
    ? draft.sourceType
    : (() => { throw new CampaignServiceError("Item source is invalid.", 422); })();
  const sourceItemId = storeSourceItemId(draft.sourceItemId, sourceType);
  const stockQuantity = quantity(draft.quantity);
  const note = plainText(draft.note, "Shop note", 1000, false, true);

  let source: {
    id: string;
    name: string;
    kind: CampaignStoreItemKind;
    description: string;
    details: string;
    properties: CampaignItemProperties;
    defaultCost: string;
  };
  if (sourceType === "srd") {
    const item = storeCatalogById.get(sourceItemId);
    if (!item) throw new CampaignServiceError("SRD item not found.", 422);
    source = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      description: item.details,
      details: item.details,
      properties: {},
      defaultCost: item.defaultCost,
    };
  } else {
    const item = await db.prepare(
      `SELECT id, name, kind, description, properties_json AS propertiesJson
       FROM campaign_items WHERE campaign_id = ? AND id = ?`,
    ).bind(campaign.id, sourceItemId).first<CampaignItemSourceRow>();
    if (!item) throw new CampaignServiceError("Campaign item not found.", 422);
    const properties = storedProperties(item.propertiesJson);
    source = {
      id: item.id,
      name: item.name,
      kind: item.kind,
      description: item.description,
      details: propertyDetails(item.kind, properties),
      properties,
      defaultCost: "",
    };
  }

  const cost = plainText(draft.cost ?? source.defaultCost, "Item cost", 80);
  const id = `cstoreitem_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.prepare(
    `INSERT INTO campaign_store_items
      (id, store_id, source_type, source_item_id, name, kind, description, details,
       properties_json, cost, quantity, shop_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    store.id,
    sourceType,
    source.id,
    source.name,
    source.kind,
    source.description,
    source.details,
    JSON.stringify(source.properties),
    cost,
    stockQuantity,
    note,
    now,
    now,
  ).run();
  return {
    id,
    storeId: store.id,
    sourceType,
    sourceItemId: source.id,
    name: source.name,
    kind: source.kind,
    description: source.description,
    details: source.details,
    properties: source.properties,
    cost,
    quantity: stockQuantity,
    note,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateCampaignStoreItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
  itemId: unknown,
  draft: CampaignStoreItemUpdate,
  now = new Date().toISOString(),
): Promise<CampaignStoreItem> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const store = await storeForManagement(db, campaign.id, storeId);
  const id = identifier(itemId, "Store item");
  const existing = await db.prepare(
    `SELECT id, store_id AS storeId, source_type AS sourceType,
            source_item_id AS sourceItemId, name, kind, description, details,
            properties_json AS propertiesJson, cost, quantity, shop_note AS note,
            created_at AS createdAt, updated_at AS updatedAt
     FROM campaign_store_items WHERE id = ? AND store_id = ?`,
  ).bind(id, store.id).first<StoreItemRow>();
  if (!existing) throw new CampaignServiceError("Store item not found.", 404);
  const cost = plainText(draft.cost ?? existing.cost, "Item cost", 80);
  const stockQuantity = quantity(draft.quantity === undefined ? existing.quantity : draft.quantity);
  const note = plainText(draft.note ?? existing.note, "Shop note", 1000, false, true);
  await db.prepare(
    `UPDATE campaign_store_items
     SET cost = ?, quantity = ?, shop_note = ?, updated_at = ?
     WHERE id = ? AND store_id = ?`,
  ).bind(cost, stockQuantity, note, now, id, store.id).run();
  return {
    ...toStoreItem(existing),
    cost,
    quantity: stockQuantity,
    note,
    updatedAt: now,
  };
}

export async function deleteCampaignStoreItem(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  storeId: unknown,
  itemId: unknown,
): Promise<void> {
  const campaign = await managerCampaign(db, actor, campaignPublicId, true);
  const store = await storeForManagement(db, campaign.id, storeId);
  const id = identifier(itemId, "Store item");
  const result = await db.prepare(
    "DELETE FROM campaign_store_items WHERE id = ? AND store_id = ?",
  ).bind(id, store.id).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Store item not found.", 404);
}

/**
 * This deliberately reads the store snapshot, not campaign_items. A GM adding
 * a custom item to an active store is an explicit party-wide visibility grant,
 * so normal campaign-item selected-character restrictions do not apply here.
 */
export async function readActiveCampaignStore(
  db: D1Database,
  actor: CampaignActor,
  campaignPublicId: string,
  characterId: unknown,
): Promise<CampaignStore | null> {
  const campaign = await viewerCampaign(db, actor, campaignPublicId, characterId);
  const store = await db.prepare(
    `SELECT id, name, description, proprietor_name AS proprietorName, proprietor_description AS proprietorDescription, proprietor_npc_id AS proprietorNpcId, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM campaign_stores WHERE campaign_id = ? AND is_active = 1`,
  ).bind(campaign.id).first<StoreRow>();
  if (!store) return null;
  const items = (await itemMap(db, campaign.id)).get(store.id) ?? [];
  return toStore(store, campaign.publicId, items);
}
