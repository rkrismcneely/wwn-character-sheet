import { backgrounds } from "./background-data.ts";

export const backgroundAttributes = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type BackgroundAttributeName = typeof backgroundAttributes[number];
export type BackgroundDevelopmentMethod = "quick" | "choose-learning" | "roll-growth-learning" | "review";
export type BackgroundRollTable = "growth" | "learning";

export type BackgroundLearningPick = {
  result: string;
  /** The skill selected for an Any Combat or Any Skill result. */
  choice?: string;
  /** The legal substitute required when a fixed result would be a third acquisition. */
  replacement?: string;
};

export type BackgroundDevelopmentRoll = BackgroundLearningPick & {
  table: BackgroundRollTable;
  die: number;
  /** Saved explicitly so a character never rerolls merely by being reloaded. */
  result: string;
  /** One entry for +1 Any Stat, or two entries for a +2 Physical/Mental split. */
  attributeChoices: BackgroundAttributeName[];
};

export type BackgroundDevelopmentLegacy = {
  reason: "combined-growth-learning" | "invalid-chosen-any-skill";
  growthRolls: BackgroundDevelopmentRoll[];
  learningPicks: BackgroundLearningPick[];
};

export type BackgroundDevelopmentFields = {
  backgroundDevelopmentMethod: BackgroundDevelopmentMethod;
  backgroundCombatSkill: string;
  backgroundLearningPicks: BackgroundLearningPick[];
  backgroundDevelopmentRolls: BackgroundDevelopmentRoll[];
  backgroundDevelopmentLegacy?: BackgroundDevelopmentLegacy;
};

export type BackgroundDevelopmentEntry = BackgroundLearningPick & {
  id: string;
  source: string;
  result: string;
};

export type BackgroundSkillGrant = BackgroundLearningPick & {
  id: string;
  result: string;
  source: string;
  /** Used only by the Background's Free Skill and Quick Skills package. */
  combatChoice?: string;
};

export type BackgroundSkillGrantResolution = BackgroundSkillGrant & {
  rawSkill: string;
  resolvedSkill: string;
  needsChoice: boolean;
  needsReplacement: boolean;
};

const isAttribute = (value: unknown): value is BackgroundAttributeName =>
  typeof value === "string" && backgroundAttributes.includes(value as BackgroundAttributeName);

const isRollTable = (value: unknown): value is BackgroundRollTable =>
  value === "growth" || value === "learning";

const isMethod = (value: unknown): value is BackgroundDevelopmentMethod =>
  value === "quick" || value === "choose-learning" || value === "roll-growth-learning" || value === "review";

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

const numberDie = (value: unknown, maximum: number) => {
  const die = Number(value);
  return Number.isInteger(die) && die >= 1 && die <= maximum ? die : 0;
};

export const blankBackgroundLearningPicks = (): BackgroundLearningPick[] =>
  Array.from({ length: 2 }, () => ({ result: "", choice: "", replacement: "" }));

export const blankBackgroundDevelopmentRoll = (table: BackgroundRollTable = "growth"): BackgroundDevelopmentRoll => ({
  table,
  die: 0,
  result: "",
  choice: "",
  replacement: "",
  attributeChoices: [],
});

export const blankBackgroundDevelopmentRolls = (): BackgroundDevelopmentRoll[] =>
  Array.from({ length: 3 }, () => blankBackgroundDevelopmentRoll());

export const backgroundTableResult = (backgroundName: string, table: BackgroundRollTable, die: number) => {
  const background = backgrounds[backgroundName];
  return background?.[table][die - 1] || "";
};

export const resolvedBackgroundRollResult = (backgroundName: string, roll: Pick<BackgroundDevelopmentRoll, "table" | "die" | "result">) =>
  roll.die ? backgroundTableResult(backgroundName, roll.table, roll.die) : "";

export const backgroundAttributeChoices = (result: string): BackgroundAttributeName[] => {
  if (result === "+1 Any Stat") return [...backgroundAttributes];
  if (result === "+2 Physical") return ["STR", "DEX", "CON"];
  if (result === "+2 Mental") return ["INT", "WIS", "CHA"];
  return [];
};

export const backgroundAttributePointCount = (result: string) =>
  result === "+1 Any Stat" ? 1 : result === "+2 Physical" || result === "+2 Mental" ? 2 : 0;

