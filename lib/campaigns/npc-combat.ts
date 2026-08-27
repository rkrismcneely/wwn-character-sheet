import { parseDamageExpression } from "../../app/rolls.ts";
import { CampaignServiceError } from "./service.ts";

export interface CampaignNpcAttack {
  name: string;
  attackBonus: number;
  damage: string;
  shock?: string;
  description: string;
}

export interface CampaignNpcThreatStats {
  hitDice: number;
  attacksPerMainAction: number;
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

function nullableInteger(value: unknown, label: string, minimum: number, maximum: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  return integer(value, label, minimum, maximum);
}

/**
 * Read existing JSON defensively. This intentionally does not try to interpret
 * historic prose damage values: legacy rows remain viewable and editable.
 */
export function readStoredNpcAttacks(value: unknown): CampaignNpcAttack[] {
  if (!Array.isArray(value) || value.length > 8) throw new CampaignServiceError("Attacks are invalid.", 422);
  return value.map((attack, index) => {
    if (!attack || typeof attack !== "object" || Array.isArray(attack)) throw new CampaignServiceError("Attacks are invalid.", 422);
    const candidate = attack as Record<string, unknown>;
    const shock = text(candidate.shock, `Attack ${index + 1} Shock`, 80, false);
    return {
      name: text(candidate.name, `Attack ${index + 1} name`, 80),
      attackBonus: integer(candidate.attackBonus, `Attack ${index + 1} bonus`, -1000, 1000),
      damage: text(candidate.damage, `Attack ${index + 1} damage`, 80),
      ...(shock ? { shock } : {}),
      description: text(candidate.description, `Attack ${index + 1} description`, 240, false),
    };
  });
}

function nonRollableDamageCounts(attacks: readonly CampaignNpcAttack[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const attack of attacks) {
    try { parseDamageExpression(attack.damage); } catch {
      result.set(attack.damage, (result.get(attack.damage) ?? 0) + 1);
    }
  }
  return result;
}

/**
 * New custom attacks must use the application's authoritative damage syntax.
 * A stored non-rollable expression can only be retained once per matching
 * legacy attack, preventing unbounded new prose while preserving old rows.
 */
export function normalizeNpcAttacks(value: unknown, legacyAttacks: readonly CampaignNpcAttack[] = []): CampaignNpcAttack[] {
  const parsed = readStoredNpcAttacks(value);
  const legacyDamage = nonRollableDamageCounts(legacyAttacks);
  for (const attack of parsed) {
    try { parseDamageExpression(attack.damage); } catch {
      const remaining = legacyDamage.get(attack.damage) ?? 0;
      if (!remaining) throw new CampaignServiceError(`${attack.name} damage must use a rollable dice expression.`, 422);
      legacyDamage.set(attack.damage, remaining - 1);
    }
  }
  return parsed;
}

/** Threat math is opt-in and requires both explicit inputs; never infer attacks from attack options. */
export function normalizeNpcThreatStats(value: unknown): CampaignNpcThreatStats | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (value === undefined || value === null) return null;
    throw new CampaignServiceError("Threat data is invalid.", 422);
  }
  const candidate = value as Record<string, unknown>;
  const hitDice = nullableInteger(candidate.hitDice, "Hit Dice", 1, 1000);
  const attacksPerMainAction = nullableInteger(candidate.attacksPerMainAction, "Attacks per Main Action", 1, 100);
  if (hitDice === null && attacksPerMainAction === null) return null;
  if (hitDice === null || attacksPerMainAction === null) throw new CampaignServiceError("Hit Dice and attacks per Main Action must be provided together.", 422);
  return { hitDice, attacksPerMainAction };
}

export function threatInput(stats: CampaignNpcThreatStats | null | undefined) {
  return stats ? { hitDice: stats.hitDice, attacksPerMainAction: stats.attacksPerMainAction } : null;
}
