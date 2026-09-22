/** Small, framework-free rules used by the sheet and regression tests. */

export function explicitFocusSkillChoices(focusName: string) {
  if (focusName === "Close Combatant") return ["Punch", "Shoot", "Stab"];
  if (focusName === "Shocking Assault") return ["Punch", "Stab"];
  return [];
}

export function focusIsRepeatable(focusName: string) {
  return ["Developed Attribute", "Specialist", "Spirit Familiar"].includes(focusName);
}

export type FocusLevelSelection = {
  name: string;
  level?: number;
};

/**
 * Spirit Familiar is unusual: the first level-2 purchase completes the Focus,
 * while later purchases of level 2 cost one additional Focus pick each.
 */
export function focusSelectionCost(picks: readonly FocusLevelSelection[]) {
  let spiritFamiliarLevelTwoSeen = false;
  return picks.reduce((total, pick) => {
    if (!pick.name) return total;
    const level = Math.max(1, Math.min(2, Math.trunc(Number(pick.level) || 1)));
    if (pick.name === "Spirit Familiar" && level >= 2) {
      const cost = spiritFamiliarLevelTwoSeen ? 1 : 2;
      spiritFamiliarLevelTwoSeen = true;
      return total + cost;
    }
    return total + level;
  }, 0);
}

/**
 * Spirit Familiar level 2 can be bought during creation when the character has
 * two starting Focus picks. Each later Focus opportunity can buy level 2 again
 * for one pick, up to the three total level-2 purchases needed for all six
 * benefits.
 */
export function spiritFamiliarLevelTwoSelectionLimit(characterLevel: number) {
  const level = Math.max(1, Math.min(10, Math.trunc(Number(characterLevel) || 1)));
  const laterFocusOpportunities = [2, 5, 7, 10].filter((opportunity) => opportunity <= level).length;
  return Math.min(3, 1 + laterFocusOpportunities);
}

export function spiritFamiliarBenefitLimit(picks: readonly FocusLevelSelection[]) {
  const levelTwoSelections = picks.filter(
    (pick) => pick.name === "Spirit Familiar" && Number(pick.level) >= 2,
  ).length;
  return Math.min(6, levelTwoSelections * 2);
}

export function spiritFamiliarMaximumHitPoints(
  characterLevel: number,
  tripleHitPoints: boolean,
) {
  const level = Math.max(1, Math.min(10, Math.trunc(Number(characterLevel) || 1)));
  return level * (tripleHitPoints ? 3 : 1);
}

/**
 * Familiar maximum HP is derived from the owner's level and the level-2 HP
 * benefit. When that maximum rises, keep the same damage taken instead of
 * making a healthy familiar look newly injured. A familiar already at 0 HP
 * stays at 0 until it is explicitly restored/resummoned.
 */
export function reconcileSpiritFamiliarHitPoints(
  currentHitPoints: number,
  previousMaximum: number,
  nextMaximum: number,
) {
  const next = Math.max(1, Math.trunc(Number(nextMaximum) || 1));
  const previous = Math.max(1, Math.trunc(Number(previousMaximum) || next));
  const current = Math.max(0, Math.min(previous, Math.trunc(Number(currentHitPoints) || 0)));
  if (current <= 0) return { current: 0, maximum: next };
  if (next > previous) {
    return {
      current: Math.min(next, current + (next - previous)),
      maximum: next,
    };
  }
  return { current: Math.min(current, next), maximum: next };
}

export function armorRestrictsMagic(armorRule: string) {
  return /cannot .*armor|do not function .*armor|require freedom from armor|same armor and shield restrictions/i.test(armorRule);
}

const artPrerequisites: Record<string, readonly string[]> = {
  "Deep Apprehension": ["Surface Apprehension"],
  "Elicitation of Truth": ["Surface Apprehension"],
  "Facile Speech": ["Far Speech"],
};

export function missingArtPrerequisite(
  artName: string,
  selectedArtNames: readonly string[],
) {
  const required = artPrerequisites[artName] || [];
  const selected = new Set(selectedArtNames.filter(Boolean));
  return required.find((name) => !selected.has(name)) || "";
}