/** Interpret a canonical ranked skill result without changing its stored form. */
export const normalizedBackgroundSkillResult = (result: string) => result.replace(/-\d+$/, "");

export function rollBackgroundTable(
  backgroundName: string,
  table: BackgroundRollTable,
  random: () => number = Math.random,
): BackgroundDevelopmentRoll {
  const outcomes = backgrounds[backgroundName]?.[table] || [];
  if (!outcomes.length) return blankBackgroundDevelopmentRoll(table);
  const die = Math.min(outcomes.length, Math.max(1, Math.floor(random() * outcomes.length) + 1));
  return {
    ...blankBackgroundDevelopmentRoll(table),
    die,
    result: outcomes[die - 1],
  };
}

/**
 * Applies only active rolled Growth attribute results. The base-score check is
 * intentionally done here as a final guard for imported data as well as the UI.
 */
export function backgroundAttributeBonuses(
  backgroundName: string,
  method: BackgroundDevelopmentMethod,
  rolls: readonly BackgroundDevelopmentRoll[],
  baseScores: Partial<Record<BackgroundAttributeName, number>>,
) {
  const bonuses = Object.fromEntries(backgroundAttributes.map(attribute => [attribute, 0])) as Record<BackgroundAttributeName, number>;
  if (method !== "roll-growth-learning") return bonuses;

  rolls.forEach(roll => {
    if (roll.table !== "growth") return;
    const result = resolvedBackgroundRollResult(backgroundName, roll);
    const permitted = backgroundAttributeChoices(result);
    const pointCount = backgroundAttributePointCount(result);
    roll.attributeChoices.slice(0, pointCount).forEach(attribute => {
      if (!isAttribute(attribute) || !permitted.includes(attribute)) return;
      const base = Number(baseScores[attribute]) || 0;
      if (base + bonuses[attribute] < 18) bonuses[attribute] += 1;
    });
  });
  return bonuses;
}

const normalizePick = (value: unknown): BackgroundLearningPick => {
  if (typeof value === "string") return { result: value, choice: "", replacement: "" };
  const pick = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    result: stringValue(pick.result),
    choice: stringValue(pick.choice),
    replacement: stringValue(pick.replacement),
  };
};

const normalizeRoll = (backgroundName: string, value: unknown): BackgroundDevelopmentRoll => {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const table: BackgroundRollTable = isRollTable(raw.table) ? raw.table : "growth";
  const die = numberDie(raw.die, backgrounds[backgroundName]?.[table].length || (table === "growth" ? 6 : 8));
  const tableResult = backgroundTableResult(backgroundName, table, die);
  // The die is the durable source of truth.  Keeping the result alongside it
  // makes saved characters inspectable, while this validation prevents a
  // stale result from surviving a table change or an edited import.
  const result = die ? tableResult : "";
  const permitted = backgroundAttributeChoices(result);
  const pointCount = backgroundAttributePointCount(result);
  const attributeChoices = Array.isArray(raw.attributeChoices)
    ? raw.attributeChoices.filter(isAttribute).filter(attribute => permitted.includes(attribute)).slice(0, pointCount)
    : [];
  return {
    table,
    die,
    result,
    choice: stringValue(raw.choice),
    replacement: stringValue(raw.replacement),
    attributeChoices,
  };
};

const legacyGrowthRolls = (stored: Record<string, unknown>, backgroundName: string) =>
  Array.from({ length: 3 }, (_, index) => {
    const die = numberDie(Array.isArray(stored.backgroundGrowthRolls) ? stored.backgroundGrowthRolls[index] : 0, 6);
    const result = backgroundTableResult(backgroundName, "growth", die);
    const legacyChoice = stringValue(Array.isArray(stored.backgroundGrowthChoices) ? stored.backgroundGrowthChoices[index] : "");
    const pointCount = backgroundAttributePointCount(result);
    const permitted = backgroundAttributeChoices(result);
    return {
      table: "growth" as const,
      die,
      result,
      choice: legacyChoice,
      replacement: "",
      attributeChoices: pointCount && isAttribute(legacyChoice) && permitted.includes(legacyChoice)
        ? Array.from({ length: pointCount }, () => legacyChoice)
        : [],
    };
  });

const legacyLearningPicks = (stored: Record<string, unknown>) => {
  const raw = Array.isArray(stored.backgroundLearningPicks) ? stored.backgroundLearningPicks : [];
  return Array.from({ length: 2 }, (_, index) => normalizePick(raw[index]));
};

