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
  forcedArtsForTraditions,
  invokerLimits,
  knownSpellSlots,
  partialClasses,
  startingArtChoiceGroupsForTraditions,
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
import {
  creationEquipmentChoiceIsComplete,
  type CreationEquipmentBase,
  type CreationEquipmentMethod,
} from "./creation-equipment.ts";
import {
  officialLanguages,
  startingLanguageAllowance,
} from "./language-data.ts";

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
  /** A Focus taken during advancement grants a three-point skill credit instead of a creation source. */
  advancement?: boolean;
};
export type CreationSpellPick = {
  name: string;
  prepared: boolean;
  cast: boolean;
  casts?: number;
};

export type BeastmasterBond = "" | "bind-companion" | "chosen-friend";
export const beastmasterBondOptions = ["bind-companion", "chosen-friend"] as const;
export const chosenFriendBenefitArts = ["Mind Call", "Shared Vitality"] as const;

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
  backgroundQuickSkillReplacements: string[];
  backgroundLearningPicks: BackgroundLearningPick[];
  backgroundDevelopmentRolls: BackgroundDevelopmentRoll[];
  classMode: "full" | "adventurer";
  languages: string[];
  classOne: string;
  classTwo: string;
  vowedEffortSkill: string;
  wiseConceptSkill: string;
  beastmasterBond: BeastmasterBond;
  focusPicks: CreationFocusPick[];
  artPicks: string[];
  artChoices: Record<string, string[]>;
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
  creationEquipmentMethod: CreationEquipmentMethod;
  creationEquipmentPackage: string;
  creationStartingSilver: number | null;
  creationEquipmentPurchases: string[];
  creationEquipmentBase: CreationEquipmentBase | null;
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
  | "languages"
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
  { id: "languages", label: "Languages" },
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
const artSelectionSeparator = "::";

/** Keeps same-named Arts from different traditions distinct in character state. */
export const artSelectionValue = (tradition: string, name: string) =>
  name === "A Thousand Tongues" ? `${tradition}${artSelectionSeparator}${name}` : name;

export const artSelectionName = (value: string) =>
  value.includes(artSelectionSeparator)
    ? value.slice(value.indexOf(artSelectionSeparator) + artSelectionSeparator.length)
    : value;

export type ArtChoiceDefinition = {
  count: number;
  label: string;
  itemLabel: string;
  help: string;
};

export const artChoiceKey = (selection: string) => artSelectionName(selection);

export function artChoiceDefinition(selection: string): ArtChoiceDefinition | null {
  switch (artSelectionName(selection)) {
    case "Favored Weapon":
      return {
        count: 1,
        label: "Favored weapon type",
        itemLabel: "Weapon type",
        help: "Choose one specific non-unarmed melee weapon type. Thrown weapons do not qualify.",
      };
    case "Style Weaponry":
      return {
        count: 3,
        label: "Style Weaponry classes",
        itemLabel: "Weapon class",
        help: "Choose three distinct general weapon classes, such as swords, bows, axes, or daggers.",
      };
    default:
      return null;
  }
}

const cleanArtChoiceArray = (value: unknown, maximum = 8) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 80))
        .slice(0, maximum)
    : [];

export function artChoiceValues(
  selection: string,
  choices: Record<string, string[]> | undefined,
): string[] {
  const definition = artChoiceDefinition(selection);
  if (!definition) return [];
  const existing = cleanArtChoiceArray(
    choices?.[artChoiceKey(selection)],
    definition.count,
  );
  return Array.from(
    { length: definition.count },
    (_, index) => existing[index] || "",
  );
}

export function artChoiceIsComplete(
  selection: string,
  choices: Record<string, string[]> | undefined,
) {
  const definition = artChoiceDefinition(selection);
  if (!definition) return true;
  const values = artChoiceValues(selection, choices);
  if (values.some((value) => !value)) return false;
  return (
    new Set(values.map((value) => value.toLocaleLowerCase())).size ===
    definition.count
  );
}

