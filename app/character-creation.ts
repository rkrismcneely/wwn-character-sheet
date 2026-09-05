/**
 * Public Level 1 creation rules facade.
 *
 * The established creation engine remains in character-creation-base.ts. This
 * facade tightens the two places where creation needs to account for resources
 * that span otherwise-independent choices: the single free skill pick plus
 * Wise's Skilled points, and per-tradition Art entitlements for Adventurers.
 */

export * from "./character-creation-base.ts";

import * as base from "./character-creation-base.ts";
import { artSlots, type TraditionName } from "./class-data.ts";

const rankCost = (rank: number) =>
  rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];

const storedRank = (purchases: Record<string, number>, skill: string) => {
  const value = Number(purchases[skill]);
  if (!Number.isFinite(value)) return -1;
  return Math.max(-1, Math.min(4, value));
};

type SkillStep = {
  skill: string;
  fromRank: number;
  toRank: number;
  cost: number;
  combat: boolean;
};

/**
 * Resolve the SRD's one free skill pick as exactly one rank increase. Wise's
 * Skilled Art supplies ordinary skill points for the remaining non-combat
 * increases; it never turns the free pick into a pool of skill points.
 */
export function levelOneFreeSkillPlan(
  state: Pick<base.LevelOneCreationCharacter, "skillPurchases">,
  sources: Record<string, string[]>,
  skillPointAllowance = 0,
) {
  const ranks = Object.fromEntries(
    base.creationSkills.map((skill) => {
      const sourceCount = sources[skill].length;
      return [
        skill,
        Math.min(4, storedRank(state.skillPurchases, skill) + sourceCount),
      ];
    }),
  ) as Record<string, number>;

  const steps: SkillStep[] = [];
  for (const skill of base.creationSkills) {
    const minimumRank = sources[skill].length
      ? Math.min(4, sources[skill].length - 1)
      : -1;
    const finalRank = ranks[skill];
    for (let toRank = minimumRank + 1; toRank <= finalRank; toRank += 1) {
      const fromRank = toRank - 1;
      steps.push({
        skill,
        fromRank,
        toRank,
        cost: rankCost(toRank) - rankCost(fromRank),
        combat: (base.creationCombatSkills as readonly string[]).includes(skill),
      });
    }
  }

  const combatSteps = steps.filter((step) => step.combat);
  let freeStep: SkillStep | undefined;
  if (combatSteps.length) {
    // Skilled cannot pay for combat ranks, so the sole free pick must cover one
    // of them. Any additional combat rank step is necessarily illegal.
    freeStep = combatSteps.reduce((best, step) =>
      step.cost > best.cost ? step : best,
    );
  } else if (steps.length) {
    // With only non-combat increases, spend the free pick on the most expensive
    // single rank step so the remaining Skilled-point cost is minimized.
    freeStep = steps.reduce((best, step) =>
      step.cost > best.cost ? step : best,
    );
  }

  const paidSteps = steps.filter((step) => step !== freeStep);
  const invalidCombatSteps = paidSteps.filter((step) => step.combat).length;
  const skillPointsSpent = paidSteps
    .filter((step) => !step.combat)
    .reduce((total, step) => total + step.cost, 0);
  const allowance = Math.max(0, Math.floor(skillPointAllowance));
  const overspend = Math.max(0, skillPointsSpent - allowance);
  const skillPointsRemaining = Math.max(0, allowance - skillPointsSpent);

  return {
    ranks,
    freeSkill: freeStep?.skill || "",
    freeFromRank: freeStep?.fromRank ?? null,
    freeToRank: freeStep?.toRank ?? null,
    skillPointAllowance: allowance,
    skillPointsSpent,
    skillPointsRemaining,
    invalidCombatSteps,
    overspend,
    // Keep the established field as the UI's quick legality signal.
    spending: overspend + invalidCombatSteps,
  };
}

const removedBaseSkillMessages = new Set([
  "Choose the one free creation skill pick.",
  "Level 1 has only one free skill pick; remove additional purchased ranks.",
]);

const traditionalEducationTradition = (
  state: base.LevelOneCreationCharacter,
): TraditionName | "" => {
  const choice = state.focusPicks.find(
    (pick) => pick.name === "Traditional Education",
  )?.choice;
  return choice === "High Mage" || choice === "Elementalist" || choice === "Necromancer"
    ? choice
    : "";
};

/**
 * Apply the cross-choice creation rules on top of the canonical creation
 * projection. This keeps all existing Background, Focus, spell, equipment,
 * and class validation intact while making these resource budgets explicit.
 */