const hasRollData = (rolls: readonly BackgroundDevelopmentRoll[]) =>
  rolls.some(roll => Boolean(roll.die || roll.result || roll.choice || roll.attributeChoices.length));

const hasPickData = (picks: readonly BackgroundLearningPick[]) =>
  picks.some(pick => Boolean(pick.result || pick.choice || pick.replacement));

const legacyRecord = (reason: BackgroundDevelopmentLegacy["reason"], growthRolls: BackgroundDevelopmentRoll[], learningPicks: BackgroundLearningPick[]): BackgroundDevelopmentLegacy => ({
  reason,
  growthRolls,
  learningPicks,
});

const normalizeStoredLegacy = (backgroundName: string, value: unknown): BackgroundDevelopmentLegacy | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const growthRaw = Array.isArray(raw.growthRolls) ? raw.growthRolls : [];
  const learningRaw = Array.isArray(raw.learningPicks) ? raw.learningPicks : [];
  const growthRolls = Array.from({ length: 3 }, (_, index) => normalizeRoll(backgroundName, growthRaw[index]));
  const learningPicks = Array.from({ length: 2 }, (_, index) => normalizePick(learningRaw[index]));
  if (!hasRollData(growthRolls) && !hasPickData(learningPicks)) return undefined;
  return legacyRecord(raw.reason === "invalid-chosen-any-skill" ? "invalid-chosen-any-skill" : "combined-growth-learning", growthRolls, learningPicks);
};

/**
 * Migrates the prior invalid combined state conservatively. When it contained
 * both rolled Growth and chosen Learning values, the values remain recorded but
 * none are applied until the user chooses one of the three valid methods.
 */
export function normalizeBackgroundDevelopment(storedValue: unknown, backgroundName: string): BackgroundDevelopmentFields {
  const stored = storedValue && typeof storedValue === "object" ? storedValue as Record<string, unknown> : {};
  const method = isMethod(stored.backgroundDevelopmentMethod) ? stored.backgroundDevelopmentMethod : undefined;
  const backgroundCombatSkill = stringValue(stored.backgroundCombatSkill);
  const newRollsRaw = Array.isArray(stored.backgroundDevelopmentRolls) ? stored.backgroundDevelopmentRolls : [];
  const newRolls = Array.from({ length: 3 }, (_, index) => normalizeRoll(backgroundName, newRollsRaw[index]));
  const newLearningRaw = Array.isArray(stored.backgroundLearningPicks) ? stored.backgroundLearningPicks : [];
  const newLearningPicks = Array.from({ length: 2 }, (_, index) => normalizePick(newLearningRaw[index]));

  if (method) {
    const storedLegacy = normalizeStoredLegacy(backgroundName, stored.backgroundDevelopmentLegacy);
    const invalidChosenAnySkill = method === "choose-learning" && newLearningPicks.some(pick => pick.result === "Any Skill");
    if (method === "review" || invalidChosenAnySkill) {
      return {
        backgroundDevelopmentMethod: "review",
        backgroundCombatSkill,
        backgroundLearningPicks: newLearningPicks,
        backgroundDevelopmentRolls: newRolls,
        backgroundDevelopmentLegacy: storedLegacy || legacyRecord("invalid-chosen-any-skill", newRolls, newLearningPicks),
      };
    }
    return {
      backgroundDevelopmentMethod: method,
      backgroundCombatSkill,
      backgroundLearningPicks: newLearningPicks,
      backgroundDevelopmentRolls: newRolls,
      backgroundDevelopmentLegacy: storedLegacy,
    };
  }

  const oldMode = stored.backgroundSkillMode;
  if (oldMode === "growth" || oldMode === "custom") {
    const growthRolls = legacyGrowthRolls(stored, backgroundName);
    const learningPicks = legacyLearningPicks(stored);
    const growthUsed = hasRollData(growthRolls);
    const learningUsed = hasPickData(learningPicks);
    const invalidChosenAnySkill = learningPicks.some(pick => pick.result === "Any Skill");
    if ((growthUsed && learningUsed) || invalidChosenAnySkill) {
      return {
        backgroundDevelopmentMethod: "review",
        backgroundCombatSkill,
        backgroundLearningPicks: learningPicks,
        backgroundDevelopmentRolls: growthRolls,
        backgroundDevelopmentLegacy: legacyRecord(invalidChosenAnySkill ? "invalid-chosen-any-skill" : "combined-growth-learning", growthRolls, learningPicks),
      };
    }
    return {
      backgroundDevelopmentMethod: learningUsed ? "choose-learning" : "roll-growth-learning",
      backgroundCombatSkill,
      backgroundLearningPicks: learningPicks,
      backgroundDevelopmentRolls: growthRolls,
    };
  }

  return {
    backgroundDevelopmentMethod: "quick",
    backgroundCombatSkill,
    backgroundLearningPicks: newLearningPicks,
    backgroundDevelopmentRolls: newRolls,
  };
}

