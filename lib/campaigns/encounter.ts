import type { CampaignEncounter, CampaignNpcCombatStats } from "./live-session.ts";

function signed(value: number): string { return value >= 0 ? `+${value}` : `${value}`; }

/**
 * Builds the compact encounter-row presentation from the combatant snapshot.
 * A missing snapshot is intentional for legacy and manually-created NPCs.
 */
export function collapsedNpcCombatSummary(stats: CampaignNpcCombatStats | undefined) {
  if (!stats) return null;
  const primaryAttack = stats.attacks[0];
  return {
    saves: `P ${stats.saves.physical} · E ${stats.saves.evasion} · M ${stats.saves.mental}`,
    primaryAttack: primaryAttack ? `${primaryAttack.name} ${signed(primaryAttack.attackBonus)} · ${primaryAttack.damage}` : null,
    additionalAttacks: Math.max(0, stats.attacks.length - 1),
    shock: primaryAttack?.shock ?? (stats.sourceStats?.shock && stats.sourceStats.shock !== "None" ? stats.sourceStats.shock : null),
    move: stats.sourceStats?.move ?? null,
    morale: stats.sourceStats?.morale ?? null,
  };
}

export function encounterTurnTransition(
  encounter: CampaignEncounter,
  direction: "next" | "previous",
): { currentCombatantId: string | null; round: number } {
  const order = encounter.combatants.map(combatant => combatant.id);
  if (!order.length) return { currentCombatantId: null, round: encounter.round };
  let index = encounter.currentCombatantId ? order.indexOf(encounter.currentCombatantId) : -1;
  let round = encounter.round;
  if (direction === "next") {
    index = index < 0 ? 0 : index + 1;
    if (index >= order.length) { index = 0; round += 1; }
  } else {
    index = index < 0 ? order.length - 1 : index - 1;
    if (index < 0) { index = order.length - 1; round = Math.max(1, round - 1); }
  }
  return { currentCombatantId: order[index], round };
}

export function encounterCurrentAfterRemoval(encounter: CampaignEncounter, removedId: string): string | null {
  const order = encounter.combatants.map(combatant => combatant.id);
  if (encounter.currentCombatantId !== removedId) return encounter.currentCombatantId;
  const removedIndex = order.indexOf(removedId);
  const remaining = order.filter(id => id !== removedId);
  return remaining.length ? remaining[Math.max(removedIndex, 0) % remaining.length] : null;
}
