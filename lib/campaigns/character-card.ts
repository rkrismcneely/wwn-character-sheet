import {
  backgroundAttributeBonuses,
  type BackgroundDevelopmentMethod,
  type BackgroundDevelopmentRoll,
} from "../../app/background-development.ts";
import { casterLimits, dualCasterLimits, invokerLimits, traditionKinds, traditionInfo, traditionSpells, type TraditionName } from "../../app/class-data.ts";
import { highMagic } from "../../app/wwn-data.ts";

export type CampaignCharacterCardData = {
  level?: number;
  classMode?: "full" | "adventurer";
  classOne?: string;
  classTwo?: string;
  attrs?: Partial<Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", number>>;
  background?: string;
  backgroundDevelopmentMethod?: BackgroundDevelopmentMethod;
  backgroundDevelopmentRolls?: BackgroundDevelopmentRoll[];
  armor?: string;
  shield?: string;
  armorBonus?: number;
  hpCurrent?: number;
  hpMax?: number;
  hpRolls?: number[];
  focusPicks?: Array<{ name?: string; choice?: string }>;
  artPicks?: string[];
  artEffort?: boolean[];
  spellPicks?: Array<{ name?: string; prepared?: boolean; cast?: boolean; casts?: number }>;
  strainCurrent?: number;
  strainMax?: number;
};

export type CampaignCharacterStatus = {
  id: string;
  name: string;
  level: number;
  classLabel: string;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
};

const ARMOR_AC: Record<string, number> = {
  "No Armor": 10,
  "War Shirt": 11,
  "Buff Coat": 12,
  Linothorax: 13,
  "War Robe": 14,
  "Pieced Armor": 14,
  "Mail Shirt": 14,
  "Cuirass and Greaves": 15,
  "Scaled Armor": 16,
  "Mail Hauberk": 16,
  "Plate Armor": 17,
  "Great Armor": 19,
  "Grand Plate": 16,
};

function modifier(score: unknown): number {
  const value = Number(score);
  if (!Number.isFinite(value)) return 0;
  if (value <= 3) return -2;
  if (value <= 7) return -1;
  if (value <= 13) return 0;
  if (value <= 17) return 1;
  return 2;
}

function selectedClasses(data: CampaignCharacterCardData): string[] {
  return (data.classMode === "full"
    ? [data.classOne]
    : [data.classOne, data.classTwo]
  ).filter((value): value is string => Boolean(value));
}

function effectiveLevel(data: CampaignCharacterCardData): number {
  return Math.min(10, Math.max(1, Number(data.level) || 1));
}

function selectedFocusPicks(data: CampaignCharacterCardData) {
  return (data.focusPicks || []).filter(pick => Boolean(pick.name));
}

type Attribute = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

