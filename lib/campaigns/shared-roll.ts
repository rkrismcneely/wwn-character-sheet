import type { CampaignEncounterNpc, CampaignSharedRoll } from "./live-session.ts";
import { isSharedRollCategory, parseDamageExpression, SHARED_ROLL_CATEGORIES, type RollRequest, type RollResult } from "../../app/rolls.ts";
import { CampaignServiceError } from "./service.ts";

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${field} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError(`${field} is invalid.`, 422);
  }
  return text;
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CampaignServiceError(`${field} is invalid.`, 422);
  }
  return value as number;
}

/** Validate the semantic request; character identity is always supplied by trusted D1 state. */
export function normalizeSharedRollRequest(value: unknown, character: RollRequest["character"]): RollRequest {
  if (!value || typeof value !== "object") throw new CampaignServiceError("A roll request is required.", 422);
  const candidate = value as Partial<RollRequest>;
  if (typeof candidate.category !== "string" || !SHARED_ROLL_CATEGORIES.includes(candidate.category as never)) {
    throw new CampaignServiceError("Only contextual rolls can be shared.", 422);
  }
  if (!candidate.dice || typeof candidate.dice !== "object") throw new CampaignServiceError("Roll dice are required.", 422);
  const dice = {
    count: boundedInteger(candidate.dice.count, "Dice count", 1, 20),
    sides: boundedInteger(candidate.dice.sides, "Die sides", 2, 100),
  };
  if (!Array.isArray(candidate.modifiers) || candidate.modifiers.length > 10) {
    if (candidate.modifiers !== undefined) throw new CampaignServiceError("Roll modifiers are invalid.", 422);
  }
  const modifiers = (candidate.modifiers || []).map(modifier => ({
    label: boundedText(modifier?.label, "Modifier label", 80),
    value: boundedInteger(modifier?.value, "Modifier value", -1000, 1000),
  }));
  const target = candidate.target === undefined
    ? undefined
    : boundedInteger(candidate.target, "Roll target", -1000, 1000);
  if (candidate.targetKind !== undefined && (candidate.targetKind !== "saving-throw" || candidate.category !== "save")) {
    throw new CampaignServiceError("Roll target type is invalid.", 422);
  }
  return {
    category: candidate.category as RollRequest["category"],
    character,
    label: boundedText(candidate.label, "Roll label", 120),
    dice,
    modifiers,
    ...(target === undefined ? {} : { target }),
    ...(candidate.targetKind === undefined ? {} : { targetKind: candidate.targetKind }),
  };
}

export function isCampaignSharedRoll(result: RollResult): boolean {
  return isSharedRollCategory(result.category);
}

export function toCampaignSharedRoll(result: RollResult): CampaignSharedRoll {
  if (!isSharedRollCategory(result.category)) throw new CampaignServiceError("Generic rolls remain private.", 422);
  return result as CampaignSharedRoll;
}

export type NpcRollAction =
  | { kind: "attack"; attackIndex: number }
  | { kind: "damage"; attackIndex: number }
  | { kind: "save"; save: "physical" | "evasion" | "mental" };

function npcRollIdentity(npc: CampaignEncounterNpc): RollRequest["character"] {
  // Encounter IDs are internal implementation details and never belong in shared payloads.
  return { id: "npc", name: npc.name };
}

/** Build an NPC request only from the immutable encounter snapshot. */
export function npcRollRequest(npc: CampaignEncounterNpc, action: NpcRollAction): RollRequest | null {
  const stats = npc.combatStats;
  if (!stats) return null;
  const character = npcRollIdentity(npc);
  if (action.kind === "save") {
    const name = action.save[0].toUpperCase() + action.save.slice(1);
    return {
      category: "save",
      character,
      label: `${npc.name} — ${name} Saving Throw`,
      dice: { count: 1, sides: 20 },
      target: stats.saves[action.save],
      targetKind: "saving-throw",
    };
  }

  const attack = stats.attacks[action.attackIndex];
  if (!attack) return null;
  if (action.kind === "attack") {
    return {
      category: "attack",
      character,
      label: `${npc.name} — ${attack.name} Attack`,
      dice: { count: 1, sides: 20 },
      modifiers: [{ label: "Attack bonus", value: attack.attackBonus }],
    };
  }
  try {
    const damage = parseDamageExpression(attack.damage);
    return {
      category: "damage",
      character,
      label: `${npc.name} — ${attack.name} Damage`,
      dice: damage.dice,
      modifiers: damage.modifier ? [{ label: "Damage modifier", value: damage.modifier }] : [],
    };
  } catch {
    return null;
  }
}

/** NPC save targets are GM-only encounter data; share outcome, not the target number. */
export function toPublicNpcCampaignSharedRoll(result: RollResult): CampaignSharedRoll {
  const roll = toCampaignSharedRoll(result);
  const publicRoll = { ...roll };
  delete publicRoll.target;
  return publicRoll;
}
