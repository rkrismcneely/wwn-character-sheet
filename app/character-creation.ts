/**
 * Non-mutating Level 1 creation helpers.  These deliberately consume the
 * normal character fields; the wizard never owns a second character record.
 */

import { foci, highMageArts, highMagic } from "./wwn-data.ts";
import {
  artSlots,
  casterLimits,
  classRules,
  dualCasterLimits,
  fullClasses,
  invokerLimits,
  knownSpellSlots,
  partialClasses,
  traditionInfo,
  traditionKinds,
  traditionSpells,
  type TraditionName,
} from "./class-data.ts";
import { backgrounds } from "./background-data.ts";
import {
  activeBackgroundDevelopmentEntries,
  backgroundAttributeBonuses,
  backgroundAttributeChoices,
  backgroundAttributePointCount,
  normalizedBackgroundSkillResult,
  resolveBackgroundSkillGrants,
  resolvedBackgroundRollResult,
  type BackgroundDevelopmentEntry,
  type BackgroundDevelopmentMethod,
  type BackgroundDevelopmentRoll,
  type BackgroundLearningPick,
  type BackgroundSkillGrant,
} from "./background-development.ts";
import {
  armorRestrictsMagic,
  explicitFocusSkillChoices,
  focusIsRepeatable,
  focusTargetAvailable,
} from "./phase2-rules.ts";

export const creationAttributes = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
] as const;
export type CreationAttribute = (typeof creationAttributes)[number];
export const creationSkills = [
  "Administer",
  "Connect",
  "Convince",
  "Craft",
  "Exert",
  "Heal",
  "Know",
  "Lead",
  "Magic",
  "Notice",
  "Perform",
  "Pray",
  "Punch",
  "Ride",
  "Sail",
  "Shoot",
  "Sneak",
  "Stab",
  "Survive",
  "Trade",
  "Work",
] as const;
export const creationCombatSkills = ["Punch", "Shoot", "Stab"] as const;
export const creationNoncombatSkills = creationSkills.filter(
  (skill) =>
    !creationCombatSkills.includes(
      skill as (typeof creationCombatSkills)[number],
    ),
);
export const standardCreationArray = [14, 12, 11, 10, 9, 7] as const;

export type CreationFocusPick = {
  name: string;
  level: number;
  choice?: string;
};
export type CreationSpellPick = {
  name: string;
  prepared: boolean;
  cast: boolean;
  casts?: number;
};

/** Structural view of canonical character data; it is not a wizard schema. */
export type LevelOneCreationCharacter = {
  name: string;
  player: string;
  species: string;
  homeland: string;
  profession: string;
  description: string;
  portrait: string;
  level: number;
  attributeMethod: "rolled" | "array";
  attributeRolls: Record<CreationAttribute, number>;
  attributeSubstitution: "" | CreationAttribute;
  attributeBoosts: Record<CreationAttribute, number>;
  attrs: Record<CreationAttribute, number>;
  background: string;
  backgroundDevelopmentMethod: BackgroundDevelopmentMethod;
  backgroundCombatSkill: string;
  backgroundLearningPicks: BackgroundLearningPick[];
  backgroundDevelopmentRolls: BackgroundDevelopmentRoll[];
  classMode: "full" | "adventurer";
  classOne: string;
  classTwo: string;
  vowedEffortSkill: string;
  wiseConceptSkill: string;
  focusPicks: CreationFocusPick[];
  artPicks: string[];
  spellPicks: CreationSpellPick[];
  skillPurchases: Record<string, number>;
  hpRolls: number[];
  hpCurrent: number;
  hpMax: number;
  armor: string;
  shield: string;
  readied: string[];
  stowed: string[];
  gp: number;
  sp: number;
  cp: number;
};

export type CreationSkillLedgerEntry = {
  skill: string;
  source: string;
  rank: number;
};

export type CreationIssue = {
  step: CreationStepId;
  message: string;
};

export type CreationStepId =
  | "identity"
  | "attributes"
  | "background"
  | "class"
  | "foci"
  | "skills"
  | "magic"
  | "equipment"
  | "review";

