import { loadCampaignAccess, CampaignServiceError, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";
import { builtInBestiaryCreatureDraft, getBuiltInBestiaryCreature } from "./bestiary.ts";
import type { CampaignNpcCombatStats } from "./live-session.ts";
import { normalizeNpcAttacks, normalizeNpcThreatStats, readStoredNpcAttacks } from "./npc-combat.ts";
import type { CampaignNpcAttack } from "./npc-combat.ts";

export type { CampaignNpcAttack, CampaignNpcThreatStats } from "./npc-combat.ts";

export interface CampaignNpcTemplate {
  id: string;
  name: string;
  hpMax: number;
  armorClass: number;
  physicalSave: number;
  evasionSave: number;
  mentalSave: number;
  attacks: CampaignNpcAttack[];
  hitDice: number | null;
  attacksPerMainAction: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignNpcDraft {
  name?: unknown;
  hpMax?: unknown;
  armorClass?: unknown;
  physicalSave?: unknown;
  evasionSave?: unknown;
  mentalSave?: unknown;
  attacks?: unknown;
  hitDice?: unknown;
  attacksPerMainAction?: unknown;
  notes?: unknown;
}

interface NpcRow {
  id: string; name: string; hpMax: number; armorClass: number;
  physicalSave: number; evasionSave: number; mentalSave: number;
  attacksJson: string; hitDice: number | null; attacksPerMainAction: number | null;
  notes: string; createdAt: string; updatedAt: string;
}

function text(value: unknown, label: string, maximum: number, required = true): string {
  if ((value === undefined || value === null || value === "") && !required) return "";
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const result = value.trim();
  if ((!result && required) || result.length > maximum || /[\u0000-\u001f\u007f]/u.test(result)) throw new CampaignServiceError(`${label} is invalid.`, 422);
  return result;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new CampaignServiceError(`${label} is invalid.`, 422);
  return value as number;
}

function toTemplate(row: NpcRow): CampaignNpcTemplate {
  let parsedAttacks: CampaignNpcAttack[] = [];
  try { parsedAttacks = readStoredNpcAttacks(JSON.parse(row.attacksJson) as unknown); } catch { /* invalid legacy payloads are represented safely */ }
  return {
    id: row.id,
    name: row.name,
    hpMax: row.hpMax,
    armorClass: row.armorClass,
    physicalSave: row.physicalSave,
    evasionSave: row.evasionSave,
    mentalSave: row.mentalSave,
    attacks: parsedAttacks,
    hitDice: row.hitDice,
    attacksPerMainAction: row.attacksPerMainAction,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function input(draft: CampaignNpcDraft, legacyAttacks: readonly CampaignNpcAttack[] = []): Omit<CampaignNpcTemplate, "id" | "createdAt" | "updatedAt"> {
  const threatStats = normalizeNpcThreatStats({ hitDice: draft.hitDice, attacksPerMainAction: draft.attacksPerMainAction });
  return {
    name: text(draft.name, "NPC name", 80),
    hpMax: integer(draft.hpMax, "Maximum HP", 1, 100000),
    armorClass: integer(draft.armorClass, "Armor Class", 0, 1000),
    physicalSave: integer(draft.physicalSave, "Physical Save", 0, 1000),
    evasionSave: integer(draft.evasionSave, "Evasion Save", 0, 1000),
    mentalSave: integer(draft.mentalSave, "Mental Save", 0, 1000),
    attacks: normalizeNpcAttacks(draft.attacks, legacyAttacks),
    hitDice: threatStats?.hitDice ?? null,
    attacksPerMainAction: threatStats?.attacksPerMainAction ?? null,
    notes: text(draft.notes, "Notes", 2000, false),
  };
}

async function ownerCampaign(db: D1Database, actor: CampaignActor, campaignPublicId: string, mutation = false) {
  const { campaign } = await loadCampaignAccess(db, actor, campaignPublicId);
  if (campaign.ownerUserId !== actor.userId) throw new CampaignServiceError("Only the campaign owner can manage NPC templates.", 403);
  if (mutation) requireActiveCampaign(campaign);
  return campaign;
}

async function findNpc(db: D1Database, campaignId: string, npcId: string): Promise<CampaignNpcTemplate> {
  const row = await db.prepare(`SELECT id, name, hp_max AS hpMax, armor_class AS armorClass,
    physical_save AS physicalSave, evasion_save AS evasionSave, mental_save AS mentalSave,
    attacks_json AS attacksJson, hit_dice AS hitDice, attacks_per_main_action AS attacksPerMainAction,
    notes, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_npc_templates WHERE campaign_id = ? AND id = ?`)
    .bind(campaignId, npcId).first<NpcRow>();
  if (!row) throw new CampaignServiceError("NPC template not found.", 404);
  return toTemplate(row);
}

export async function listCampaignNpcTemplates(db: D1Database, actor: CampaignActor, campaignPublicId: string): Promise<CampaignNpcTemplate[]> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId);
  const result = await db.prepare(`SELECT id, name, hp_max AS hpMax, armor_class AS armorClass,
    physical_save AS physicalSave, evasion_save AS evasionSave, mental_save AS mentalSave,
    attacks_json AS attacksJson, hit_dice AS hitDice, attacks_per_main_action AS attacksPerMainAction,
    notes, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_npc_templates WHERE campaign_id = ? ORDER BY name COLLATE NOCASE, updated_at DESC`)
    .bind(campaign.id).all<NpcRow>();
  return result.results.map(toTemplate);
}

export async function createCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, draft: CampaignNpcDraft, now = new Date().toISOString(), legacyAttacks: readonly CampaignNpcAttack[] = []): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const value = input(draft, legacyAttacks);
  const id = `cnpc_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.prepare(`INSERT INTO campaign_npc_templates
    (id, campaign_id, name, hp_max, armor_class, physical_save, evasion_save, mental_save, attacks_json, hit_dice, attacks_per_main_action, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, campaign.id, value.name, value.hpMax, value.armorClass, value.physicalSave, value.evasionSave, value.mentalSave, JSON.stringify(value.attacks), value.hitDice, value.attacksPerMainAction, value.notes, now, now).run();
  return { id, ...value, createdAt: now, updatedAt: now };
}