export function normalizeArtChoices(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, rawValues] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const key = artChoiceKey(rawKey.trim().slice(0, 80));
    if (!key) continue;
    const definition = artChoiceDefinition(key);
    const values = cleanArtChoiceArray(rawValues, definition?.count || 8);
    if (!values.some(Boolean)) continue;
    normalized[key] = definition
      ? Array.from(
          { length: definition.count },
          (_, index) => values[index] || "",
        )
      : values;
  }
  return normalized;
}

export function creationArtForSelection<Art extends { name: string; value: string }>(
  arts: readonly Art[],
  selection: string,
) {
  return (
    arts.find((art) => art.value === selection) ||
    // Pre-identity saved values remain readable. A mixed-tradition legacy
    // record is resolved to the prior display-order behavior rather than
    // silently overwriting a player choice.
    arts.find((art) => art.name === selection)
  );
}
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

const explicitlyCombatFoci = new Set([
  "Alert",
  "Armsmaster",
  "Assassin",
  "Close Combatant",
  "Deadeye",
  "Die Hard",
  "Impervious Defense",
  "Shocking Assault",
  "Sniper’s Eye",
  "Unarmed Combatant",
  "Valiant Defender",
  "Whirlwind Assault",
]);

const explicitlyNoncombatFoci = new Set([
  "Artisan",
  "Authority",
  "Connected",
  "Cultured",
  "Dealmaker",
  "Diplomatic Grace",
  "Gifted Chirurgeon",
  "Henchkeeper",
  "Impostor",
  "Polymath",
  "Specialist",
  "Well Met",
]);

/**
 * WWN deliberately leaves ambiguous Focus categorization to the GM. We only
 * classify the clear cases here; anything else can satisfy either class bonus.
 */