export const creationSteps: readonly { id: CreationStepId; label: string }[] = [
  { id: "identity", label: "Identity & Concept" },
  { id: "attributes", label: "Attributes" },
  { id: "background", label: "Background" },
  { id: "class", label: "Class & Tradition" },
  { id: "foci", label: "Foci / Origin" },
  { id: "skills", label: "Background Benefits & Skills" },
  { id: "magic", label: "Magic" },
  { id: "equipment", label: "Equipment" },
  { id: "review", label: "Review & Finish" },
];

const signedModifier = (score: number) =>
  score <= 3 ? -2 : score <= 7 ? -1 : score <= 13 ? 0 : score <= 17 ? 1 : 2;
const capped = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const creationSkillRankCost = (rank: number) =>
  rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];
const storedCreationSkillRank = (
  purchases: Record<string, number>,
  skill: string,
) => {
  const value = Number(purchases[skill]);
  return Number.isFinite(value) ? capped(value, -1, 4) : -1;
};

export function creationFocusBonusSkill(pick: CreationFocusPick) {
  const focus = foci.find((item) => item.name === pick.name);
  if (!focus) return "";
  if (pick.name === "Specialist")
    return creationSkills.includes(
      pick.choice as (typeof creationSkills)[number],
    ) && !["Magic", "Stab", "Shoot", "Punch"].includes(pick.choice || "")
      ? pick.choice || ""
      : "";
  if (pick.name === "Polymath")
    return creationSkills.includes(
      pick.choice as (typeof creationSkills)[number],
    )
      ? pick.choice || ""
      : "";
  const explicit = explicitFocusSkillChoices(pick.name);
  if (explicit.length)
    return explicit.includes(pick.choice || "") ? pick.choice || "" : "";
  const match = (focus.level1 || "").match(
    /^Gain ([A-Za-z]+)(?: or ([A-Za-z]+))? as a bonus skill/i,
  );
  const options = match ? [match[1], match[2]].filter(Boolean) : [];
  return options.length === 1
    ? options[0]
    : options.includes(pick.choice || "")
      ? pick.choice || ""
      : "";
}

export function creationFocusChoiceOptions(name: string) {
  if (name === "Developed Attribute") return [...creationAttributes];
  if (name === "Xenoblooded")
    return ["STR +1 / DEX -1", "DEX +1 / STR -1", "Other"];
  if (name === "Traditional Education")
    return ["High Mage", "Elementalist", "Necromancer"];
  if (name === "Specialist")
    return creationSkills.filter(
      (skill) => !["Magic", "Stab", "Shoot", "Punch"].includes(skill),
    );
  if (name === "Polymath") return [...creationSkills];
  return explicitFocusSkillChoices(name);
}

export function creationFocusChoiceLabel(name: string) {
  if (name === "Developed Attribute") return "Improved attribute";
  if (name === "Xenoblooded") return "Heritage benefit";
  if (name === "Traditional Education") return "Specialist tradition";
  const options = creationFocusChoiceOptions(name);
  return options.length > 1 ? "Bonus skill" : "";
}

