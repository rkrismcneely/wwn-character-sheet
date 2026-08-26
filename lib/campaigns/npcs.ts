import { loadCampaignAccess, CampaignServiceError, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";
import { builtInBestiaryCreatureDraft } from "./bestiary.ts";

export interface CampaignNpcAttack {
  name: string;
  attackBonus: number;
  damage: string;
  description: string;
}

export interface CampaignNpcTemplate {
  id: string;
  name: string;
  hpMax: number;
  armorClass: number;
  physicalSave: number;
  evasionSave: number;
  mentalSave: number;
  attacks: CampaignNpcAttack[];
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
  notes?: unknown;
}

interface NpcRow {
  id: string; name: string; hpMax: number; armorClass: number;
  physicalSave: number; evasionSave: number; mentalSave: number;
  attacksJson: string; notes: string; createdAt: string; updatedAt: string;
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

function attacks(value: unknown): CampaignNpcAttack[] {
  if (!Array.isArray(value) || value.length > 8) throw new CampaignServiceError("Attacks are invalid.", 422);
  return value.map((attack, index) => {
    if (!attack || typeof attack !== "object" || Array.isArray(attack)) throw new CampaignServiceError("Attacks are invalid.", 422);
    const candidate = attack as Record<string, unknown>;
    return {
      name: text(candidate.name, `Attack ${index + 1} name`, 80),
      attackBonus: integer(candidate.attackBonus, `Attack ${index + 1} bonus`, -1000, 1000),
      damage: text(candidate.damage, `Attack ${index + 1} damage`, 80),
      description: text(candidate.description, `Attack ${index + 1} description`, 240, false),
    };
  });
}

function toTemplate(row: NpcRow): CampaignNpcTemplate {
  let parsedAttacks: CampaignNpcAttack[] = [];
  try { parsedAttacks = attacks(JSON.parse(row.attacksJson) as unknown); } catch { /* invalid legacy payloads are represented safely */ }
  return {
    id: row.id,
    name: row.name,
    hpMax: row.hpMax,
    armorClass: row.armorClass,
    physicalSave: row.physicalSave,
    evasionSave: row.evasionSave,
    mentalSave: row.mentalSave,
    attacks: parsedAttacks,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function input(draft: CampaignNpcDraft): Omit<CampaignNpcTemplate, "id" | "createdAt" | "updatedAt"> {
  return {
    name: text(draft.name, "NPC name", 80),
    hpMax: integer(draft.hpMax, "Maximum HP", 1, 100000),
    armorClass: integer(draft.armorClass, "Armor Class", 0, 1000),
    physicalSave: integer(draft.physicalSave, "Physical Save", 0, 1000),
    evasionSave: integer(draft.evasionSave, "Evasion Save", 0, 1000),
    mentalSave: integer(draft.mentalSave, "Mental Save", 0, 1000),
    attacks: attacks(draft.attacks),
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
    attacks_json AS attacksJson, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_npc_templates WHERE campaign_id = ? AND id = ?`)
    .bind(campaignId, npcId).first<NpcRow>();
  if (!row) throw new CampaignServiceError("NPC template not found.", 404);
  return toTemplate(row);
}

export async function listCampaignNpcTemplates(db: D1Database, actor: CampaignActor, campaignPublicId: string): Promise<CampaignNpcTemplate[]> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId);
  const result = await db.prepare(`SELECT id, name, hp_max AS hpMax, armor_class AS armorClass,
    physical_save AS physicalSave, evasion_save AS evasionSave, mental_save AS mentalSave,
    attacks_json AS attacksJson, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_npc_templates WHERE campaign_id = ? ORDER BY name COLLATE NOCASE, updated_at DESC`)
    .bind(campaign.id).all<NpcRow>();
  return result.results.map(toTemplate);
}

export async function createCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, draft: CampaignNpcDraft, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const value = input(draft);
  const id = `cnpc_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.prepare(`INSERT INTO campaign_npc_templates
    (id, campaign_id, name, hp_max, armor_class, physical_save, evasion_save, mental_save, attacks_json, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, campaign.id, value.name, value.hpMax, value.armorClass, value.physicalSave, value.evasionSave, value.mentalSave, JSON.stringify(value.attacks), value.notes, now, now).run();
  return { id, ...value, createdAt: now, updatedAt: now };
}

export async function createCampaignNpcTemplateFromBestiary(db: D1Database, actor: CampaignActor, campaignPublicId: string, bestiaryId: string, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const draft = builtInBestiaryCreatureDraft(bestiaryId);
  if (!draft) throw new CampaignServiceError("Built-in creature not found.", 404);
  return createCampaignNpcTemplate(db, actor, campaignPublicId, draft, now);
}

export async function updateCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string, draft: CampaignNpcDraft, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const value = input(draft);
  const result = await db.prepare(`UPDATE campaign_npc_templates SET name = ?, hp_max = ?, armor_class = ?,
    physical_save = ?, evasion_save = ?, mental_save = ?, attacks_json = ?, notes = ?, updated_at = ?
    WHERE campaign_id = ? AND id = ?`)
    .bind(value.name, value.hpMax, value.armorClass, value.physicalSave, value.evasionSave, value.mentalSave, JSON.stringify(value.attacks), value.notes, now, campaign.id, npcId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("NPC template not found.", 404);
  return { id: npcId, ...value, createdAt: (await findNpc(db, campaign.id, npcId)).createdAt, updatedAt: now };
}

export async function duplicateCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string, now = new Date().toISOString()): Promise<CampaignNpcTemplate> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const source = await findNpc(db, campaign.id, npcId);
  return createCampaignNpcTemplate(db, actor, campaignPublicId, {
    ...source,
    name: `${source.name} Copy`.slice(0, 80),
  }, now);
}

export async function deleteCampaignNpcTemplate(db: D1Database, actor: CampaignActor, campaignPublicId: string, npcId: string): Promise<void> {
  const campaign = await ownerCampaign(db, actor, campaignPublicId, true);
  const result = await db.prepare("DELETE FROM campaign_npc_templates WHERE campaign_id = ? AND id = ?").bind(campaign.id, npcId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("NPC template not found.", 404);
}

/** Called only after the encounter route has already established owner authority. */
export async function campaignNpcEncounterSeed(db: D1Database, campaignId: string, npcId: string) {
  const npc = await findNpc(db, campaignId, npcId);
  return { name: npc.name, initiative: 0, hpCurrent: npc.hpMax, hpMax: npc.hpMax, armorClass: npc.armorClass, notes: npc.notes };
}