export function levelOneCreationStatus(state: base.LevelOneCreationCharacter) {
  const status = base.levelOneCreationStatus(state);
  const addedTradition = traditionalEducationTradition(state);
  const artTraditions = [
    ...status.magicalTraditions,
    ...(addedTradition ? [addedTradition] : []),
  ].filter(
    (tradition, index, traditions) => traditions.indexOf(tradition) === index,
  ) as TraditionName[];

  const artAllowanceByTradition = Object.fromEntries(
    artTraditions.map((tradition) => [
      tradition,
      artSlots(tradition, 1, state.classMode === "adventurer"),
    ]),
  ) as Partial<Record<TraditionName, number>>;
  const artCountsByTradition = Object.fromEntries(
    artTraditions.map((tradition) => [tradition, 0]),
  ) as Partial<Record<TraditionName, number>>;
  const selectedArts = state.artPicks.filter(Boolean);
  for (const selection of selectedArts) {
    const art = base.creationArtForSelection(status.availableArts, selection);
    const tradition = art?.tradition as TraditionName | undefined;
    if (tradition && tradition in artCountsByTradition)
      artCountsByTradition[tradition] = (artCountsByTradition[tradition] || 0) + 1;
  }

  const wiseSkilledSelections = selectedArts.filter((selection) => {
    const art = base.creationArtForSelection(status.availableArts, selection);
    return art?.tradition === "Wise" && base.artSelectionName(selection) === "Skilled";
  }).length;
  const skilledArtCount = Math.min(
    wiseSkilledSelections,
    artAllowanceByTradition.Wise || 0,
  );
  const skillPointAllowance = skilledArtCount * 3;
  const freeSkillPlan = levelOneFreeSkillPlan(
    state,
    status.sources,
    skillPointAllowance,
  );

  const issues: base.CreationIssue[] = status.issues.filter(
    (issue) =>
      issue.step !== "skills" || !removedBaseSkillMessages.has(issue.message),
  );

  if (!freeSkillPlan.freeSkill)
    issues.push({
      step: "skills",
      message: "Choose the one free creation skill pick.",
    });
  if (freeSkillPlan.invalidCombatSteps)
    issues.push({
      step: "skills",
      message:
        "Only the one free skill pick can fund combat-skill ranks; Skilled can spend points only on non-combat skills.",
    });
  if (freeSkillPlan.overspend)
    issues.push({
      step: "skills",
      message: skillPointAllowance
        ? `Wise's Skilled Art grants ${skillPointAllowance} non-combat skill points; reduce the selected skill ranks to that budget.`
        : "The free skill pick raises only one skill by one rank; it cannot take an untrained skill directly to level 1.",
    });
  if (skillPointAllowance && freeSkillPlan.skillPointsRemaining)
    issues.push({
      step: "skills",
      message: `Spend all ${skillPointAllowance} non-combat skill points granted by Skilled.`,
    });

  for (const tradition of artTraditions) {
    const allowed = artAllowanceByTradition[tradition] || 0;
    const selected = artCountsByTradition[tradition] || 0;
    if (selected !== allowed)
      issues.push({
        step: "magic",
        message: `${tradition} supplies ${allowed} starting Art${allowed === 1 ? "" : "s"}; select exactly that many from the ${tradition} Art list.`,
      });
  }

  const stepStatus = Object.fromEntries(
    base.creationSteps.map((step) => [
      step.id,
      {
        complete: !issues.some((issue) => issue.step === step.id),
        issues: issues
          .filter((issue) => issue.step === step.id)
          .map((issue) => issue.message),
      },
    ]),
  ) as Record<base.CreationStepId, { complete: boolean; issues: string[] }>;

  return {
    ...status,
    freeSkillPlan,
    artAllowanceByTradition,
    artCountsByTradition,
    skilledArtCount,
    skillPointAllowance,
    issues,
    stepStatus,
    canFinish: issues.length === 0,
  };
}

/**
 * Keep the skill dropdown from offering ranks that need more resources than
 * the character currently has. Unspent Skilled points are allowed while the
 * player is still making choices; completion requires spending the full grant.
 */
export function creationSkillRankCanBeSelected(
  state: base.LevelOneCreationCharacter,
  skill: string,
  rank: number,
) {
  if (!(base.creationSkills as readonly string[]).includes(skill)) return false;
  const current = levelOneCreationStatus(state);
  const sourceCount = current.sources[skill].length;
  const minimum = Math.min(1, Math.max(-1, sourceCount - 1));
  if (rank < minimum || rank > 1) return false;
  const skillPurchases = {
    ...state.skillPurchases,
    [skill]: Math.max(-1, Math.min(1, rank - sourceCount)),
  };
  const candidate = levelOneCreationStatus({ ...state, skillPurchases });
  return (
    candidate.freeSkillPlan.spending === 0 &&
    candidate.skillRanks[skill] <= 1
  );
}
