import type { CampaignEncounter, CampaignEncounterNpc, CampaignNpcCombatStats } from "./live-session.ts";
import {
  calculateWwnEnemyScore,
  calculateWwnThreatEstimate,
  type WwnEnemyScore,
  type WwnThreatEstimate,
} from "./wwn-threat.ts";

export type EncounterThreatMissingField = "HD" | "attacks/Main Action";

export interface EncounterThreatEligibleNpc {
  readonly id: string;
  readonly name: string;
  readonly hitDice: number;
  readonly attacksPerMainAction: number;
}

export interface EncounterThreatExcludedNpc {
  readonly id: string;
  readonly name: string;
  readonly missing: readonly EncounterThreatMissingField[];
}

export interface EncounterThreatSummary {
  readonly npcCount: number;
  readonly eligible: readonly EncounterThreatEligibleNpc[];
  readonly excluded: readonly EncounterThreatExcludedNpc[];
  readonly enemy: WwnEnemyScore | null;
  readonly estimate: WwnThreatEstimate | null;
}

function nonNegativeHitDice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Encounter-local threatStats are an explicit override. Without one, a
 * Bestiary snapshot's copied sourceStats are the authoritative encounter data.
 * No template or catalog lookup is performed here.
 */
type StoredThreatStats = { hitDice?: unknown; attacksPerMainAction?: unknown };

function currentThreatStats(stats: CampaignNpcCombatStats | undefined): StoredThreatStats | null {
  if (!stats) return null;
  if (stats.threatStats) return stats.threatStats;
  return stats.sourceStats ?? null;
}

export function encounterNpcThreatInput(npc: CampaignEncounterNpc): EncounterThreatEligibleNpc | EncounterThreatExcludedNpc {
  const stats = currentThreatStats(npc.combatStats);
  const missing: EncounterThreatMissingField[] = [];
  if (!nonNegativeHitDice(stats?.hitDice)) missing.push("HD");
  if (!positiveWholeNumber(stats?.attacksPerMainAction)) missing.push("attacks/Main Action");
  return missing.length
    ? Object.freeze({ id: npc.id, name: npc.name, missing: Object.freeze(missing) })
    : Object.freeze({ id: npc.id, name: npc.name, hitDice: stats!.hitDice as number, attacksPerMainAction: stats!.attacksPerMainAction as number });
}

function isEligible(input: EncounterThreatEligibleNpc | EncounterThreatExcludedNpc): input is EncounterThreatEligibleNpc {
  return "hitDice" in input;
}

function isExcluded(input: EncounterThreatEligibleNpc | EncounterThreatExcludedNpc): input is EncounterThreatExcludedNpc {
  return !isEligible(input);
}

/**
 * Derive a current-encounter view from the already-stored combat snapshots.
 * Every NPC instance is expanded independently before the established engine
 * totals HD and attacks, so mixed groups use total HD × total attacks.
 */
export function summarizeEncounterThreat(
  encounter: CampaignEncounter | null,
  partyLevels: readonly unknown[],
): EncounterThreatSummary {
  const npcs = encounter?.combatants.filter((combatant): combatant is CampaignEncounterNpc => combatant.kind === "npc" && !combatant.friendly) ?? [];
  const inputs = npcs.map(encounterNpcThreatInput);
  const eligible = Object.freeze(inputs.filter(isEligible));
  const excluded = Object.freeze(inputs.filter(isExcluded));
  const enemies = eligible.map(({ hitDice, attacksPerMainAction }) => ({ hitDice, attacksPerMainAction }));
  const enemy = calculateWwnEnemyScore(enemies);
  return Object.freeze({
    npcCount: npcs.length,
    eligible,
    excluded,
    enemy,
    estimate: enemy ? calculateWwnThreatEstimate(partyLevels, enemies) : null,
  });
}
