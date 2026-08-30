/**
 * Canonical, non-mutating rules for a single WWN character advancement.
 * The Level-Up Wizard consumes this module; it deliberately reuses the
 * application's class and Focus catalogs instead of carrying a second table.
 */

import { artSlots, classRules, knownSpellSlots, traditionInfo, traditionKinds, type TraditionName } from "./class-data.ts";
import { creationFocusBonusSkill, creationSkills } from "./character-creation.ts";
import { armorRestrictsMagic, focusIsRepeatable } from "./phase2-rules.ts";
import { foci } from "./wwn-data.ts";

export type AdvancementFocusPick = {
  name: string;
  level: number;
  choice?: string;
  advancement?: boolean;
};

export type AdvancementCharacter = {
  level: number;
  classMode: "full" | "adventurer";
  classOne: string;
  classTwo: string;
  attrs: Record<string, number>;
  attributeBoosts: Record<string, number>;
  focusPicks: AdvancementFocusPick[];
  artPicks: string[];
  spellPicks: { name: string }[];
  skillPurchases: Record<string, number>;
};

export const advancementLevels = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const skillRankCapAtLevel = (level: number) =>
  level >= 9 ? 4 : level >= 6 ? 3 : level >= 3 ? 2 : 1;
export const attributeBoostLimitAtLevel = (level: number) =>
  level >= 9 ? 5 : level >= 6 ? 4 : level >= 3 ? 3 : 2;
export const skillRankCostAtLevel = (rank: number) =>
  rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];

const selectedClasses = (character: AdvancementCharacter) =>
  (character.classMode === "adventurer"
    ? [character.classOne, character.classTwo]
    : [character.classOne]
  ).filter(Boolean);

const traditionsFor = (character: AdvancementCharacter) =>
  selectedClasses(character).filter((name): name is TraditionName => name in traditionInfo);

export function advancementSkillCreditBySkill(character: Pick<AdvancementCharacter, "focusPicks">) {
  return character.focusPicks.reduce<Record<string, number>>((credits, pick) => {
    if (!pick.advancement) return credits;
    const skill = creationFocusBonusSkill(pick);
    if (skill) credits[skill] = (credits[skill] || 0) + 3;
    return credits;
  }, {});
}

export function advancementPlan(character: AdvancementCharacter) {
  const from = Math.max(1, Math.min(10, Number(character.level) || 1));
  const to = Math.min(10, from + 1);
  const classes = selectedClasses(character);
  const traditions = traditionsFor(character);
  const castingTraditions = traditions.filter((tradition) => traditionInfo[tradition].spells);
  const currentRules = classRules(character.classMode, character.classOne, character.classTwo, from);
  const nextRules = classRules(character.classMode, character.classOne, character.classTwo, to);
  const currentArts = traditions.reduce((total, tradition) =>
    total + artSlots(tradition, from, character.classMode === "adventurer"), 0);
  const nextArts = traditions.reduce((total, tradition) =>
    total + artSlots(tradition, to, character.classMode === "adventurer"), 0);
  const currentSpells = knownSpellSlots(castingTraditions, from, character.classMode === "adventurer");
  const nextSpells = knownSpellSlots(castingTraditions, to, character.classMode === "adventurer");
  const gainsFocus = [2, 5, 7, 10].includes(to);
  const expert = classes.includes("Expert");
  return {
    from,
    to,
    canAdvance: from < 10 && Boolean(character.classOne),
    classes,
    traditions,
    castingTraditions,
    skillPoints: 3 + (expert ? 1 : 0),
    quickLearner: expert,
    gainsFocus,
    artPicks: Math.max(0, nextArts - currentArts),
    spellPicks: Math.max(0, nextSpells - currentSpells),
    attackBefore: currentRules.attack,
    attackAfter: nextRules.attack,
    focusAllowanceBefore: currentRules.focusPicks,
    focusAllowanceAfter: nextRules.focusPicks,
    skillCap: skillRankCapAtLevel(to),
    attributeBoostLimit: attributeBoostLimitAtLevel(to),
    automatic: [
      `Saving throws improve by 1.`,
      currentRules.attack !== nextRules.attack
        ? `Base attack bonus improves from +${currentRules.attack} to +${nextRules.attack}.`
        : "Base attack bonus is unchanged at this level.",
      traditions.length ? "Spell limits, prepared spells, and Effort remain derived from the shared class tables." : "",
    ].filter(Boolean),
  };
}

export function legalAdvancementFocuses(character: AdvancementCharacter) {
  const plan = advancementPlan(character);
  const classes = plan.classes;
  const mage = classes.some((name) => traditionKinds[name] === "mage");
  const armorRestricted = plan.traditions.some((tradition) => armorRestrictsMagic(traditionInfo[tradition].armor));
  const hasNegativeAttribute = Object.values(character.attrs).some((score) => score <= 7);
  return foci.filter((focus) => {
    const same = character.focusPicks.find((pick) => pick.name === focus.name);
    if (same && same.level >= 2) return false;
    if (same && !focus.level2) return false;
    if (same) return true;
    if (!focusIsRepeatable(focus.name) && character.focusPicks.some((pick) => pick.name === focus.name)) return false;
    if (focus.name === "Developed Attribute" && mage) return false;
    if (focus.name === "Armored Magic" && !armorRestricted) return false;
    if (focus.name === "Lucky" && !hasNegativeAttribute) return false;
    if (focus.name === "Nullifier" && mage) return false;
    if (focus.name === "Polymath" && !classes.includes("Expert")) return false;
    if (focus.name === "Traditional Education" && !classes.includes("Invoker")) return false;
    return true;
  });
}

export function levelUpHitPointTotal(
  previousMaximum: number,
  rollTotal: number,
  level: number,
  constitutionModifier: number,
  classPerDieBonus: number,
  dieHard: boolean,
) {
  const raw = Math.max(level, rollTotal + level * (constitutionModifier + classPerDieBonus + (dieHard ? 2 : 0)));
  return Math.max(previousMaximum + 1, raw);
}

export function advancementClassPerDieBonus(character: AdvancementCharacter) {
  const classes = selectedClasses(character);
  return classes.includes("Warrior") && !classes.includes("Duelist") ? 2
    : classes.includes("Expert") || classes.includes("Vowed") ? 0 : -1;
}

export function advancementFocusSkillCreditsDescription(character: AdvancementCharacter) {
  return Object.entries(advancementSkillCreditBySkill(character))
    .map(([skill, credit]) => `${skill}: ${credit} Focus skill-point credit`)
    .join("; ");
}

export { creationSkills };