export function creationFocusClassCategory(
  pick: CreationFocusPick,
): "combat" | "noncombat" | "ambiguous" {
  if (explicitlyCombatFoci.has(pick.name)) return "combat";
  if (explicitlyNoncombatFoci.has(pick.name)) return "noncombat";
  const skill = creationFocusBonusSkill(pick);
  if ((creationCombatSkills as readonly string[]).includes(skill)) return "combat";
  if ((creationNoncombatSkills as readonly string[]).includes(skill)) return "noncombat";
  return "ambiguous";
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

/** Keeps the wizard's partial-class picker aligned with completion validation. */
export function creationPartialClassPairIsLegal(first: string, second: string) {
  if (!first || !second) return true;
  if (first === second) return false;
  const other = first === "Mageslayer" ? second : second === "Mageslayer" ? first : "";
  if (other && traditionKinds[other] === "mage") return false;
  const invokerOther = first === "Invoker" ? second : second === "Invoker" ? first : "";
  return !invokerOther || !traditionInfo[invokerOther as TraditionName]?.spells;
}

export function creationSkillGrants(
  state: Pick<
    LevelOneCreationCharacter,
    | "background"
    | "backgroundDevelopmentMethod"
    | "backgroundCombatSkill"
    | "backgroundQuickSkillReplacements"
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
      if (pick.advancement) return;
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
    | "backgroundQuickSkillReplacements"
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

type CreationSkillGrantState = Pick<
  LevelOneCreationCharacter,
  | "background"
  | "backgroundDevelopmentMethod"
  | "backgroundCombatSkill"
  | "backgroundQuickSkillReplacements"
  | "backgroundLearningPicks"
  | "backgroundDevelopmentRolls"
  | "classMode"
  | "classOne"
  | "classTwo"
  | "focusPicks"
  | "vowedEffortSkill"
  | "wiseConceptSkill"
>;

const withBackgroundGrantChoice = (
  state: CreationSkillGrantState,
  grantId: string,
  choice: string,
): CreationSkillGrantState => {
  if (grantId === "background-free")
    return { ...state, backgroundCombatSkill: choice };
  if (grantId.startsWith("quick-")) {
    const grant = creationSkillGrants(state).find((entry) => entry.id === grantId);
    if (grant && normalizedBackgroundSkillResult(grant.result) === "Any Combat")
      return { ...state, backgroundCombatSkill: choice };
    const index = Number(grantId.slice("quick-".length));
    return {
      ...state,
      backgroundQuickSkillReplacements: state.backgroundQuickSkillReplacements.map(
        (replacement, row) => (row === index ? choice : replacement),
      ),
    };
  }
  if (grantId.startsWith("learning-")) {
    const index = Number(grantId.slice("learning-".length));
    return {
      ...state,
      backgroundLearningPicks: state.backgroundLearningPicks.map((pick, row) =>
        row === index ? { ...pick, choice, replacement: "" } : pick,
      ),
    };
  }
  if (grantId.startsWith("roll-")) {
    const index = Number(grantId.slice("roll-".length));
    return {
      ...state,
      backgroundDevelopmentRolls: state.backgroundDevelopmentRolls.map((roll, row) =>
        row === index ? { ...roll, choice, replacement: "" } : roll,
      ),
    };
  }
  return state;
};

/**
 * Legal skill choices for an Any Combat or Any Skill grant at its exact place
 * in the authoritative creation acquisition order.  The UI consumes this
 * rather than duplicating level-1 cap calculations.
 */
export function creationBackgroundSkillChoiceOptions(
  state: CreationSkillGrantState,
  grantId: string,
) {
  const grant = creationSkillGrantResolutions(state).find(
    (entry) => entry.id === grantId,
  );
  if (!grant) return [];
  return choiceOptionsForBackgroundResult(grant.result).filter((choice) => {
    const candidate = creationSkillGrantResolutions(
      withBackgroundGrantChoice(state, grantId, choice),
    ).find((entry) => entry.id === grantId);
    return candidate?.rawSkill === choice
      && candidate.resolvedSkill === choice
      && !candidate.needsChoice
      && !candidate.needsReplacement;
  });
}

/** Returns a selected choice only while it remains legal in grant order. */
export function creationBackgroundSkillChoiceValue(
  state: CreationSkillGrantState,
  grantId: string,
) {
  const grant = creationSkillGrantResolutions(state).find(
    (entry) => entry.id === grantId,
  );
  if (!grant || grant.needsChoice || grant.needsReplacement) return "";
  const choice = grant.choice || grant.combatChoice || "";
  return creationBackgroundSkillChoiceOptions(state, grantId).some((option) => option === choice)
    ? choice
    : "";
}

export function creationSkillSources(
  state: Pick<
    LevelOneCreationCharacter,
    | "background"
    | "backgroundDevelopmentMethod"
    | "backgroundCombatSkill"
    | "backgroundQuickSkillReplacements"
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
  const beastmasterBond = state.beastmasterBond;
  const chosenFriend =
    selectedClasses.includes("Beastmaster") && beastmasterBond === "chosen-friend";
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
  const mageslayerGrantedFocus = selectedClasses.includes("Mageslayer") ? 1 : 0;
  const allowedFocusPicks =
    state.classOne && (state.classMode === "full" || state.classTwo)
      ? rules.focusPicks + mageslayerGrantedFocus
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
    )
      .filter(
        (art) =>
          !(
            chosenFriend &&
            tradition === "Beastmaster" &&
            (chosenFriendBenefitArts as readonly string[]).includes(art.name)
          ),
      )
      .map((art) => ({
        ...art,
        minLevel: "minLevel" in art ? art.minLevel : undefined,
        tradition,
        value: artSelectionValue(tradition, art.name),
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
  const forcedArts = artTraditions.flatMap((tradition) =>
    forcedArtsForTraditions([tradition]).map((name) =>
      artSelectionValue(tradition, name),
    ),
  );
  const requiredArtChoiceGroups = artTraditions.flatMap((tradition) =>
    startingArtChoiceGroupsForTraditions([tradition]).map((group) => ({
      ...group,
      options: group.options.map((name) => artSelectionValue(tradition, name)),
    })),
  );
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
    ...(castingTraditions.includes("High Mage") || castingTraditions.includes("Invoker") || addedTradition
      ? highMagic.map((spell) => ({ ...spell, tradition: "High Magic" }))
      : []),
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
  const knownLanguages = Array.isArray(state.languages)
    ? state.languages.filter((language): language is string => typeof language === "string" && Boolean(language.trim()))
    : [];
  const languageAllowance = startingLanguageAllowance(
    skillRanks.Know,
    skillRanks.Connect,
  );
  const ledger = creationSkills.flatMap((skill) =>
    sources[skill].map((source) => ({
      skill,
      source,
      rank: skillRanks[skill],
    })),
  );
  const issues: CreationIssue[] = [];
  if (state.level !== 1)
    issues.push({ step: "identity", message: "Guided Creation is available only for level-1 characters." });
  if (!state.name.trim())
    issues.push({ step: "identity", message: "Enter a character name." });
  if (!knownLanguages.includes("Common"))
    issues.push({
      step: "languages",
      message: "Choose Common as the starting lingua franca.",
    });
  if (new Set(knownLanguages).size !== knownLanguages.length)
    issues.push({
      step: "languages",
      message: "Each starting language can be selected only once.",
    });
  if (knownLanguages.length < 2)
    issues.push({
      step: "languages",
      message: "Choose a native tongue in addition to Common.",
    });
  if (knownLanguages.length > languageAllowance)
    issues.push({
      step: "languages",
      message: `This character can know only ${languageAllowance} starting languages from the current skill grants.`,
    });
  if (knownLanguages.some((language) => !(officialLanguages as readonly string[]).includes(language)))
    issues.push({
      step: "languages",
      message: "Choose starting languages from the standard language list.",
    });
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
  if (creationAttributes.some((attribute) => state.attributeBoosts[attribute] !== 0))
    issues.push({
      step: "attributes",
      message: "Level 1 characters cannot spend advancement points on attributes.",
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
    !creationPartialClassPairIsLegal(state.classOne, state.classTwo) &&
    selectedClasses.includes("Invoker")
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
    !(creationSkills as readonly string[]).includes(state.wiseConceptSkill)
  )
    issues.push({ step: "class", message: "Choose the Wise concept skill." });
  if (
    selectedClasses.includes("Beastmaster") &&
    !(beastmasterBondOptions as readonly BeastmasterBond[]).includes(state.beastmasterBond)
  )
    issues.push({
      step: "magic",
      message: "Choose whether this Beastmaster uses normal Bind Companion or a Chosen Friend bond.",
    });
  if (focusPicksUsed !== allowedFocusPicks)
    issues.push({
      step: "foci",
      message: `Choose ${allowedFocusPicks} starting Focus pick${allowedFocusPicks === 1 ? "" : "s"}.`,
    });

  if (selectedClasses.includes("Mageslayer") && !focusPicks.some((pick) => pick.name === "Nullifier"))
    issues.push({
      step: "foci",
      message: "Antimage grants one level of the Nullifier Focus at first level.",
    });

  const classFocusCandidates = focusPicks.filter(
    (pick) => !(selectedClasses.includes("Mageslayer") && pick.name === "Nullifier"),
  );
  const needsWarriorFocus = selectedClasses.includes("Warrior");
  const needsExpertFocus = selectedClasses.includes("Expert");
  const canBeCombat = (pick: CreationFocusPick) =>
    creationFocusClassCategory(pick) !== "noncombat";
  const canBeNoncombat = (pick: CreationFocusPick) =>
    creationFocusClassCategory(pick) !== "combat";
  if (needsWarriorFocus && needsExpertFocus) {
    const distinctClassFoci = classFocusCandidates.some((combatPick, combatIndex) =>
      canBeCombat(combatPick) &&
      classFocusCandidates.some(
        (expertPick, expertIndex) => expertIndex !== combatIndex && canBeNoncombat(expertPick),
      ),
    );
    if (!distinctClassFoci)
      issues.push({
        step: "foci",
        message: "Partial Warrior / Partial Expert needs one combat-related Focus and one non-combat-related Focus, in addition to the free Focus.",
      });
  } else {
    if (needsWarriorFocus && !classFocusCandidates.some(canBeCombat))
      issues.push({
        step: "foci",
        message: "Warrior requires one combat-related starting Focus in addition to the free Focus.",
      });
    if (needsExpertFocus && !classFocusCandidates.some(canBeNoncombat))
      issues.push({
        step: "foci",
        message: "Expert requires one non-combat-related starting Focus in addition to the free Focus.",
      });
  }

  state.focusPicks.forEach((pick, index) => {
    if (pick.name && pick.level !== 1)
      issues.push({
        step: "foci",
        message: "Level 1 characters can take only level-1 Focus benefits.",
      });
    if (pick.name && !focusEligibility(pick.name, index).eligible)
      issues.push({
        step: "foci",
        message: `${pick.name}: ${focusEligibility(pick.name, index).reason}`,
      });
    const choiceLabel = creationFocusChoiceLabel(pick.name);
    const choiceOptions = creationFocusChoiceOptions(pick.name);
    if (pick.name && choiceLabel && !pick.choice)
      issues.push({
        step: "foci",
        message: `${pick.name} needs ${choiceLabel.toLowerCase()}.`,
      });
    if (pick.name && pick.choice && choiceOptions.length && !choiceOptions.includes(pick.choice))
      issues.push({
        step: "foci",
        message: `${pick.name} needs a legal ${choiceLabel.toLowerCase()}.`,
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
  selectedArts.forEach((selection) => {
    const definition = artChoiceDefinition(selection);
    if (definition && !artChoiceIsComplete(selection, state.artChoices))
      issues.push({
        step: "magic",
        message: `Complete ${artSelectionName(selection)}: ${definition.help}`,
      });
  });
  forcedArts.forEach((name) => {
    if (!selectedArts.some((selection) => creationArtForSelection(availableArts, selection)?.value === name))
      issues.push({
        step: "magic",
        message: `${artSelectionName(name)} is a required starting Art for the selected tradition.`,
      });
  });
  requiredArtChoiceGroups.forEach((group) => {
    const selectedCount = selectedArts.filter((selection) =>
      group.options.includes(creationArtForSelection(availableArts, selection)?.value || ""),
    ).length;
    if (selectedCount !== group.count)
      issues.push({
        step: "magic",
        message: `Choose exactly one of ${group.options.map(artSelectionName).join(" or ")} as the required starting ${group.tradition} Art.`,
      });
  });
  selectedArts.forEach((name, index) => {
    const art = creationArtForSelection(availableArts, name);
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
      artSelectionName(name) === "Deep Apprehension" &&
      !selectedArts.some((selection) => artSelectionName(selection) === "Surface Apprehension")
    )
      issues.push({
        step: "magic",
        message: "Deep Apprehension requires Surface Apprehension.",
      });
    if (
      artSelectionName(name) !== "Skilled" &&
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
  const legacyEquipmentChoice =
    !state.creationEquipmentMethod &&
    (state.readied.some((item) => item.trim()) ||
      state.stowed.some((item) => item.trim()) ||
      Boolean(state.armor || state.shield || state.sp || state.cp));
  if (!creationEquipmentChoiceIsComplete(state) && !legacyEquipmentChoice)
    issues.push({
      step: "equipment",
      message: "Choose a starting equipment package or roll starting silver.",
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
    forcedArts,
    requiredArtChoiceGroups,
    availableSpells,
    knownSpellAllowance,
    languageAllowance,
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

/**
 * The wizard's visible skill ranks are derived from stored purchases plus
 * ordered grants.  Offer only ranks that remain legal after that resolution.
 */
export function creationSkillRankCanBeSelected(
  state: LevelOneCreationCharacter,
  skill: string,
  rank: number,
) {
  if (!creationSkills.includes(skill as (typeof creationSkills)[number])) return false;
  const current = levelOneCreationStatus(state);
  const sourceCount = current.sources[skill].length;
  const minimum = Math.min(1, Math.max(-1, sourceCount - 1));
  if (rank < minimum || rank > 1) return false;
  const skillPurchases = {
    ...state.skillPurchases,
    [skill]: Math.max(-1, Math.min(1, rank - sourceCount)),
  };
  const candidate = levelOneCreationStatus({ ...state, skillPurchases });
  return candidate.freeSkillPlan.spending === 0 && candidate.skillRanks[skill] <= 1;
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