function attributeModifier(data: CampaignCharacterCardData, attribute: Attribute): number {
  const growth = data.background && data.backgroundDevelopmentMethod && data.backgroundDevelopmentRolls
    ? backgroundAttributeBonuses(
      data.background,
      data.backgroundDevelopmentMethod,
      data.backgroundDevelopmentRolls,
      data.attrs || {},
    )
    : { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
  const score = Math.min(18, Math.max(0, Number(data.attrs?.[attribute]) || 0) + Number(growth[attribute] || 0));
  let value = modifier(score);
  const focusPicks = selectedFocusPicks(data);
  const developedAttributes = focusPicks
    .filter(pick => pick.name === "Developed Attribute")
    .map(pick => pick.choice)
    .filter(choice => choice === attribute);
  if (developedAttributes.length) value = Math.min(3, value + 1);
  const xenobloodedGravity = focusPicks.find(pick => pick.name === "Xenoblooded")?.choice || "";
  if (xenobloodedGravity === "STR +1 / DEX -1") value += attribute === "STR" ? 1 : attribute === "DEX" ? -1 : 0;
  if (xenobloodedGravity === "DEX +1 / STR -1") value += attribute === "DEX" ? 1 : attribute === "STR" ? -1 : 0;
  return Math.min(3, value);
}

export function campaignCardClassLabel(data: CampaignCharacterCardData, fallback: string): string {
  const classes = selectedClasses(data);
  if (!classes.length) return fallback;
  return data.classMode === "adventurer"
    ? classes[0] + (classes[1] ? " / " + classes[1] : "") + " Adventurer"
    : classes[0];
}

export function campaignCardArmorClass(data: CampaignCharacterCardData): number {
  const armorBase = ARMOR_AC[data.armor || "No Armor"] ?? ARMOR_AC["No Armor"];
  const shieldBase = data.shield === "Small Shield" ? 13 : data.shield === "Large Shield" ? 14 : 0;
  const shieldAdjustedBase = shieldBase
    ? (armorBase >= shieldBase ? armorBase + 1 : shieldBase)
    : armorBase;
  const focusPicks = selectedFocusPicks(data);
  const classes = selectedClasses(data);
  const level = effectiveLevel(data);
  const imperviousDefense = focusPicks.some(pick => pick.name === "Impervious Defense");
  const naturalArmorBase = imperviousDefense ? 15 + Math.ceil(level / 2) : 0;
  const bestArmorBase = Math.max(shieldAdjustedBase, naturalArmorBase + (data.shield ? 1 : 0));
  const vowedArmorBase = classes.includes("Vowed") && (data.armor || "No Armor") === "No Armor" && !data.shield
    ? 13 + Math.floor(level / 2)
    : 0;
  const coldFleshArmorBase = (data.artPicks || []).includes("Cold Flesh") ? 12 + Math.floor(level / 2) : 0;
  const pavisIndex = (data.artPicks || []).indexOf("Pavis of Elements");
  const pavisActive = pavisIndex >= 0 && Boolean(data.artEffort?.[pavisIndex]);
  const defensiveBase = Math.max(
    bestArmorBase,
    vowedArmorBase,
    coldFleshArmorBase + (data.shield ? 1 : 0),
  );
  const calculatedAcBeforePavis = defensiveBase + attributeModifier(data, "DEX") + Number(data.armorBonus || 0);
  return pavisActive ? Math.min(18, calculatedAcBeforePavis + 4) : calculatedAcBeforePavis;
}

export function campaignCardHpMax(data: CampaignCharacterCardData): number {
  const level = effectiveLevel(data);
  const rolls = Array.isArray(data.hpRolls) ? data.hpRolls.slice(0, level) : [];
  const classes = selectedClasses(data);
  const classBonus = classes.includes("Warrior") && !classes.includes("Duelist")
    ? 2
    : classes.includes("Expert") || classes.includes("Vowed") ? 0 : -1;
  const hasDieHard = selectedFocusPicks(data).some(pick => pick.name === "Die Hard");
  let calculatedHp = 0;
  let complete = Boolean(data.level) && rolls.length >= level;
  for (let index = 0; index < level; index += 1) {
    const rawRoll = Number(rolls[index]);
    if (!rawRoll) {
      complete = false;
      break;
    }
    const dice = index + 1;
    const perDieModifier = attributeModifier(data, "CON") + classBonus + (hasDieHard ? 2 : 0);
    const rolledTotal = Math.max(dice, rawRoll + perDieModifier * dice);
    calculatedHp = index === 0 ? rolledTotal : Math.max(calculatedHp + 1, rolledTotal);
  }
  return complete ? calculatedHp : Math.max(0, Number(data.hpMax) || 0);
}

/** The small, campaign-safe vitals projection used by cards and live sessions. */
export function campaignCharacterStatus(
  data: CampaignCharacterCardData,
  fallback: { id: string; name: string; level: number; classLabel: string },
): CampaignCharacterStatus {
  const withStoredLevel = { ...data, level: Number(data.level) || fallback.level };
  return {
    id: fallback.id,
    name: fallback.name,
    level: Number(withStoredLevel.level) || 1,
    classLabel: campaignCardClassLabel(withStoredLevel, fallback.classLabel),
    hpCurrent: Math.max(0, Number(withStoredLevel.hpCurrent) || 0),
    hpMax: campaignCardHpMax(withStoredLevel),
    armorClass: campaignCardArmorClass(withStoredLevel),
  };
}

export type CampaignGmPartyStatus = CampaignCharacterStatus & {
  player: string;
  systemStrain: { current: number; max: number };
  saves: { physical: number; evasion: number; mental: number; luck: number };
  spellUsage: { label: string; used: number; max: number } | null;
  effortCommitted: number | null;
};

/** Owner-only GM projection. All values are derived from the current character snapshot. */
export function campaignGmPartyStatus(
  data: CampaignCharacterCardData,
  fallback: { id: string; name: string; player: string; level: number; classLabel: string },
): CampaignGmPartyStatus {
  const withStoredLevel = { ...data, level: Number(data.level) || fallback.level };
  const level = effectiveLevel(withStoredLevel);
  const classes = selectedClasses(withStoredLevel);
  const magicalTraditions = classes.filter((name): name is TraditionName => name in traditionInfo && traditionKinds[name] === "mage");
  const castingTraditions = magicalTraditions.filter(name => traditionInfo[name]?.spells);
  const isInvoker = castingTraditions.includes("Invoker");
  const spellLevels = new Map<string, number>([
    ...highMagic.map(spell => [spell.name, spell.level] as const),
    ...traditionSpells.Elementalist.map(spell => [spell.name, spell.level] as const),
    ...traditionSpells.Necromancer.map(spell => [spell.name, spell.level] as const),
  ]);
  const limits = isInvoker && castingTraditions.length === 1
    ? invokerLimits(level, withStoredLevel.classMode === "adventurer", attributeModifier(withStoredLevel, "INT"))
    : castingTraditions.length > 1
      ? dualCasterLimits(level)
      : castingTraditions.length ? casterLimits(level, withStoredLevel.classMode === "adventurer") : null;
  const picks = withStoredLevel.spellPicks || [];
  const spellUsage = limits && castingTraditions.length ? {
    label: isInvoker ? "Spell points" : "Cast today",
    used: isInvoker
      ? picks.reduce((total, pick) => total + (pick.name && pick.prepared ? (Number(pick.casts) || 0) * (spellLevels.get(pick.name) || 0) : 0), 0)
      : picks.filter(pick => pick.name && pick.cast).length,
    max: limits.casts,
  } : null;
  const status = campaignCharacterStatus(withStoredLevel, fallback);
  return {
    ...status,
    player: fallback.player,
    systemStrain: {
      current: Math.max(0, Number(withStoredLevel.strainCurrent) || 0),
      max: Math.max(0, Number(withStoredLevel.strainMax) || 0),
    },
    saves: {
      physical: 16 - level - Math.max(attributeModifier(withStoredLevel, "STR"), attributeModifier(withStoredLevel, "CON")),
      evasion: 16 - level - Math.max(attributeModifier(withStoredLevel, "DEX"), attributeModifier(withStoredLevel, "INT")),
      mental: 16 - level - Math.max(attributeModifier(withStoredLevel, "WIS"), attributeModifier(withStoredLevel, "CHA")),
      luck: 16 - level,
    },
    spellUsage,
    effortCommitted: magicalTraditions.some(tradition => traditionInfo[tradition]?.usesEffort !== false)
      ? (withStoredLevel.artEffort || []).filter(Boolean).length
      : null,
  };
}