export function creationSkillGrants(
  state: Pick<
    LevelOneCreationCharacter,
    | "background"
    | "backgroundDevelopmentMethod"
    | "backgroundCombatSkill"
    | "backgroundLearningPicks"
    | "backgroundDevelopmentRolls"
    | "classMode"
    | "classOne"
    | "classTwo"
    | "focusPicks"
    | "vowedEffortSkill"
    | "wiseConceptSkill"
  >,
  developmentEntries = activeBackgroundDevelopmentEntries(
    state.background,
    state,
  ) as BackgroundDevelopmentEntry[],
) {
  const grants: BackgroundSkillGrant[] = [];
  const background = backgrounds[state.background];
  if (background)
    grants.push({
      id: "background-free",
      result: background.freeSkill,
      source: `${state.background} Background: free skill`,
      combatChoice: state.backgroundCombatSkill,
    });
  const classes = (
    state.classMode === "adventurer"
      ? [state.classOne, state.classTwo]
      : [state.classOne]
  ).filter(Boolean);
  classes.forEach((className, index) => {
    const result =
      className === "Vowed"
        ? state.vowedEffortSkill
        : className === "Wise"
          ? state.wiseConceptSkill
          : (
              {
                "High Mage": "Magic",
                Elementalist: "Magic",
                Necromancer: "Magic",
                Invoker: "Magic",
                Healer: "Heal",
                Accursed: "Magic",
                Bard: "Perform",
                Beastmaster: "Survive",
                "Blood Priest": "Pray",
                Duelist: "Stab",
                Mageslayer: "Magic",
                Skinshifter: "Survive",
                "Thought Noble": "Notice",
              } as Record<string, string>
            )[className];
    grants.push({
      id: `class-${index}`,
      result: result || "",
      source:
        className === "Vowed"
          ? "Vowed Order: bonus skill"
          : className === "Wise"
            ? "Wise Concept: bonus skill"
            : `${className} Class: bonus skill`,
    });
  });
  state.focusPicks
    .filter((pick) => pick.name)
    .forEach((pick, index) => {
      grants.push({
        id: `focus-${index}`,
        result: creationFocusBonusSkill(pick),
        source: `${pick.name} Focus: bonus skill`,
      });
    });
  developmentEntries.forEach((entry) => {
    grants.push({
      ...entry,
      combatChoice: entry.id.startsWith("quick-")
        ? state.backgroundCombatSkill
        : "",
    });
  });
  return grants;
}

export function creationSkillGrantResolutions(
  state: Pick<
    LevelOneCreationCharacter,
    | "background"
    | "backgroundDevelopmentMethod"
    | "backgroundCombatSkill"
    | "backgroundLearningPicks"
    | "backgroundDevelopmentRolls"
    | "classMode"
    | "classOne"
    | "classTwo"
    | "focusPicks"
    | "vowedEffortSkill"
    | "wiseConceptSkill"
  >,
) {
  return resolveBackgroundSkillGrants(
    creationSkillGrants(state),
    creationSkills,
    creationCombatSkills,
  );
}

export function creationSkillSources(
  state: Pick<
    LevelOneCreationCharacter,
    | "background"
    | "backgroundDevelopmentMethod"
    | "backgroundCombatSkill"
    | "backgroundLearningPicks"
    | "backgroundDevelopmentRolls"
    | "classMode"
    | "classOne"
    | "classTwo"
    | "focusPicks"
    | "vowedEffortSkill"
    | "wiseConceptSkill"
  >,
) {
  const sources = Object.fromEntries(
    creationSkills.map((skill) => [skill, [] as string[]]),
  ) as Record<string, string[]>;
  creationSkillGrantResolutions(state).forEach((grant) => {
    if (grant.resolvedSkill) sources[grant.resolvedSkill].push(grant.source);
  });
  return sources;
}

/** The SRD's one free starting skill pick, calculated from canonical layered ranks. */
export function levelOneFreeSkillPlan(
  state: Pick<LevelOneCreationCharacter, "skillPurchases">,
  sources: Record<string, string[]>,
) {
  const ranks = Object.fromEntries(
    creationSkills.map((skill) => {
      const sourceCount = sources[skill].length;
      return [
        skill,
        Math.min(
          4,
          storedCreationSkillRank(state.skillPurchases, skill) + sourceCount,
        ),
      ];
    }),
  ) as Record<string, number>;
  const deltas = Object.fromEntries(
    creationSkills.map((skill) => {
      const minimum = sources[skill].length
        ? Math.min(4, sources[skill].length - 1)
        : -1;
      return [
        skill,
        Math.max(
          0,
          creationSkillRankCost(ranks[skill]) - creationSkillRankCost(minimum),
        ),
      ];
    }),
  ) as Record<string, number>;
  const freeSkill = creationSkills.reduce(
    (best, skill) => (deltas[skill] > deltas[best] ? skill : best),
    creationSkills[0],
  );
  const freeValue = deltas[freeSkill];
  return {
    ranks,
    freeSkill: freeValue ? freeSkill : "",
    spending: Math.max(
      0,
      Object.values(deltas).reduce((total, value) => total + value, 0) -
        freeValue,
    ),
  };
}