/** Returns only the currently active development benefits; the Free Skill is handled separately. */
export function activeBackgroundDevelopmentEntries(backgroundName: string, fields: Pick<BackgroundDevelopmentFields, "backgroundDevelopmentMethod" | "backgroundLearningPicks" | "backgroundDevelopmentRolls">): BackgroundDevelopmentEntry[] {
  const background = backgrounds[backgroundName];
  if (!background) return [];
  if (fields.backgroundDevelopmentMethod === "quick") {
    return background.quickSkills.map((result, index) => ({
      id: `quick-${index}`,
      source: `${backgroundName} Background: Quick Skills`,
      result,
      choice: "",
      replacement: "",
    }));
  }
  if (fields.backgroundDevelopmentMethod === "choose-learning") {
    return fields.backgroundLearningPicks.map((pick, index) => ({
      id: `learning-${index}`,
      source: `${backgroundName} Background: chosen Learning ${index + 1}`,
      ...pick,
    }));
  }
  if (fields.backgroundDevelopmentMethod === "roll-growth-learning") {
    return fields.backgroundDevelopmentRolls.flatMap((roll, index) => {
      const result = resolvedBackgroundRollResult(backgroundName, roll);
      if (!roll.die || !result) return [];
      return [{
        id: `roll-${index}`,
        source: `${backgroundName} Background: ${roll.table === "growth" ? "Growth" : "Learning"} ${index + 1}`,
        result,
        choice: roll.choice,
        replacement: roll.replacement,
      }];
    });
  }
  return [];
}

const resolvedSkillWithoutReplacement = (
  grant: BackgroundSkillGrant,
  allowedSkills: readonly string[],
  combatSkills: readonly string[],
) => {
  const bare = normalizedBackgroundSkillResult(grant.result);
  if (bare === "Any Combat") {
    const choice = grant.choice || grant.combatChoice || "";
    return combatSkills.includes(choice) ? choice : "";
  }
  if (bare === "Any Skill") return allowedSkills.includes(grant.choice || "") ? grant.choice || "" : "";
  return allowedSkills.includes(bare) ? bare : "";
};

/**
 * Character-creation acquisitions are capped at two per skill. A fixed third
 * result is held pending until a valid replacement is selected, rather than
 * accidentally creating a starting skill above level 1.
 */
export function resolveBackgroundSkillGrants(
  grants: readonly BackgroundSkillGrant[],
  allowedSkills: readonly string[],
  combatSkills: readonly string[],
): BackgroundSkillGrantResolution[] {
  const counts = Object.fromEntries(allowedSkills.map(skill => [skill, 0])) as Record<string, number>;
  return grants.map(grant => {
    const rawSkill = resolvedSkillWithoutReplacement(grant, allowedSkills, combatSkills);
    const bare = normalizedBackgroundSkillResult(grant.result);
    const needsChoice = (bare === "Any Combat" || bare === "Any Skill") && !rawSkill;
    if (!rawSkill) return { ...grant, rawSkill: "", resolvedSkill: "", needsChoice, needsReplacement: false };
    if (counts[rawSkill] < 2) {
      counts[rawSkill] += 1;
      return { ...grant, rawSkill, resolvedSkill: rawSkill, needsChoice: false, needsReplacement: false };
    }
    const replacement = allowedSkills.includes(grant.replacement || "") ? grant.replacement || "" : "";
    if (replacement && counts[replacement] < 2) {
      counts[replacement] += 1;
      return { ...grant, rawSkill, resolvedSkill: replacement, needsChoice: false, needsReplacement: false };
    }
    return { ...grant, rawSkill, resolvedSkill: "", needsChoice: false, needsReplacement: true };
  });
}
