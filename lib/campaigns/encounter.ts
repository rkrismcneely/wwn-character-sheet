import type { CampaignEncounter } from "./live-session.ts";

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