const classNames = (
  state: Pick<LevelOneCreationCharacter, "classMode" | "classOne" | "classTwo">,
) =>
  (state.classMode === "full"
    ? [state.classOne]
    : [state.classOne, state.classTwo]
  ).filter(Boolean);

export function levelOneCreationStatus(state: LevelOneCreationCharacter) {
  const selectedClasses = classNames(state);
  const backgroundGrowth = backgroundAttributeBonuses(
    state.background,
    state.backgroundDevelopmentMethod,
    state.backgroundDevelopmentRolls,
    state.attrs,
  );
  const focusPicks = state.focusPicks.filter((pick) => pick.name);
  const attributeScore = (attribute: CreationAttribute) =>
    capped((state.attrs[attribute] || 0) + backgroundGrowth[attribute], 0, 18);
  const developed = focusPicks
    .filter(
      (pick) =>
        pick.name === "Developed Attribute" &&
        creationAttributes.includes(pick.choice as CreationAttribute),
    )
    .map((pick) => pick.choice as CreationAttribute);
  const xenoblooded =
    focusPicks.find((pick) => pick.name === "Xenoblooded")?.choice || "";
  const attributeModifier = (attribute: CreationAttribute) => {
    let value = signedModifier(attributeScore(attribute));
    if (developed.includes(attribute)) value = Math.min(3, value + 1);
    if (xenoblooded === "STR +1 / DEX -1")
      value += attribute === "STR" ? 1 : attribute === "DEX" ? -1 : 0;
    if (xenoblooded === "DEX +1 / STR -1")
      value += attribute === "DEX" ? 1 : attribute === "STR" ? -1 : 0;
    return Math.min(3, value);
  };
  const magicalTraditions = selectedClasses.filter(
    (name) => name in traditionInfo,
  ) as TraditionName[];
  const castingTraditions = magicalTraditions.filter(
    (tradition) => traditionInfo[tradition].spells,
  );
  const isMage = selectedClasses.some(
    (name) => traditionKinds[name] === "mage",
  );
  const rules = classRules(state.classMode, state.classOne, state.classTwo, 1);
  const allowedFocusPicks =
    state.classOne && (state.classMode === "full" || state.classTwo)
      ? rules.focusPicks
      : 0;
  const focusPicksUsed = focusPicks.reduce(
    (total, pick) => total + Math.max(1, Math.min(2, pick.level || 1)),
    0,
  );
  const armorRestricted = magicalTraditions.some((tradition) =>
    armorRestrictsMagic(traditionInfo[tradition].armor),
  );
  const hasNegativeAttribute = creationAttributes.some(
    (attribute) =>
      attributeScore(attribute) && attributeModifier(attribute) <= -1,
  );
  const focusEligibility = (name: string, slotIndex: number) => {
    if (!name) return { eligible: true, reason: "" };
    const existing = state.focusPicks.some(
      (pick, index) => index !== slotIndex && pick.name === name,
    );
    if (existing && !focusIsRepeatable(name))
      return { eligible: false, reason: "This Focus can only be taken once." };
    if (name === "Developed Attribute" && isMage)
      return {
        eligible: false,
        reason: "Mages and partial Mages cannot take Developed Attribute.",
      };
    if (name === "Armored Magic" && !armorRestricted)
      return {
        eligible: false,
        reason:
          "Armored Magic requires a tradition normally hindered by armor.",
      };
    if (name === "Lucky" && !hasNegativeAttribute)
      return {
        eligible: false,
        reason: "Lucky requires an attribute modifier of −1 or less.",
      };
    if (name === "Nullifier" && isMage)
      return {
        eligible: false,
        reason: "Mages and partial Mages cannot take Nullifier.",
      };
    if (name === "Polymath" && !selectedClasses.includes("Expert"))
      return {
        eligible: false,
        reason: "Only Experts or partial Experts can take Polymath.",
      };
    if (
      name === "Traditional Education" &&
      !selectedClasses.includes("Invoker")
    )
      return {
        eligible: false,
        reason: "Only an Invoker can take Traditional Education.",
      };
    const current = state.focusPicks[slotIndex];
    const nextCost = Math.max(1, Math.min(2, current?.level || 1));
    if (
      name !== current?.name &&
      focusPicksUsed -
        (current?.name ? Math.max(1, Math.min(2, current.level || 1)) : 0) +
        nextCost >
        allowedFocusPicks
    )
      return {
        eligible: false,
        reason: "There are not enough Focus picks remaining.",
      };
    return { eligible: true, reason: "" };
  };
  const traditionalEducation = focusPicks.find(
    (pick) => pick.name === "Traditional Education",
  )?.choice;
  const addedTradition = ["High Mage", "Elementalist", "Necromancer"].includes(
    traditionalEducation || "",
  )
    ? (traditionalEducation as TraditionName)
    : undefined;
  const artTraditions = [
    ...magicalTraditions,
    ...(addedTradition ? [addedTradition] : []),
  ].filter(
    (value, index, values) => values.indexOf(value) === index,
  ) as TraditionName[];
  const availableArts = artTraditions.flatMap((tradition) =>
    (tradition === "High Mage"
      ? highMageArts
      : traditionInfo[tradition].arts
    ).map((art) => ({
      ...art,
      minLevel: "minLevel" in art ? art.minLevel : undefined,
      tradition,
    })),
  );
  const artAllowance =
    magicalTraditions.reduce(
      (total, tradition) =>
        total + artSlots(tradition, 1, state.classMode === "adventurer"),
      0,
    ) +
    (addedTradition
      ? artSlots(addedTradition, 1, state.classMode === "adventurer")
      : 0);
  const isInvoker = castingTraditions.includes("Invoker");
  const limits =
    isInvoker && castingTraditions.length === 1
      ? invokerLimits(
          1,
          state.classMode === "adventurer",
          attributeModifier("INT"),
        )
      : castingTraditions.length > 1
        ? { ...dualCasterLimits(1), arts: 0 }
        : castingTraditions.length
          ? casterLimits(1, state.classMode === "adventurer")
          : { max: 0, casts: 0, prepared: 0, arts: 0 };
  const availableSpells = [
    ...highMagic.map((spell) => ({ ...spell, tradition: "High Magic" })),
    ...(castingTraditions.includes("Elementalist") ||
    addedTradition === "Elementalist"
      ? traditionSpells.Elementalist.map((spell) => ({
          ...spell,
          tradition: "Elementalist",
        }))
      : []),
    ...(castingTraditions.includes("Necromancer") ||
    addedTradition === "Necromancer"
      ? traditionSpells.Necromancer.map((spell) => ({
          ...spell,
          tradition: "Necromancer",
        }))
      : []),
  ];
  const knownSpellAllowance = knownSpellSlots(
    castingTraditions,
    1,
    state.classMode === "adventurer",
  );
  const sources = creationSkillSources(state);
  const polymath =
    focusPicks.find((pick) => pick.name === "Polymath")?.level || 0;
  const purchasedRanks = Object.fromEntries(
    creationSkills.map((skill) => {
      const granted = Math.min(
        4,
        storedCreationSkillRank(state.skillPurchases, skill) +
          sources[skill].length,
      );
      const floor =
        creationNoncombatSkills.includes(skill) && polymath
          ? polymath >= 2
            ? 1
            : 0
          : -1;
      return [skill, Math.max(granted, floor)];
    }),
  ) as Record<string, number>;
  const freeSkillPlan = levelOneFreeSkillPlan(state, sources);
  const skillRanks = Object.fromEntries(
    creationSkills.map((skill) => [
      skill,
      Math.max(purchasedRanks[skill], freeSkillPlan.ranks[skill]),
    ]),
  ) as Record<string, number>;
  const ledger = creationSkills.flatMap((skill) =>
    sources[skill].map((source) => ({
      skill,
      source,
      rank: skillRanks[skill],
    })),
  );
  const issues: CreationIssue[] = [];
  if (!state.name.trim())
    issues.push({ step: "identity", message: "Enter a character name." });
  const rolledComplete = creationAttributes.every(
    (attribute) =>
      Number.isInteger(state.attributeRolls[attribute]) &&
      state.attributeRolls[attribute] >= 3 &&
      state.attributeRolls[attribute] <= 18,
  );
  const arrayValues = creationAttributes
    .map(
      (attribute) => state.attrs[attribute] - state.attributeBoosts[attribute],
    )
    .sort((a, b) => a - b);
  const expectedArray = [...standardCreationArray].sort((a, b) => a - b);
  if (
    state.attributeMethod === "rolled"
      ? !rolledComplete
      : arrayValues.join(",") !== expectedArray.join(",")
  )
    issues.push({
      step: "attributes",
      message:
        state.attributeMethod === "rolled"
          ? "Record all six legal 3d6 scores."
          : "Assign each standard-array score once.",
    });
  if (!backgrounds[state.background])
    issues.push({ step: "background", message: "Choose a Background." });
  if (state.backgroundDevelopmentMethod === "review")
    issues.push({
      step: "skills",
      message: "Choose a valid Background development method.",
    });
  const grants = creationSkillGrantResolutions(state);
  if (grants.some((grant) => grant.needsChoice))
    issues.push({
      step: "skills",
      message: "Resolve each Background Any Combat or Any Skill choice.",
    });
  if (grants.some((grant) => grant.needsReplacement))
    issues.push({
      step: "skills",
      message:
        "Replace a third starting skill acquisition with an eligible skill.",
    });
  if (!freeSkillPlan.freeSkill)
    issues.push({
      step: "skills",
      message: "Choose the one free creation skill pick.",
    });
  if (freeSkillPlan.spending)
    issues.push({
      step: "skills",
      message:
        "Level 1 has only one free skill pick; remove additional purchased ranks.",
    });
  if (creationSkills.some((skill) => skillRanks[skill] > 1))
    issues.push({
      step: "skills",
      message: "No skill can begin above level 1.",
    });
  if (
    state.backgroundDevelopmentMethod === "choose-learning" &&
    state.backgroundLearningPicks.some((pick) => !pick.result)
  )
    issues.push({
      step: "skills",
      message: "Choose both Background Learning results.",
    });
  if (state.backgroundDevelopmentMethod === "roll-growth-learning") {
    if (
      state.backgroundDevelopmentRolls.some(
        (roll) =>
          !roll.die || !resolvedBackgroundRollResult(state.background, roll),
      )
    )
      issues.push({
        step: "skills",
        message: "Resolve all three Background Growth or Learning rolls.",
      });
    if (
      state.backgroundDevelopmentRolls.some(
        (roll) =>
          backgroundAttributePointCount(
            resolvedBackgroundRollResult(state.background, roll),
          ) > roll.attributeChoices.length,
      )
    )
      issues.push({
        step: "skills",
        message: "Assign every rolled Background Growth attribute point.",
      });
    const requestedGrowthPoints = state.backgroundDevelopmentRolls.reduce(
      (total, roll) =>
        total +
        Math.min(
          backgroundAttributePointCount(
            resolvedBackgroundRollResult(state.background, roll),
          ),
          roll.attributeChoices.filter((attribute) =>
            backgroundAttributeChoices(
              resolvedBackgroundRollResult(state.background, roll),
            ).includes(attribute),
          ).length,
        ),
      0,
    );
    const appliedGrowthPoints = creationAttributes.reduce(
      (total, attribute) => total + backgroundGrowth[attribute],
      0,
    );
    if (requestedGrowthPoints > appliedGrowthPoints)
      issues.push({
        step: "skills",
        message:
          "Background Growth cannot raise an attribute above 18; choose another legal attribute.",
      });
  }
  if (!state.classOne || (state.classMode === "adventurer" && !state.classTwo))
    issues.push({ step: "class", message: "Choose a legal class structure." });
  if (
    state.classMode === "full" &&
    state.classOne &&
    !fullClasses.includes(state.classOne as (typeof fullClasses)[number])
  )
    issues.push({
      step: "class",
      message: "Choose a full Class for this character.",
    });
  if (
    state.classMode === "adventurer" &&
    [state.classOne, state.classTwo].some(
      (name) =>
        name &&
        !partialClasses.includes(name as (typeof partialClasses)[number]),
    )
  )
    issues.push({
      step: "class",
      message: "Adventurers need two legal partial Classes.",
    });
  if (state.classMode === "adventurer" && state.classOne === state.classTwo)
    issues.push({
      step: "class",
      message: "Adventurers need two different partial classes.",
    });
  if (
    selectedClasses.includes("Mageslayer") &&
    selectedClasses.some((name) => traditionKinds[name] === "mage")
  )
    issues.push({
      step: "class",
      message: "Mageslayer cannot be combined with a Mage partial class.",
    });
  if (
    state.classMode === "adventurer" &&
    isInvoker &&
    castingTraditions.length > 1
  )
    issues.push({
      step: "class",
      message:
        "Partial Invoker cannot be combined with another partial spellcaster.",
    });
  const hasNoncombatSkill = (skill: string) =>
    (creationNoncombatSkills as readonly string[]).includes(skill);
  if (
    selectedClasses.includes("Vowed") &&
    !hasNoncombatSkill(state.vowedEffortSkill)
  )
    issues.push({ step: "class", message: "Choose the Vowed order skill." });
  if (
    selectedClasses.includes("Wise") &&
    !hasNoncombatSkill(state.wiseConceptSkill)
  )
    issues.push({ step: "class", message: "Choose the Wise concept skill." });
  if (focusPicksUsed !== allowedFocusPicks)
    issues.push({
      step: "foci",
      message: `Choose ${allowedFocusPicks} starting Focus pick${allowedFocusPicks === 1 ? "" : "s"}.`,
    });
  state.focusPicks.forEach((pick, index) => {
    if (pick.name && !focusEligibility(pick.name, index).eligible)
      issues.push({
        step: "foci",
        message: `${pick.name}: ${focusEligibility(pick.name, index).reason}`,
      });
    if (pick.name && creationFocusChoiceLabel(pick.name) && !pick.choice)
      issues.push({
        step: "foci",
        message: `${pick.name} needs ${creationFocusChoiceLabel(pick.name).toLowerCase()}.`,
      });
    if (
      (pick.name === "Developed Attribute" || pick.name === "Specialist") &&
      pick.choice &&
      !focusTargetAvailable(state.focusPicks, pick.name, pick.choice, index)
    )
      issues.push({
        step: "foci",
        message: `${pick.name} must choose a target not used by another ${pick.name} Focus.`,
      });
  });
  const selectedArts = state.artPicks.filter(Boolean);
  if (selectedArts.length !== artAllowance)
    issues.push({
      step: "magic",
      message: `Choose ${artAllowance} level-1 Art${artAllowance === 1 ? "" : "s"}.`,
    });
  selectedArts.forEach((name, index) => {
    const art = availableArts.find((candidate) => candidate.name === name);
    if (!art)
      issues.push({
        step: "magic",
        message: `${name} is not available to the selected tradition.`,
      });
    if ((art?.minLevel || 1) > 1)
      issues.push({
        step: "magic",
        message: `${name} requires level ${art?.minLevel}.`,
      });
    if (
      name === "Deep Apprehension" &&
      !selectedArts.includes("Surface Apprehension")
    )
      issues.push({
        step: "magic",
        message: "Deep Apprehension requires Surface Apprehension.",
      });
    if (
      name !== "Skilled" &&
      selectedArts.findIndex((other) => other === name) !== index
    )
      issues.push({
        step: "magic",
        message: `${name} can be selected only once.`,
      });
  });
  const selectedSpells = state.spellPicks.filter((pick) => pick.name);
  if (selectedSpells.length !== knownSpellAllowance)
    issues.push({
      step: "magic",
      message: `Choose ${knownSpellAllowance} starting spell${knownSpellAllowance === 1 ? "" : "s"}.`,
    });
  selectedSpells.forEach((pick, index) => {
    const spell = availableSpells.find(
      (candidate) => candidate.name === pick.name,
    );
    if (!spell || spell.level > limits.max)
      issues.push({
        step: "magic",
        message: `${pick.name} is not a legal level-1 spell selection.`,
      });
    if (selectedSpells.findIndex((other) => other.name === pick.name) !== index)
      issues.push({
        step: "magic",
        message: `${pick.name} is selected more than once.`,
      });
  });
  const hitPointClassBonus =
    selectedClasses.includes("Warrior") && !selectedClasses.includes("Duelist")
      ? 2
      : selectedClasses.includes("Expert") || selectedClasses.includes("Vowed")
        ? 0
        : -1;
  const startingHp =
    state.hpRolls[0] >= 1 && state.hpRolls[0] <= 6
      ? Math.max(
          1,
          state.hpRolls[0] +
            attributeModifier("CON") +
            hitPointClassBonus +
            (focusPicks.some((pick) => pick.name === "Die Hard") ? 2 : 0),
        )
      : 0;
  if (!startingHp)
    issues.push({
      step: "review",
      message: "Record the level-1 hit die result.",
    });
  if (
    !state.readied.some((item) => item.trim()) &&
    !state.stowed.some((item) => item.trim()) &&
    !state.sp
  )
    issues.push({
      step: "equipment",
      message: "Choose starting gear or record the SRD starting silver roll.",
    });
  const stepStatus = Object.fromEntries(
    creationSteps.map((step) => [
      step.id,
      {
        complete: !issues.some((issue) => issue.step === step.id),
        issues: issues
          .filter((issue) => issue.step === step.id)
          .map((issue) => issue.message),
      },
    ]),
  ) as Record<CreationStepId, { complete: boolean; issues: string[] }>;
  return {
    selectedClasses,
    classLabel: !state.classOne
      ? ""
      : state.classMode === "full"
        ? state.classOne
        : `${state.classOne}${state.classTwo ? ` / ${state.classTwo}` : ""} Adventurer`,
    rules,
    attributeScore,
    attributeModifier,
    backgroundGrowth,
    sources,
    ledger,
    skillRanks,
    freeSkillPlan,
    focusEligibility,
    allowedFocusPicks,
    focusPicksUsed,
    availableArts,
    artAllowance,
    availableSpells,
    knownSpellAllowance,
    limits,
    magicalTraditions,
    castingTraditions,
    hasMagicStep: artAllowance > 0 || knownSpellAllowance > 0,
    issues,
    stepStatus,
    canFinish: issues.length === 0,
    startingHp,
    saves: {
      Physical:
        15 - Math.max(attributeModifier("STR"), attributeModifier("CON")),
      Evasion:
        15 - Math.max(attributeModifier("DEX"), attributeModifier("INT")),
      Mental: 15 - Math.max(attributeModifier("WIS"), attributeModifier("CHA")),
      Luck: 15,
    },
  };
}

export function choiceOptionsForBackgroundResult(result: string) {
  const normalized = normalizedBackgroundSkillResult(result);
  if (normalized === "Any Combat") return [...creationCombatSkills];
  if (normalized === "Any Skill") return [...creationSkills];
  return [];
}

/** Manual Learning is a choice list, unlike the duplicate-weighted roll table. */
export function manualBackgroundLearningOptions(backgroundName: string) {
  return [
    ...new Set(
      (backgrounds[backgroundName]?.learning || []).filter(
        (result) => result !== "Any Skill",
      ),
    ),
  ];
}

export { backgroundAttributeChoices, backgroundAttributePointCount };