export function artEffortCommitmentCount(value: unknown) {
  if (value === true) return 1;
  if (value === false || value === null || value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

export function artEffortTotal(values: readonly unknown[]) {
  return values.reduce<number>(
    (total, value) => total + artEffortCommitmentCount(value),
    0,
  );
}

export function effortMaximum({
  skillLevel,
  attributeModifiers,
  effortBase = 0,
  partialSpellPenalty = 0,
  usesEffort = true,
}: {
  skillLevel: number;
  attributeModifiers: readonly number[];
  effortBase?: number;
  partialSpellPenalty?: number;
  usesEffort?: boolean;
}) {
  if (!usesEffort) return 0;
  const bestAttribute = attributeModifiers.length
    ? Math.max(...attributeModifiers.map((value) => Number(value) || 0))
    : 0;
  return Math.max(
    1,
    (Number(effortBase) || 0)
      + (Number(skillLevel) || 0)
      + bestAttribute
      - Math.max(0, Number(partialSpellPenalty) || 0),
  );
}

/**
 * Maps repeatable Spirit Familiar Focus rows to distinct companion records.
 * A legacy familiar without a slot is adopted only by the first Focus row.
 */
export function reconcileFamiliarSlots<T extends { focusSlot?: number }>(
  active: readonly T[],
  archived: readonly T[],
  focusSlots: readonly number[],
  create: (focusSlot: number, familiarIndex: number) => T,
) {
  const available = [...active, ...archived];
  return focusSlots.map((focusSlot, familiarIndex) =>
    available.find(companion => companion.focusSlot === focusSlot)
    || (familiarIndex === 0 ? available.find(companion => companion.focusSlot === undefined) : undefined)
    || create(focusSlot, familiarIndex),
  );
}

export type FocusChoice = { name: string; choice?: string };

export function inferFocusAdvancementFlags<
  T extends { name: string; advancement?: boolean },
>(picks: readonly T[], startingFocusSelections: number): T[] {
  const starting = Math.max(
    0,
    Math.trunc(Number(startingFocusSelections) || 0),
  );
  let creationSelections = 0;
  return picks.map((pick) => {
    if (!pick.name) return { ...pick };
    if (pick.advancement === true) return { ...pick };
    if (pick.advancement === false) {
      creationSelections += 1;
      return { ...pick };
    }
    if (creationSelections < starting) {
      creationSelections += 1;
      return { ...pick, advancement: false };
    }
    return { ...pick, advancement: true };
  });
}

export function focusTargetAvailable(
  picks: readonly FocusChoice[],
  focusName: "Developed Attribute" | "Specialist",
  target: string,
  slotIndex: number,
) {
  return !picks.some((pick, index) => index !== slotIndex && pick.name === focusName && pick.choice === target);
}

export type SkillProfileInput = {
  purchased: number;
  sourceCount: number;
  polymathFloor?: number;
  /** Advancement Focus bonus-skill credit, kept separate from paid ranks. */
  credit?: number;
};

const skillRankCost = (rank: number) =>
  rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];

function rankAfterSkillCredit(rank: number, credit: number) {
  let result = Math.max(-1, Math.min(4, rank));
  let remaining = Math.max(0, Math.floor(credit));
  while (result < 4) {
    const next = result + 1;
    const cost = skillRankCost(next) - skillRankCost(result);
    if (remaining < cost) break;
    remaining -= cost;
    result = next;
  }
  return { rank: result, remaining };
}

export function deriveSkillProfile({ purchased, sourceCount, polymathFloor = -1, credit = 0 }: SkillProfileInput) {
  const requestedPurchased = Number(purchased);
  const normalizedPurchased = Number.isFinite(requestedPurchased)
    ? Math.max(-1, Math.min(4, requestedPurchased))
    : -1;
  const granted = Math.min(4, normalizedPurchased + Math.max(0, sourceCount));
  const creditResult = rankAfterSkillCredit(granted, credit);
  return {
    purchased: normalizedPurchased,
    sourceCount: Math.max(0, sourceCount),
    sourceFloor: sourceCount > 0 ? Math.min(4, sourceCount - 1) : -1,
    granted,
    polymathFloor,
    effective: Math.max(creditResult.rank, polymathFloor),
    ...(credit > 0 ? {
      credit: Math.max(0, Math.floor(credit)),
      creditRank: creditResult.rank,
      creditRemaining: creditResult.remaining,
    } : {}),
  };
}

/**
 * Converts the rank selected in the player-facing Skills control back to the
 * stored rank that excludes rule-granted acquisitions. A background grant is
 * therefore visible immediately as +0 (or +1 for a second acquisition), while
 * later increases remain reversible when that grant changes or is removed.
 */
export function storedRankForDisplayedSkillRank(displayed: number, sourceCount: number, credit = 0) {
  const rank = Number.isFinite(Number(displayed)) ? Number(displayed) : -1;
  const sources = Math.max(0, Number(sourceCount) || 0);
  const choices = Array.from({ length: 6 }, (_, index) => index - 1)
    .filter((purchased) => deriveSkillProfile({ purchased, sourceCount: sources, credit }).effective === rank);
  return choices.length
    ? choices[0]
    : Math.max(-1, Math.min(4, rank - sources));
}

export type VowedUnarmedProgression = { hit: number; damage: string; shock: string };
export type UnarmedAttackInput = {
  baseAttack: number;
  punchSkill: number;
  physicalModifier: number;
  warriorDamage: number;
  shockingAssaultBonus: number;
  shockThreshold: number;
  unarmedCombatantLevel: number;
  vowedProgression?: VowedUnarmedProgression;
  magicalVowedAttack?: boolean;
};

const withBonus = (dice: string, bonus: number) => `${dice}${bonus ? (bonus > 0 ? `+${bonus}` : `${bonus}`) : ""}`;

export function deriveUnarmedAttack(input: UnarmedAttackInput) {
  const punch = Math.max(-1, Math.min(4, input.punchSkill));
  const punchRank = Math.max(0, punch);
  const punchPenalty = punch < 0 ? -2 : 0;
  if (input.vowedProgression) {
    const shock = input.vowedProgression.shock.match(/^(\d+)\/(?:AC\s*)?(\d+)$/i);
    const shockDamage = (shock ? Number(shock[1]) : 0) + input.physicalModifier + input.warriorDamage + input.shockingAssaultBonus;
    return {
      hit: Math.max(input.baseAttack, input.vowedProgression.hit) + input.physicalModifier + punchRank + punchPenalty,
      damage: withBonus(input.vowedProgression.damage, input.physicalModifier + punchRank + input.warriorDamage),
      shock: `${Math.max(0, shockDamage)}/AC ${input.shockThreshold}`,
      note: `Vowed Unarmed Might${input.magicalVowedAttack ? " · magical attack" : ""}`,
    };
  }
  if (input.unarmedCombatantLevel) {
    const damage = ["1d6", "1d8", "1d10", "1d12", "1d12+1"][punchRank];
    const hasShock = punch >= 1;
    const shockDamage = punch + input.physicalModifier + input.warriorDamage + input.shockingAssaultBonus;
    return {
      hit: input.baseAttack + input.physicalModifier + punchRank + punchPenalty,
      damage: withBonus(damage, input.physicalModifier + input.warriorDamage),
      shock: hasShock ? `${Math.max(0, shockDamage)}/AC ${input.shockThreshold}` : "None",
      note: input.unarmedCombatantLevel >= 2
        ? "On a miss: unmodified 1d6 damage + any applicable Shock."
        : "Unarmed Combatant progression",
    };
  }
  return {
    hit: input.baseAttack + input.physicalModifier + punchRank + punchPenalty,
    damage: withBonus("1d2", input.physicalModifier + punchRank + input.warriorDamage),
    shock: "None",
    note: "Permanent unarmed attack",
  };
}