export async function createCampaignNpcTemplateFromBestiary(db: D1Database, actor: CampaignActor, campaignPublicId: string, bestiaryId: string, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const creature = getBuiltInBestiaryCreature(bestiaryId);
  const draft = builtInBestiaryCreatureDraft(bestiaryId);
  if (!creature || !draft) throw new CampaignServiceError("Built-in creature not found.", 404);
  return createCampaignNpcTemplate(db, actor, campaignPublicId, {
    ...draft,
    hitDice: creature.sourceStats.hitDice,
    attacksPerMainAction: creature.sourceStats.attacksPerMainAction,
  }, now, draft.attacks as CampaignNpcAttack[]);
}

export async function updateCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string, draft: CampaignNpcDraft, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const existing = await findNpc(db, campaign.id, npcId);
  const value = input(draft, existing.attacks);
  const result = await db.prepare(`UPDATE campaign_npc_templates SET name = ?, hp_max = ?, armor_class = ?,
    physical_save = ?, evasion_save = ?, mental_save = ?, attacks_json = ?, hit_dice = ?, attacks_per_main_action = ?, notes = ?, updated_at = ?
    WHERE campaign_id = ? AND id = ?`)
    .bind(value.name, value.hpMax, value.armorClass, value.physicalSave, value.evasionSave, value.mentalSave, JSON.stringify(value.attacks), value.hitDice, value.attacksPerMainAction, value.notes, now, campaign.id, npcId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("NPC template not found.", 404);
  return { id: npcId, ...value, createdAt: (await findNpc(db, campaign.id, npcId)).createdAt, updatedAt: now };
}

export async function duplicateCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const source = await findNpc(db, campaign.id, npcId);
  return createCampaignNpcTemplate(db, actor, campaignPublicId, {
    ...source,
    name: `${source.name} Copy`.slice(0, 80),
  }, now, source.attacks);
}

export async function deleteCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string): Promise<void> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const result = await db.prepare("DELETE FROM campaign_npc_templates WHERE campaign_id = ? AND id = ?").bind(campaign.id, npcId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("NPC template not found.", 404);
}

/** Called only after the encounter route has already established owner authority. */
export async function campaignNpcEncounterSeed(db: D1Database, campaignId: string, npcId: string) {
  const npc = await findNpc(db, campaignId, npcId);
  const combatStats: CampaignNpcCombatStats = {
    saves: { physical: npc.physicalSave, evasion: npc.evasionSave, mental: npc.mentalSave },
    attacks: npc.attacks.map(attack => ({ ...attack })),
    ...(npc.hitDice !== null && npc.attacksPerMainAction !== null ? { threatStats: { hitDice: npc.hitDice, attacksPerMainAction: npc.attacksPerMainAction } } : {}),
    notes: npc.notes,
  };
  return { name: npc.name, initiative: 0, hpCurrent: npc.hpMax, hpMax: npc.hpMax, armorClass: npc.armorClass, notes: npc.notes, combatStats };
}
