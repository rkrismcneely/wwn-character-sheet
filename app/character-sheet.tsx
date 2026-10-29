"use client";

/* eslint-disable @next/next/no-img-element -- portraits can be local blobs or user-uploaded URLs */

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { viewportTooltipPosition } from "./tooltip-position";
import { foci, highMageArts, highMagic, weapons } from "./wwn-data";
import { artSlots, casterLimits, classRules, dualCasterLimits, forcedArtsForTraditions, fullClasses, hitPointClassBonus, invokerLimits, knownSpellSlots, partialClasses, traditionInfo, traditionKinds, traditionSpells, vowedProgression, type TraditionName } from "./class-data";
import { backgroundNames, backgrounds } from "./background-data";
import {
  activeBackgroundDevelopmentEntries,
  backgroundAttributeBonuses,
  backgroundAttributeChoices,
  backgroundAttributePointCount,
  backgroundDevelopmentRollFromDie,
  backgroundTableDieSides,
  blankBackgroundDevelopmentRoll,
  blankBackgroundDevelopmentRolls,
  blankBackgroundLearningPicks,
  blankBackgroundQuickSkillReplacements,
  normalizeBackgroundDevelopment,
  resolveBackgroundSkillGrants,
  resolvedBackgroundRollResult,
  rollBackgroundTable,
  type BackgroundDevelopmentLegacy,
  type BackgroundDevelopmentMethod,
  type BackgroundDevelopmentRoll,
  type BackgroundLearningPick,
} from "./background-development";
import { RulesAssistant } from "./rules-assistant";
import { clearRollHistory, persistRollHistory, prependRollHistory, readRollHistory } from "./roll-history";
import { RollHistoryPanel, RollResultTray } from "./roll-presentation";
import { formatShockMinimumReminder, isSharedRollCategory, unarmedMissDamageBonus, parseDamageExpression, parseShockMinimum, resolveRoll, type RollRequest, type RollResult } from "./rolls";
import { rollDice, type DiceRoll } from "./dice";
import { useDisplayTheme } from "./theme-provider";
import { useDiceStylePreference, useVirtualDicePreference } from "./virtual-dice-preference";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "./virtual-dice-overlay";
import { CharacterLiveSessionPanel } from "./character-live-session-panel";
import { GuidedCreationWizard } from "./character-creation-wizard";
import { LevelUpWizard } from "./level-up-wizard";
import { guidedCreationModeFromUrl, levelUpModeFromUrl, withGuidedCreationMode, withLevelUpMode } from "./guided-creation-route";
import { advancementSkillCreditBySkill, attributeImprovementCostForCount, attributeImprovementCostForNext } from "./level-advancement";
import { normalizeLanguages, officialLanguages, startingLanguageAllowance } from "./language-data";
import { plainLanguageSummary as sharedPlainLanguageSummary } from "./plain-language";
import {
  adventuringGear as adventuringGearData,
  armors,
  gearBundles as gearBundleData,
  inventoryArmors,
  inventoryWeapons,
  shields as shieldData,
} from "./equipment-data";
import {
  normalizeCreationEquipmentFields,
  type CreationEquipmentBase,
  type CreationEquipmentMethod,
} from "./creation-equipment";
import {
  creationBackgroundSkillChoiceOptions,
  creationBackgroundSkillChoiceValue,
  artSelectionName,
  artSelectionValue,
  artChoiceDefinition,
  artChoiceKey,
  artChoiceValues,
  normalizeArtChoices,
  creationArtForSelection,
  creationFocusBonusSkill,
  creationFocusChoiceOptions,
  creationPartialClassPairIsLegal,
  creationSkillGrantResolutions,
  creationSkillGrants,
  creationSkillSources,
  levelOneCreationStatus,
} from "./character-creation";
import { armorRestrictsMagic, rangedAttackInMeleePenalty, hasNegativeEffectiveAttributeModifier, artEffortCommitmentCount, artEffortRestRecovers, artEffortTotal, reconcileArtEffortBySlot, deriveSkillProfile, deriveUnarmedAttack, effortMaximum, explicitFocusSkillChoices, focusIsRepeatable, focusSelectionCost, focusTargetAvailable, inferFocusAdvancementFlags, missingArtPrerequisite, reconcileSpiritFamiliarHitPoints, spiritFamiliarBenefitLimit, spiritFamiliarLevelTwoSelectionLimit, spiritFamiliarMaximumHitPoints, storedRankForDisplayedSkillRank } from "./phase2-rules";
import {
  applyShieldToArmorBase,
  beastmasterArtAvailableForBond,
  beastmasterCatalogCreature,
  beastmasterCatalogCreatures,
  beastmasterCompanionRules,
  chosenFriendBenefitArts,
  feralToughnessBaseArmorClass,
  beastmasterAttackName,
  extractBeastmasterDamageExpression,
  formatBeastmasterHitBonus,
  formatBeastmasterHitDice,
  parseBeastmasterHitDice,
} from "./beastmaster-companion";
import { authClient } from "@/lib/auth-client";
import { SignedInHeader, TalesBrandLink } from "./app-header";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";
import type { CharacterVisibility } from "@/lib/characters/authorization";
import { campaignInventoryArmor, campaignInventoryKindLabel, campaignInventorySnapshot, campaignInventoryValue, campaignInventoryWeapon, inventoryItemDescription, inventoryItemDisplayName } from "@/lib/inventory/items";
import { CampaignInventoryOptions, StoredItemsSection, useCampaignInventoryItems } from "./inventory-stored-items";
import { customInventoryItemNames } from "./custom-inventory";
import { canRecordSpellCast, spellCastCost, spellCastCount, spellCastingUse } from "./spell-casting";

type Tab = "core" | "magic" | "inventory" | "notes" | `companion:${string}`;
type AttributeMethod = "rolled" | "array";
type AttributeName = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
type FocusPick = { name: string; level: number; choice?: string; advancement?: boolean; redirectSkill?: string };
type WeaponPick = { name: string; skill: number };
type SpellPick = { name: string; prepared: boolean; cast: boolean; casts?: number };
type CompanionKind = "henchman" | "familiar" | "beastmaster";
type InventoryOwner = { kind: "pc" } | { kind: "companion"; id: string };
type Companion = {
  id: string;
  kind: CompanionKind;
  /** Whether this record currently represents a creature bound with Bind Companion. */
  bound: boolean;
  name: string;
  /** Optional selected Bestiary profile; custom companions leave this blank. */
  bestiaryId?: string;
  archetype: string;
  description: string;
  hitDice: string;
  hpRolled: number;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  move: string;
  attackBonus: string;
  damage: string;
  physicalSave: number;
  evasionSave: number;
  mentalSave: number;
  luckSave: number;
  morale: string;
  instinct: string;
  skillBonus: string;
  strength: number;
  readied: string[];
  stowed: string[];
  familiarBenefits: string[];
  familiarBackground?: string;
  familiarAdditionalShape?: string;
  /** The primary Spirit Familiar Focus row that owns this companion. */
  focusSlot?: number;
  summoned?: boolean;
  effortRefreshUsed?: boolean;
  notes: string;
};
type LibraryCharacter = {
  id: string; name: string; player: string; classLabel: string; level: number;
  visibility: CharacterVisibility; version: number; createdAt: string; updatedAt: string;
  ownerState?: "mine" | "other" | "unowned";
  permissions: { canEdit: boolean; adminReadOnly: boolean };
};
type LibraryScope = "mine" | "public" | "all";

const spiritFamiliarBenefits = [
  "Hit points equal three times your level",
  "Attack at half your level for 1d8 damage",
  "+1 skill bonus for one background",
  "One additional shape",
  "Hover or fly at normal speed",
  "Speak any language you know",
] as const;
const spiritFamiliarTripleHpBenefit = spiritFamiliarBenefits[0];
const spiritFamiliarAttackBenefit = spiritFamiliarBenefits[1];
const spiritFamiliarSkillBenefit = spiritFamiliarBenefits[2];
const spiritFamiliarShapeBenefit = spiritFamiliarBenefits[3];
const spiritFamiliarFlightBenefit = spiritFamiliarBenefits[4];

const skills = ["Administer","Connect","Convince","Craft","Exert","Heal","Know","Lead","Magic","Notice","Perform","Pray","Punch","Ride","Sail","Shoot","Sneak","Stab","Survive","Trade","Work"];
const combatSkills = ["Punch", "Shoot", "Stab"] as const;
const noncombatSkills = skills.filter(skill => !combatSkills.includes(skill as typeof combatSkills[number]));
const skillOverviews: Record<string, string> = {
  Administer: "Manage organizations, records, logistics, laws, and bureaucratic procedures.",
  Connect: "Find useful people, local contacts, rumors, favors, and social networks.",
  Convince: "Persuade, negotiate with, deceive, or influence other people.",
  Craft: "Make, repair, modify, or evaluate physical objects and equipment.",
  Exert: "Perform demanding physical feats such as climbing, swimming, running, or lifting.",
  Heal: "Diagnose injuries or illness, provide medical care, and stabilize the wounded.",
  Know: "Recall academic, historical, scientific, cultural, or other learned information.",
  Lead: "Command, inspire, organize, and maintain the morale of a group.",
  Magic: "Understand magical theory, identify sorcery, and perform tradition-related magical tasks.",
  Notice: "Spot hidden details, sense danger, search areas, and read suspicious situations.",
  Perform: "Entertain or impress an audience through music, acting, storytelling, or another art.",
  Pray: "Understand religions, rites, divine matters, and the practical duties of clergy.",
  Punch: "Fight effectively with unarmed attacks or unarmed combat techniques.",
  Ride: "Handle, ride, and care for mounts or other riding beasts.",
  Sail: "Operate, navigate, repair, and work aboard ships or other watercraft.",
  Shoot: "Attack accurately with bows, crossbows, guns, or other ranged weapons.",
  Sneak: "Move quietly, hide, bypass security, and perform covert or criminal tasks.",
  Stab: "Fight effectively with melee weapons.",
  Survive: "Track, navigate, forage, and endure hazards in the wilderness.",
  Trade: "Appraise goods, bargain, understand markets, and conduct commerce.",
  Work: "Carry out a chosen profession, trade, or practical field of labor.",
};
const attributes = ["STR","DEX","CON","INT","WIS","CHA"] as const;
const scoreOptions = Array.from({length: 16}, (_, i) => i + 3);
const standardAttributeArray = [14, 12, 11, 10, 9, 7] as const;
const initialSkillRanks = Object.fromEntries(skills.map(s => [s,
  s === "Know" ? 1 : ["Magic","Convince","Heal","Perform","Shoot","Sneak"].includes(s) ? 0 : -1
])) as Record<string, number>;
// Existing Cecil data predates distinct purchased/granted values. These
// purchased ranks preserve its previous displayed skills once background and
// class grants are derived separately.
const initialPurchasedSkillRanks: Record<string, number> = {
  ...initialSkillRanks,
  Administer: -1,
  Heal: -1,
  Know: 0,
  Magic: -1,
};
const shields = shieldData.map((shield) => shield.name);
const adventuringGear = adventuringGearData.map((item) => item.name);
const gearBundles = gearBundleData.map((item) => item.name);
type CompanionAttributes = Record<typeof attributes[number], number>;
type NpcArchetype = {
  name: string; base: CompanionAttributes; bonus: keyof CompanionAttributes; penalty: keyof CompanionAttributes;
  skills: string; strengths: string; weaknesses: string;
};
const companionAttributes = (archetype: NpcArchetype): CompanionAttributes => {
  return { ...archetype.base };
};
const companionAttributeModifier = (archetype: NpcArchetype, attribute: keyof CompanionAttributes) =>
  mod(archetype.base[attribute])
  + (attribute === archetype.bonus ? 1 : 0)
  - (attribute === archetype.penalty ? 1 : 0);
// Each profession keeps its own ordinary, varied NPC spread. The listed
// modifiers are applied on top; they are deliberately not a replacement array.
const npcArchetypes: readonly NpcArchetype[] = [
  { name: "Athlete", base: { STR: 13, DEX: 12, CON: 11, INT: 8, WIS: 9, CHA: 10 }, bonus: "STR", penalty: "INT", skills: "Exert +1 for athletic feats", strengths: "Running, climbing, swimming, lifting, and sustained exertion.", weaknesses: "Academic knowledge and delicate technical work." },
  { name: "Blacksmith", base: { STR: 13, DEX: 9, CON: 12, INT: 10, WIS: 11, CHA: 8 }, bonus: "STR", penalty: "CHA", skills: "Craft +1 for metalwork and tools", strengths: "Forging, repair, tools, and physical work.", weaknesses: "Courtly social work and subtle persuasion." },
  { name: "Guard", base: { STR: 13, DEX: 10, CON: 12, INT: 9, WIS: 12, CHA: 10 }, bonus: "STR", penalty: "WIS", skills: "Notice +1 on watch", strengths: "Discipline, patrols, arms, and physical security.", weaknesses: "Independent judgment and scholarly work." },
  { name: "Courier", base: { STR: 10, DEX: 13, CON: 10, INT: 11, WIS: 10, CHA: 9 }, bonus: "DEX", penalty: "STR", skills: "Exert +1 for travel and pursuit", strengths: "Speed, routes, balance, and endurance.", weaknesses: "Heavy lifting and brute force." },
  { name: "Thief", base: { STR: 9, DEX: 13, CON: 10, INT: 11, WIS: 12, CHA: 8 }, bonus: "DEX", penalty: "INT", skills: "Sneak +1 for covert work", strengths: "Stealth, locks, traps, and street contacts.", weaknesses: "Formal scholarship and open confrontation." },
  { name: "Artisan", base: { STR: 10, DEX: 13, CON: 9, INT: 12, WIS: 11, CHA: 8 }, bonus: "DEX", penalty: "CHA", skills: "Craft +1 in their trade", strengths: "Making, repairing, and careful tool use.", weaknesses: "Politics and public persuasion." },
  { name: "Farmer", base: { STR: 14, DEX: 9, CON: 11, INT: 8, WIS: 11, CHA: 10 }, bonus: "CON", penalty: "INT", skills: "Work +1 for farming and animals", strengths: "Endurance, crops, animals, and rural tools.", weaknesses: "Scholarship and unfamiliar technology." },
  { name: "Sailor", base: { STR: 11, DEX: 14, CON: 11, INT: 8, WIS: 10, CHA: 10 }, bonus: "CON", penalty: "CHA", skills: "Sail +1 aboard a ship", strengths: "Ships, weather, swimming, knots, and balance.", weaknesses: "Courtly situations and inland customs." },
  { name: "Miner", base: { STR: 13, DEX: 10, CON: 11, INT: 8, WIS: 11, CHA: 9 }, bonus: "CON", penalty: "DEX", skills: "Work +1 underground", strengths: "Endurance, stone, tunnels, and heavy tools.", weaknesses: "Fine balance and quick handwork." },
  { name: "Student", base: { STR: 8, DEX: 10, CON: 9, INT: 13, WIS: 12, CHA: 11 }, bonus: "INT", penalty: "STR", skills: "Know +1 for academic questions", strengths: "Research, recall, literacy, and learning.", weaknesses: "Hard physical work and direct combat." },
  { name: "Engineer", base: { STR: 8, DEX: 11, CON: 10, INT: 13, WIS: 11, CHA: 8 }, bonus: "INT", penalty: "CHA", skills: "Craft +1 for mechanisms", strengths: "Mechanisms, plans, repair, and technical analysis.", weaknesses: "Social finesse and courtly etiquette." },
  { name: "Bookkeeper", base: { STR: 8, DEX: 11, CON: 10, INT: 13, WIS: 11, CHA: 10 }, bonus: "INT", penalty: "DEX", skills: "Administer +1 for records and accounts", strengths: "Records, accounts, organization, and calculation.", weaknesses: "Fine handwork and physical danger." },
  { name: "Hunter", base: { STR: 11, DEX: 12, CON: 10, INT: 8, WIS: 13, CHA: 9 }, bonus: "WIS", penalty: "INT", skills: "Survive +1 in the wild", strengths: "Tracking, navigation, foraging, and ranged hunting.", weaknesses: "Formal scholarship and commerce." },
  { name: "Hermit", base: { STR: 8, DEX: 10, CON: 10, INT: 11, WIS: 13, CHA: 8 }, bonus: "WIS", penalty: "CHA", skills: "Notice +1 for quiet observation", strengths: "Observation, solitude, patience, and wilderness lore.", weaknesses: "Social obligations and public speaking." },
  { name: "Elder", base: { STR: 8, DEX: 11, CON: 10, INT: 11, WIS: 13, CHA: 10 }, bonus: "WIS", penalty: "DEX", skills: "Connect +1 in their community", strengths: "Judgment, local knowledge, and mediation.", weaknesses: "Quick physical reactions." },
  { name: "Merchant", base: { STR: 7, DEX: 10, CON: 10, INT: 12, WIS: 11, CHA: 13 }, bonus: "CHA", penalty: "DEX", skills: "Trade +1 in familiar markets", strengths: "Appraisal, bargaining, contacts, and reading customers.", weaknesses: "Physical danger and heavy labor." },
  { name: "Noble", base: { STR: 8, DEX: 10, CON: 11, INT: 12, WIS: 11, CHA: 13 }, bonus: "CHA", penalty: "CON", skills: "Connect +1 in high society", strengths: "Etiquette, influence, education, and social contacts.", weaknesses: "Hardiness and sustained labor." },
  { name: "Performer", base: { STR: 8, DEX: 12, CON: 9, INT: 11, WIS: 10, CHA: 13 }, bonus: "CHA", penalty: "STR", skills: "Perform +1 with their chosen art", strengths: "Performance, storytelling, rumours, and attention.", weaknesses: "Heavy labor and prolonged combat." },
];
const npcArchetypeNames = npcArchetypes.map(archetype => archetype.name);
const skillRankCost = (rank: number) => rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];
const skillRankCap = (level: number) => level >= 9 ? 4 : level >= 6 ? 3 : level >= 3 ? 2 : 1;
const initial = {
  name: "Cecil the Amber",
  player: "Kris",
  className: "High Mage",
  classMode: "full" as "full" | "adventurer",
  classOne: "High Mage",
  classTwo: "Expert",
  vowedEffortSkill: "Exert",
  wiseConceptSkill: "",
  beastmasterBond: "bind-companion" as "" | "bind-companion" | "chosen-friend",
  autoClassRules: true,
  level: 4,
  xp: 12,
  homeland: "Midland Deep",
  employer: "",
  profession: "",
  species: "Human",
  description: "Experience everything I’ve taught about.",
  portrait: "",
  tokenCrop: { cx: 0.5, cy: 0.5, size: 0.72 },
  background: "Scholar",
  backgroundDevelopmentMethod: "quick" as BackgroundDevelopmentMethod,
  backgroundCombatSkill: "",
  backgroundQuickSkillReplacements: blankBackgroundQuickSkillReplacements("Scholar"),
  backgroundLearningPicks: blankBackgroundLearningPicks() as BackgroundLearningPick[],
  backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls() as BackgroundDevelopmentRoll[],
  backgroundDevelopmentLegacy: undefined as BackgroundDevelopmentLegacy | undefined,
  benefits: "",
  attributeMethod: "rolled" as AttributeMethod,
  attributeRolls: { STR: 9, DEX: 9, CON: 12, INT: 18, WIS: 14, CHA: 9 },
  attributeSubstitution: "" as "" | typeof attributes[number],
  attributeBoosts: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  attrs: { STR: 9, DEX: 9, CON: 12, INT: 18, WIS: 14, CHA: 9 },
  skills: initialSkillRanks,
  skillPurchases: initialPurchasedSkillRanks,
  hpCurrent: 11,
  hpMax: 11,
  hpRolls: [] as number[],
  strainCurrent: 0,
  frail: false,
  strainMax: 12,
  ac: 10,
  baseAttack: 0,
  initiative: 0,
  armor: "",
  shield: "",
  creationEquipmentMethod: "" as CreationEquipmentMethod,
  creationEquipmentPackage: "",
  creationStartingSilver: null as number | null,
  creationEquipmentPurchases: [] as string[],
  creationEquipmentBase: null as CreationEquipmentBase | null,
  armorBonus: 0,
  focusPicks: [{ name: "Henchkeeper", level: 2 }] as FocusPick[],
  artPicks: ["Arcane Lexicon", "Sense Magic", "Retain Sorcery", "Wizard’s Grandeur"] as string[],
  artChoices: {} as Record<string, string[]>,
  artEffort: [0, 0, 0, 0] as number[],
  spellPicks: [
    { name: "Velocitous Imbuement", prepared: true, cast: false },
    { name: "Decree of Lithic Dissolution", prepared: true, cast: false },
    { name: "Extirpate Arcana", prepared: true, cast: false },
    { name: "", prepared: false, cast: false },
    { name: "", prepared: false, cast: false },
    { name: "", prepared: false, cast: false },
  ] as SpellPick[],
  effortUsed: 0,
  weapons: [{ name: "Staff", skill: -1 }, { name: "Dagger", skill: -1 }, { name: "Crossbow", skill: 0 }] as WeaponPick[],
  readied: ["Staff", "Dagger", "Dagger", "Waterskin", "Healer’s pouch", ""],
  stowed: ["Backpack", "Lantern, tinder box, and 2 pint flasks of oil", "Writing kit & 20 sheets of paper", "Rations × 7", "Healing potion × 2", "Potion of Thaumic Vitality", "Elixir of Persistent Luminescence", ""],
  stored: [] as string[],
  goals: "",
  notes: "",
  allies: "",
  languages: ["Common", "Trade Cant", "Amikwag"] as string[],
  companions: [] as Companion[],
  archivedCompanions: [] as Companion[],
  gp: 0, sp: 0, cp: 0,
};

type Sheet = typeof initial;

const CHARACTER_BUILD_KEYS = [
  "name",
  "player",
  "className",
  "classMode",
  "classOne",
  "classTwo",
  "vowedEffortSkill",
  "wiseConceptSkill",
  "beastmasterBond",
  "autoClassRules",
  "level",
  "homeland",
  "employer",
  "profession",
  "species",
  "description",
  "background",
  "backgroundDevelopmentMethod",
  "backgroundCombatSkill",
  "backgroundQuickSkillReplacements",
  "backgroundLearningPicks",
  "backgroundDevelopmentRolls",
  "backgroundDevelopmentLegacy",
  "benefits",
  "attributeMethod",
  "attributeRolls",
  "attributeSubstitution",
  "attributeBoosts",
  "attrs",
  "skills",
  "skillPurchases",
  "focusPicks",
  "artPicks",
  "artChoices",
  "languages",
] as const satisfies readonly (keyof Sheet)[];

const CHARACTER_BUILD_KEY_SET = new Set<keyof Sheet>(CHARACTER_BUILD_KEYS);
const guidedNewRecordStorageKey = (id: string) => `twe-guided-creation:new-record:${id}`;

function restoreCharacterBuildFields(current: Sheet, snapshot: Sheet): Sheet {
  const next = { ...current } as Sheet;
  for (const key of CHARACTER_BUILD_KEYS) {
    (next as unknown as Record<string, unknown>)[key] = structuredClone(
      (snapshot as unknown as Record<string, unknown>)[key],
    );
  }
  return next;
}

export type InitialCharacterPayload = {
  id: string;
  character: Partial<Sheet>;
  version: number;
  visibility: CharacterVisibility;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: { canEdit: boolean; adminReadOnly: boolean };
  campaigns?: CharacterCampaignLink[];
};

export type CharacterCampaignLink = {
  id: string;
  name: string;
};

export type CampaignCharacterContext = {
  id: string;
  name: string;
  readOnly: boolean;
};

const blankCharacter: Sheet = {
  ...initial,
  name: "",
  player: "",
  className: "",
  classOne: "",
  classTwo: "",
  beastmasterBond: "",
  level: 0,
  xp: 0,
  homeland: "",
  employer: "",
  profession: "",
  species: "",
  description: "",
  portrait: "",
  background: "",
  backgroundDevelopmentMethod: "quick" as BackgroundDevelopmentMethod,
  backgroundCombatSkill: "",
  backgroundQuickSkillReplacements: blankBackgroundQuickSkillReplacements(),
  backgroundLearningPicks: blankBackgroundLearningPicks(),
  backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
  backgroundDevelopmentLegacy: undefined as BackgroundDevelopmentLegacy | undefined,
  benefits: "",
  attributeMethod: "rolled",
  attributeRolls: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  attributeSubstitution: "",
  attributeBoosts: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  attrs: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  skills: Object.fromEntries(skills.map(skill => [skill, -2])) as Record<string, number>,
  skillPurchases: Object.fromEntries(skills.map(skill => [skill, -1])) as Record<string, number>,
  hpCurrent: 0,
  hpMax: 0,
  hpRolls: [],
  strainCurrent: 0,
  strainMax: 0,
  ac: 0,
  baseAttack: 0,
  initiative: 0,
  armor: "",
  shield: "",
  armorBonus: 0,
  focusPicks: [],
  artPicks: [],
  artChoices: {},
  artEffort: [],
  spellPicks: [],
  effortUsed: 0,
  weapons: Array.from({ length: 3 }, () => ({ name: "", skill: -1 })),
  readied: Array(6).fill(""),
  stowed: Array(8).fill(""),
  stored: [] as string[],
  goals: "",
  notes: "",
  allies: "",
  languages: ["Common"],
  companions: [],
  archivedCompanions: [],
  gp: 0,
  sp: 0,
  cp: 0,
};

function mod(score: number) {
  if (score <= 3) return -2;
  if (score <= 7) return -1;
  if (score <= 13) return 0;
  if (score <= 17) return 1;
  return 2;
}
const signed = (n: number) => n >= 0 ? `+${n}` : `${n}`;
const validRolledAttribute = (value: unknown) => {
  const score = Number(value);
  return Number.isInteger(score) && score >= 3 && score <= 18 ? score : 0;
};
const migratedAttributeState = (stored: Partial<Sheet>) => {
  const method: AttributeMethod = stored.attributeMethod === "array" ? "array" : "rolled";
  const storedAttributes = { ...initial.attrs, ...(stored.attrs || {}) };
  const attributeBoosts = Object.fromEntries(attributes.map(attribute => [
    attribute,
    Math.max(0, Math.min(5, Math.floor(Number(stored.attributeBoosts?.[attribute]) || 0))),
  ])) as Sheet["attributeBoosts"];
  if (method === "array") {
    const values = attributes.map(attribute => Number(storedAttributes[attribute]) - attributeBoosts[attribute]);
    const validArray = [...values].sort((a, b) => a - b).join(",") === [...standardAttributeArray].sort((a, b) => a - b).join(",");
    const baseAttributes = validArray
      ? Object.fromEntries(attributes.map((attribute, index) => [attribute, values[index]])) as Sheet["attrs"]
      : Object.fromEntries(attributes.map((attribute, index) => [attribute, standardAttributeArray[index]])) as Sheet["attrs"];
    const legalBoosts = validArray ? attributeBoosts : { ...blankCharacter.attributeBoosts };
    const attrs = Object.fromEntries(attributes.map(attribute => [
      attribute,
      Math.min(18, baseAttributes[attribute] + legalBoosts[attribute]),
    ])) as Sheet["attrs"];
    return {
      attributeMethod: method,
      attributeRolls: { ...initial.attributeRolls, ...(stored.attributeRolls || {}) },
      attributeSubstitution: "" as Sheet["attributeSubstitution"],
      attributeBoosts: legalBoosts,
      attrs,
    };
  }
  const attributeRolls = Object.fromEntries(attributes.map(attribute => [
    attribute,
    validRolledAttribute(stored.attributeRolls?.[attribute]) || validRolledAttribute(storedAttributes[attribute]),
  ])) as Sheet["attributeRolls"];
  const requestedSubstitution = attributes.includes(stored.attributeSubstitution as typeof attributes[number])
    ? stored.attributeSubstitution as Sheet["attributeSubstitution"]
    : "";
  const attributeSubstitution = requestedSubstitution && attributeRolls[requestedSubstitution]
    ? requestedSubstitution
    : "";
  const attrs = Object.fromEntries(attributes.map(attribute => {
    const base = attributeSubstitution === attribute ? 14 : attributeRolls[attribute];
    return [attribute, base ? Math.min(18, base + attributeBoosts[attribute]) : 0];
  })) as Sheet["attrs"];
  return { attributeMethod: method, attributeRolls, attributeSubstitution, attributeBoosts, attrs };
};
const resizeSelections = <T,>(values: T[], target: number, isEmpty: (value: T) => boolean, makeEmpty: () => T) => {
  const selected = values.filter(value => !isEmpty(value));
  return [...selected, ...Array.from({ length: Math.max(0, target - selected.length) }, makeEmpty)];
};
const bonusSkillChoices = (focusName: string): string[] => {
  const focus = foci.find(item => item.name === focusName);
  const text = focus?.level1 || "";
  if (focusName === "Specialist") return skills.filter(skill => !["Magic", "Stab", "Shoot", "Punch"].includes(skill));
  if (focusName === "Polymath") return skills;
  // These wording patterns deliberately use "any" rather than a named skill,
  // so they cannot be derived safely by the generic text parser below.
  const explicitChoices = explicitFocusSkillChoices(focusName);
  if (explicitChoices.length) return explicitChoices;
  const match = text.match(/^Gain ([A-Za-z]+)(?: or ([A-Za-z]+))? as a bonus skill/i);
  return match ? [match[1], match[2]].filter(Boolean) : [];
};
const focusChoiceLabel = (focusName: string) => {
  if (focusName === "Developed Attribute") return "Improved attribute";
  if (focusName === "Xenoblooded") return "Gravity adaptation";
  if (focusName === "Specialist" || focusName === "Polymath") return "Bonus skill";
  if (focusName === "Traditional Education") return "Specialist tradition";
  return bonusSkillChoices(focusName).length > 1 ? "Bonus skill" : "";
};
const normalizedBackgroundRules = (stored: Partial<Sheet>) => {
  return {
    ...normalizeBackgroundDevelopment(stored, typeof stored.background === "string" ? stored.background : ""),
    vowedEffortSkill: noncombatSkills.includes(stored.vowedEffortSkill || "") ? stored.vowedEffortSkill! : "Exert",
    wiseConceptSkill: skills.includes(stored.wiseConceptSkill || "") ? stored.wiseConceptSkill! : "",
  };
};

const backgroundAttributeGrowth = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundDevelopmentRolls" | "attrs">) =>
  backgroundAttributeBonuses(state.background, state.backgroundDevelopmentMethod, state.backgroundDevelopmentRolls, state.attrs);

const focusBonusSkill = (pick: FocusPick) => creationFocusBonusSkill(pick);

const backgroundSkillGrants = (
  state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundQuickSkillReplacements" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">,
  developmentEntries = activeBackgroundDevelopmentEntries(state.background, state),
) => creationSkillGrants(state, developmentEntries);

const backgroundSkillGrantResolutions = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundQuickSkillReplacements" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) =>
  creationSkillGrantResolutions(state);

const legacyReviewSkillSourcesFor = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundQuickSkillReplacements" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "backgroundDevelopmentLegacy" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) => {
  const legacy = state.backgroundDevelopmentLegacy;
  const entries = legacy ? [
    ...legacy.growthRolls.flatMap((roll, index) => {
      const result = resolvedBackgroundRollResult(state.background, roll);
      return roll.die && result ? [{
        id: `legacy-growth-${index}`,
        source: `${state.background} Background: legacy Growth ${index + 1}`,
        result,
        choice: roll.choice,
        replacement: roll.replacement,
      }] : [];
    }),
    ...legacy.learningPicks.map((pick, index) => ({
      id: `legacy-learning-${index}`,
      source: `${state.background} Background: legacy Learning ${index + 1}`,
      ...pick,
    })),
  ] : [];
  const sources = Object.fromEntries(skills.map(skill => [skill, [] as string[]])) as Record<string, string[]>;
  resolveBackgroundSkillGrants(backgroundSkillGrants(state, entries), skills, combatSkills).forEach(grant => {
    if (grant.resolvedSkill) sources[grant.resolvedSkill].push(grant.source);
  });
  return sources;
};

/** Returns each active rule source without folding it into purchased ranks. */
const skillSourcesFor = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundQuickSkillReplacements" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) => creationSkillSources(state);

const migratedSkillPurchases = (stored: Partial<Sheet>) => {
  if (stored.skillPurchases && typeof stored.skillPurchases === "object") {
    return Object.fromEntries(skills.map(skill => {
      const value = Number(stored.skillPurchases?.[skill]);
      return [skill, Number.isFinite(value) ? Math.max(-1, Math.min(4, value)) : -1];
    })) as Record<string, number>;
  }
  const normalized = normalizedBackgroundRules(stored);
  const state = {
    ...initial,
    ...stored,
    ...normalized,
    classMode: stored.classMode || (stored.className === "Adventurer" ? "adventurer" : "full"),
    classOne: stored.classOne || (fullClasses.includes(stored.className as typeof fullClasses[number]) ? stored.className : "High Mage"),
    focusPicks: Array.isArray(stored.focusPicks) ? stored.focusPicks : [],
  } as Sheet;
  // A legacy combined record is deliberately inactive after migration.  Its
  // historical grants must still be subtracted from pre-layered `skills`,
  // however, so they do not become permanent purchased ranks merely because
  // the character is awaiting a method review.
  const sources = state.backgroundDevelopmentMethod === "review" && state.backgroundDevelopmentLegacy
    ? legacyReviewSkillSourcesFor(state)
    : skillSourcesFor(state);
  const legacyFocusGrants = new Set(state.focusPicks.map(focusBonusSkill).filter(Boolean));
  return Object.fromEntries(skills.map(skill => {
    const legacy = Number(stored.skills?.[skill] ?? initial.skills[skill]);
    const legacyEffective = legacyFocusGrants.has(skill) && legacy >= -1 ? Math.min(4, legacy + 1) : legacy;
    // Old files had a single combined value. Convert it once so its usable
    // result remains stable while later changes retain true purchased ranks.
    const purchased = legacyEffective < -1 ? -1 : legacyEffective - sources[skill].length;
    return [skill, Math.max(-1, Math.min(4, purchased))];
  })) as Record<string, number>;
};

function inventorySlots(items: string[], capacity: number) {
  const kept = items.filter(item => item.trim());
  return [...kept, ...Array.from({ length: Math.max(0, capacity - kept.length) }, () => "")];
}

function compactInventory(items: string[], capacity: number) {
  return inventorySlots(items, capacity);
}

const encodeInventoryTransfer = (owner: InventoryOwner, index: number) =>
  `__transfer__${JSON.stringify({ ...owner, index })}`;

const decodeInventoryTransfer = (value: string): (InventoryOwner & { index: number }) | null => {
  if (!value.startsWith("__transfer__")) return null;
  try {
    const transfer = JSON.parse(value.slice("__transfer__".length));
    if (transfer?.kind === "pc" && Number.isInteger(transfer.index)) return transfer;
    if (transfer?.kind === "companion" && typeof transfer.id === "string" && Number.isInteger(transfer.index)) return transfer;
  } catch {
    // Ignore malformed select values.
  }
  return null;
};

function newCompanion(kind: CompanionKind, index: number, level: number, focusSlot?: number): Companion {
  const familiar = kind === "familiar";
  const beastmaster = kind === "beastmaster";
  return {
    id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    bound: !beastmaster,
    name: "",
    bestiaryId: "",
    archetype: familiar || beastmaster ? "" : "Student",
    description: "",
    hitDice: familiar ? `${Math.max(1, level)} HD` : beastmaster ? "1 HD" : "1 HD",
    hpRolled: 0,
    hpCurrent: familiar ? Math.max(1, level) : 0,
    hpMax: familiar ? Math.max(1, level) : 0,
    ac: familiar ? 14 : 10,
    move: "30′",
    attackBonus: familiar ? "No effective attack" : beastmaster ? "+0" : "+0",
    damage: familiar ? "—" : beastmaster ? "Natural weapon" : "By weapon",
    physicalSave: 15,
    evasionSave: 15,
    mentalSave: 15,
    luckSave: 15,
    morale: familiar ? "Unwavering" : "7",
    instinct: familiar ? "—" : "5",
    skillBonus: familiar ? "+0" : "+1",
    strength: familiar || beastmaster ? 10 : 8,
    readied: [],
    stowed: [],
    familiarBenefits: [],
    familiarBackground: "",
    familiarAdditionalShape: "",
    focusSlot,
    summoned: true,
    effortRefreshUsed: false,
    notes: "",
  };
}

function normalizeIncomingSheet(incoming: Partial<Sheet>): Sheet {
  const rulesState = normalizedBackgroundRules(incoming);
  return {
    ...initial,
    ...incoming,
    frail: incoming.frail === true,
    ...migratedAttributeState(incoming),
    ...rulesState,
    artChoices: normalizeArtChoices(incoming.artChoices),
    ...normalizeCreationEquipmentFields(incoming),
    profession: incoming.profession || incoming.employer || "",
    skills: { ...initial.skills, ...(incoming.skills || {}) },
    skillPurchases: migratedSkillPurchases(incoming),
    hpRolls: Array.isArray(incoming.hpRolls) ? incoming.hpRolls.map(Number) : [],
    spellPicks: Array.isArray(incoming.spellPicks)
      ? incoming.spellPicks.map((pick) => ({
          name: pick.name || "",
          prepared: Boolean(pick.prepared),
          cast: false,
          casts: spellCastCount(pick),
        }))
      : initial.spellPicks,
    artEffort: Array.isArray(incoming.artEffort)
      ? (incoming.artPicks || initial.artPicks).map((_, index) =>
          artEffortCommitmentCount(incoming.artEffort?.[index]),
        )
      : (incoming.artPicks || initial.artPicks).map(() => 0),
    beastmasterBond:
      incoming.beastmasterBond === "chosen-friend"
        ? "chosen-friend"
        : "bind-companion",
    languages: normalizeLanguages(incoming.languages),
    stored: Array.isArray(incoming.stored) ? incoming.stored.filter((item): item is string => typeof item === "string") : [],
    companions: Array.isArray(incoming.companions)
      ? incoming.companions.map((companion, index) => ({
          ...newCompanion(
            companion.kind === "familiar"
              ? "familiar"
              : companion.kind === "beastmaster"
                ? "beastmaster"
                : "henchman",
            index,
            incoming.level || 1,
          ),
          ...companion,
          archetype:
            companion.kind === "familiar" || companion.kind === "beastmaster"
              ? ""
              : npcArchetypeNames.includes(
                    companion.archetype as (typeof npcArchetypeNames)[number],
                  )
                ? companion.archetype
                : "Student",
          readied: Array.isArray(companion.readied) ? companion.readied : [],
          stowed: Array.isArray(companion.stowed) ? companion.stowed : [],
          bestiaryId: typeof companion.bestiaryId === "string" ? companion.bestiaryId : "",
          bound: companion.kind === "beastmaster"
            ? typeof companion.bound === "boolean" ? companion.bound : true
            : true,
        }))
      : [],
    archivedCompanions: Array.isArray(incoming.archivedCompanions)
      ? incoming.archivedCompanions.map((companion, index) => ({
          ...newCompanion(
            companion.kind === "familiar"
              ? "familiar"
              : companion.kind === "beastmaster"
                ? "beastmaster"
                : "henchman",
            index,
            incoming.level || 1,
          ),
          ...companion,
          archetype:
            companion.kind === "familiar" || companion.kind === "beastmaster"
              ? ""
              : npcArchetypeNames.includes(
                    companion.archetype as (typeof npcArchetypeNames)[number],
                  )
                ? companion.archetype
                : "Student",
          readied: Array.isArray(companion.readied) ? companion.readied : [],
          stowed: Array.isArray(companion.stowed) ? companion.stowed : [],
          bestiaryId: typeof companion.bestiaryId === "string" ? companion.bestiaryId : "",
          bound: companion.kind === "beastmaster"
            ? typeof companion.bound === "boolean" ? companion.bound : true
            : true,
        }))
      : [],
  } as Sheet;
}

function createBlankSheet(): Sheet {
  return {
    ...blankCharacter,
    attrs: { ...blankCharacter.attrs },
    skills: { ...blankCharacter.skills },
    skillPurchases: { ...blankCharacter.skillPurchases },
    backgroundQuickSkillReplacements: [...blankCharacter.backgroundQuickSkillReplacements],
    backgroundLearningPicks: blankCharacter.backgroundLearningPicks.map(pick => ({ ...pick })),
    backgroundDevelopmentRolls: blankCharacter.backgroundDevelopmentRolls.map(roll => ({ ...roll, attributeChoices: [...roll.attributeChoices] })),
    focusPicks: [],
    artPicks: [],
    artEffort: [],
    spellPicks: [],
    weapons: [],
    readied: [...blankCharacter.readied],
    stowed: [...blankCharacter.stowed],
    stored: [...blankCharacter.stored],
  };
}

function Tip({ title, ariaLabel, children }: { title: string; ariaLabel?: string; children: React.ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const showTooltip = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setPosition(null);
    }, 100);
  }, [clearCloseTimer]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const next = viewportTooltipPosition({
      trigger: {
        top: triggerRect.top,
        bottom: triggerRect.bottom,
        right: triggerRect.right,
      },
      tooltip: {
        width: tooltipRect.width,
        height: tooltipRect.height,
      },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setPosition({
      left: next.left,
      top: next.top,
      maxHeight: next.maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const initialFrame = window.requestAnimationFrame(updatePosition);
    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return <>
    <span
      ref={triggerRef}
      className="tip"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={open ? tooltipId : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={scheduleClose}
      onFocus={showTooltip}
      onBlur={scheduleClose}
      onKeyDown={event => {
        if (event.key === "Escape") {
          clearCloseTimer();
          setOpen(false);
          setPosition(null);
        }
      }}
    >
      {title}
    </span>
    {open && typeof document !== "undefined" && createPortal(
      <span
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        className="tipbox tipbox-portal"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          maxHeight: position ? position.maxHeight : undefined,
          visibility: position ? "visible" : "hidden",
        }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        {children}
      </span>,
      document.body,
    )}
  </>;
}

const RulesTooltip = memo(function RulesTooltip({ name, text, extra }: { name: string; text: string; extra?: string }) {
  return <div className="rules-tooltip">
    <strong className="tooltip-name">{name}</strong>
    <section className="official-description">
      <b>Official description</b>
      <p>{text}{extra ? ` ${extra}` : ""}</p>
    </section>
    <section className="plain-summary">
      <b>In plain terms</b>
      <p>{sharedPlainLanguageSummary(name.split(" · ")[0], text)}</p>
    </section>
  </div>;
});

const weaponTraitDescriptions: Record<string, string> = {
  "2H": "Two Handed: Requires two hands; ranged two-handed weapons cannot be fired effectively while an enemy is in melee range.",
  AP: "Armor Piercing: Ignores non-magical hides, armor, and shields for hit rolls.",
  FX: "Fixed: Requires a fixed position and at least five minutes to entrench before use.",
  L: "Long: Can make melee attacks against targets up to 10 feet away, even past an ally.",
  LL: "Less Lethal: A foe reduced to 0 HP can be left alive at your discretion.",
  N: "Numerous: Five of these weapons count as one Readied item.",
  PM: "Precisely Murderous: Execution Attacks impose an extra -1 Physical save penalty and deal double damage even on a successful save.",
  R: "Reload: Takes a Move action to reload, or an On Turn action with Shoot-1 or better.",
  S: "Subtle: Can be easily hidden in ordinary clothing or jewelry.",
  SR: "Slow Reload: Takes a Main Action to reload.",
  SS: "Single Shot: Takes ten rounds to reload, and being engaged in melee spoils the reload.",
  T: "Throwable: Can be thrown to its listed range without Shock; throwing while in melee gives -4 to hit.",
};

function WeaponRangeValue({ range }: { range: string }) {
  const parts = range.split("/");
  if (parts.length < 2) return <>{range}</>;
  return <><span className="weapon-range-part">{parts[0]}/</span><wbr /><span className="weapon-range-part">{parts.slice(1).join("/")}</span></>;
}

const WeaponTraitCodes = memo(function WeaponTraitCodes({ traits }: { traits: string }) {
  const codes = traits.split(",").map(trait => trait.trim()).filter(Boolean);
  if (!codes.length) return <small>None</small>;
  return <small className="weapon-trait-codes">{codes.map((code, index) => (
    <span className="weapon-trait" tabIndex={0} key={code}>
      {index > 0 && <span className="weapon-trait-separator" aria-hidden="true">, </span>}
      <span className="weapon-trait-code">{code}</span>
      <span className="weapon-trait-popup" role="tooltip">{weaponTraitDescriptions[code] || code}</span>
    </span>
  ))}</small>;
});

function Field({ label, value, onChange, className = "" }: { label: string; value: string | number; onChange: (v: string) => void; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span><input value={value} onChange={e => onChange(e.target.value)} /></label>;
}

function StepperField({ label, value, minimum, maximum, onChange }: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.max(minimum, Math.min(maximum, next));
  return <label className="field stepper-field">
    <span>{label}</span>
    <span className="stepper-control">
      <input
        type="number"
        min={minimum}
        max={maximum}
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || 0))}
      />
      <span className="stepper-buttons">
        <button type="button" aria-label={`Increase ${label}`} disabled={value >= maximum} onClick={() => onChange(clamp(value + 1))}>▲</button>
        <button type="button" aria-label={`Decrease ${label}`} disabled={value <= minimum} onClick={() => onChange(clamp(value - 1))}>▼</button>
      </span>
    </span>
  </label>;
}

function Section({ title, aside, children, className = "", buildControlled = false }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; buildControlled?: boolean }) {
  return <section className={`sheet-section ${className}`} data-character-build-section={buildControlled ? "true" : undefined}><header><h2>{title}</h2></header>{aside && <div className="section-aside">{aside}</div>}<div className="section-body">{children}</div></section>;
}

function DiceControl({
  expression,
  result,
  onRoll,
  disabled = false,
}: {
  expression: "d20" | "2d6";
  result: RollResult | null;
  onRoll: () => void;
  disabled?: boolean;
}) {
  const detail = result
    ? result.dice.count > 1
      ? `${result.dice.results.join(" + ")} = ${result.total}`
      : `${result.total}`
    : "No result yet";
  const accessibleName = result
    ? `Roll ${expression}. Current result ${detail}. Activate to roll again.`
    : `Roll ${expression}. No result yet. Activate to roll.`;

  return <button
    type="button"
    className="dice-control"
    data-readonly-interactive="true"
    disabled={disabled}
    aria-busy={disabled || undefined}
    aria-label={accessibleName}
    title={result && result.dice.count > 1 ? detail : undefined}
    onClick={onRoll}
  >
    <span
      key={result?.id || expression}
      className={`dice-control-result ${result ? "dice-result-roll" : ""}`}
      aria-hidden="true"
    >{result ? result.total : "—"}</span>
    <span className="dice-control-action" aria-hidden="true">Roll {expression}</span>
  </button>;
}

export default function Home({
  initialCharacter,
  startNew = false,
  campaignContext,
}: {
  initialCharacter?: InitialCharacterPayload;
  startNew?: boolean;
  campaignContext?: CampaignCharacterContext;
}) {
  const { theme: displayTheme } = useDisplayTheme();
  const { enabled: virtualDiceEnabled } = useVirtualDicePreference();
  const { style: diceStyle } = useDiceStylePreference();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user?.id);
  const isAdmin = signedIn && session?.user?.role === "admin";
  const [tab, setTab] = useState<Tab>("core");
  const [creationEntry, setCreationEntry] = useState<"none" | "choose" | "guided" | "blank">(
    startNew && !initialCharacter ? "choose" : "none",
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [characterEditMode, setCharacterEditMode] = useState(false);
  const characterEditSnapshot = useRef<Sheet | null>(null);
  const [sheet, setSheet] = useState<Sheet>(() =>
    startNew && !initialCharacter
      ? createBlankSheet()
      : initialCharacter
      ? normalizeIncomingSheet(initialCharacter.character)
      : initial,
  );
  const [saved, setSaved] = useState(
    initialCharacter ? "Loaded online" : "Saved",
  );
  const [transferMessage, setTransferMessage] = useState("");
  const [dragging, setDragging] = useState<{ kind: "spell" | "art"; index: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(!initialCharacter && !startNew);
  const [libraryScope, setLibraryScope] = useState<LibraryScope>("public");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [library, setLibrary] = useState<LibraryCharacter[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [cloudId, setCloudId] = useState<string | null>(initialCharacter?.id ?? null);
  const [whirlwindSceneUsed, setWhirlwindSceneUsed] = useState(false);
  const [rangedInMelee, setRangedInMelee] = useState(false);
  const [armsmasterToShock, setArmsmasterToShock] = useState(false);
  const [preferThrownMode, setPreferThrownMode] = useState(false);
  const [whirlwindRoundUsed, setWhirlwindRoundUsed] = useState(false);
  const [focusAbilityUsed, setFocusAbilityUsed] = useState<Record<string, boolean>>({});
  const markFocusAbility = (key: string) => setFocusAbilityUsed(current => ({ ...current, [key]: true }));
  const resetFocusAbilities = () => setFocusAbilityUsed({});


  const [cloudVersion, setCloudVersion] = useState<number | null>(initialCharacter?.version ?? null);
  const [cloudVisibility, setCloudVisibility] = useState<CharacterVisibility>(
    initialCharacter?.visibility ?? "private",
  );
  const [cloudArchivedAt, setCloudArchivedAt] = useState<string | null>(
    initialCharacter?.archivedAt ?? null,
  );
  const [cloudCanEdit, setCloudCanEdit] = useState(
    initialCharacter?.permissions.canEdit ?? false,
  );
  const [cloudAdminReadOnly, setCloudAdminReadOnly] = useState(
    initialCharacter?.permissions.adminReadOnly ?? false,
  );

  function setGuidedCreationMode(
    enabled: boolean,
    historyMode: "push" | "replace" = "push",
  ) {
    setWizardOpen(enabled);
    if (typeof window === "undefined") return;
    const next = withGuidedCreationMode(window.location.href, enabled);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (historyMode === "push") {
      window.history.pushState(window.history.state, "", next);
    } else {
      window.history.replaceState(window.history.state, "", next);
    }
  }

  function setLevelUpMode(
    enabled: boolean,
    historyMode: "push" | "replace" = "push",
  ) {
    setLevelUpOpen(enabled);
    if (typeof window === "undefined") return;
    const next = withLevelUpMode(window.location.href, enabled);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (historyMode === "push") window.history.pushState(window.history.state, "", next);
    else window.history.replaceState(window.history.state, "", next);
  }

  const [campaignLinks, setCampaignLinks] = useState<CharacterCampaignLink[]>(
    initialCharacter?.campaigns ?? [],
  );
  const [joinedLiveSessionCampaignId, setJoinedLiveSessionCampaignId] = useState<string | null>(
    campaignContext && !campaignContext.readOnly ? campaignContext.id : null,
  );
  const [inventoryAddOpen, setInventoryAddOpen] = useState(false);
  const [inventoryAddValue, setInventoryAddValue] = useState("");
  const [inventoryAddCustom, setInventoryAddCustom] = useState("");
  const [inventoryNotice, setInventoryNotice] = useState("");
  const [inventorySwap, setInventorySwap] = useState<{ source: "readied" | "stowed" | "stored"; index: number; destination: "readied" | "stowed" } | null>(null);
  const [otherStowedIndex, setOtherStowedIndex] = useState<number | null>(null);
  const [otherStowedDraftName, setOtherStowedDraftName] = useState("");
  const [companionOtherStowed, setCompanionOtherStowed] = useState<Record<string, number | null>>({});
  const [companionOtherStowedDrafts, setCompanionOtherStowedDrafts] = useState<Record<string, string>>({});
  const [masterfulRequest, setMasterfulRequest] = useState<RollRequest | null>(null);
  const [masterfulRollId, setMasterfulRollId] = useState<string | null>(null);
  const [masterfulUsed, setMasterfulUsed] = useState(false);
  const [masterfulRestored, setMasterfulRestored] = useState(false);
  const [veteransUsed, setVeteransUsed] = useState(false);
  const [veteransReady, setVeteransReady] = useState(false);
  const [veteransOutcome, setVeteransOutcome] = useState("");
  const [latestAttackId, setLatestAttackId] = useState<string | null>(null);
  const [focusRerollSource, setFocusRerollSource] = useState<{ request: RollRequest; resultId: string } | null>(null);
  const [focusRerollUsed, setFocusRerollUsed] = useState<Record<string, boolean>>({});
  const [focusRerollReady, setFocusRerollReady] = useState(false);
  const [latestRoll, setLatestRoll] = useState<RollResult | null>(null);
  const [rollHistory, setRollHistory] = useState<RollResult[]>([]);
  const [rollHistoryOpen, setRollHistoryOpen] = useState(false);
  const [skillRollChooser, setSkillRollChooser] = useState<string | null>(null);
  const [sniperEyeContext, setSniperEyeContext] = useState(false);
  const [diplomacyContext, setDiplomacyContext] = useState(false);
  const [magicalSaveContext, setMagicalSaveContext] = useState(false);
  const [diceAnnouncement, setDiceAnnouncement] = useState("");
  const [diceAnnouncementKey, setDiceAnnouncementKey] = useState(0);
  const [diceError, setDiceError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [virtualDiceBusy, setVirtualDiceBusy] = useState(false);
  const portraitInput = useRef<HTMLInputElement>(null);
  const [tokenEditorOpen,setTokenEditorOpen]=useState(false);
  const [tokenCropDraft,setTokenCropDraft]=useState({cx:0.5,cy:0.5,size:0.72,aspect:1});
  const tokenDrag=useRef(false);
  const characterNameInput = useRef<HTMLTextAreaElement>(null);
  const editableSurface = useRef<HTMLDivElement>(null);
  const virtualDiceOverlay = useRef<VirtualDiceOverlayHandle>(null);
  const virtualDiceBusyRef = useRef(false);
  const authIntentHandled = useRef(false);
  const guidedCreationNewRecord = useRef(false);
  const lastCloudData = useRef(
    initialCharacter ? JSON.stringify(normalizeIncomingSheet(initialCharacter.character)) : "",
  );
  const canEdit = signedIn && (!cloudId || cloudCanEdit);
  const levelOneStatus = useMemo(() => levelOneCreationStatus(sheet), [sheet]);
  const { items: campaignInventoryItems, error: campaignInventoryError } = useCampaignInventoryItems(cloudId, campaignLinks, canEdit);
  const campaignArmorItems = campaignInventoryItems.filter(item => item.kind === "armor");
  const buildFieldsEditable = canEdit && (!cloudId || characterEditMode);
  const updateJoinedLiveSessionCampaign = useCallback((campaignId: string | null) => setJoinedLiveSessionCampaignId(campaignId), []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const input = characterNameInput.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [sheet.name]);

  function canonicalCallbackURL(): string {
    if (typeof window === "undefined") return CANONICAL_ORIGIN;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return window.location.hostname === FALLBACK_WORKER_HOST
      ? `${CANONICAL_ORIGIN}${path}`
      : window.location.href;
  }

  async function signInWithGoogle(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const callbackURL = "/";

    setTransferMessage("Opening Google sign-in…");
    setLibraryError("");

    if (window.location.hostname === FALLBACK_WORKER_HOST) {
      const canonical = new URL(canonicalCallbackURL());
      canonical.searchParams.set("auth", "google");
      window.location.assign(canonical);
      return;
    }

    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
      if (error) {
        throw new Error(error.message || "Better Auth rejected Google sign-in.");
      }
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : "The request could not be started.";
      const feedback = `Google sign-in failed: ${detail}`;
      setTransferMessage(feedback);
      setLibraryError(feedback);
    }
  }

  function requireSignIn(action: string): false {
    setTransferMessage(`Sign in with Google to ${action}. Your current browser copy has not been discarded.`);
    return false;
  }

  useEffect(() => {
    if (sessionPending || signedIn || authIntentHandled.current) return;
    const url = new URL(window.location.href);
    if (url.hostname !== new URL(CANONICAL_ORIGIN).hostname || url.searchParams.get("auth") !== "google") return;
    authIntentHandled.current = true;
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    void authClient.signIn.social({
      provider: "google",
      callbackURL: url.toString(),
    });
  }, [sessionPending, signedIn]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRollHistory(readRollHistory()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function rollCharacter() {
    return { id: cloudId || "local-sheet", name: sheet.name.trim() || "Unnamed character" };
  }

  function announceRoll(result: RollResult) {
    const outcome = result.outcome ? ` ${result.outcome === "success" ? "Success." : "Failure."}` : "";
    const target = result.target === undefined ? "" : ` Target ${result.target} or higher.`;
    const shockReminder = result.shockMinimum ? ` ${formatShockMinimumReminder(result.shockMinimum)}` : "";
    return `${result.label}: ${result.dice.results.join(" plus ")}${result.keepHighest === undefined ? "" : ` (keep highest ${result.keepHighest})`}${result.modifiers.length ? ` with ${result.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" and ")}` : ""}, total ${result.total}.${target}${outcome}${shockReminder}`;
  }

  async function completeRoll(request: RollRequest) {
    const shouldAnimate = virtualDiceEnabled && !reducedMotion && Boolean(virtualDiceOverlay.current);
    if (shouldAnimate && virtualDiceBusyRef.current) return;

    let preparedSharedRoll: RollResult | null = null;
    const liveRollCampaignId = campaignContext && !campaignContext.readOnly ? campaignContext.id : joinedLiveSessionCampaignId;
    if (liveRollCampaignId && cloudId && isSharedRollCategory(request.category)) {
      try {
        const response = await fetch(`/api/campaigns/${liveRollCampaignId}/session/rolls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "prepare", characterId: cloudId, request }),
        });
        if (response.ok) {
          const body = await response.json() as { roll?: RollResult };
          preparedSharedRoll = body.roll || null;
        }
      } catch { /* A session outage must not prevent the local roll. */ }
    }

    let rawRoll: DiceRoll;
    let localResult: RollResult | null = null;
    try {
      // Resolve all rerolled dice before animation so the visible result, local
      // history, and server-prepared shared result display the same dice.
      if (!preparedSharedRoll) localResult = await resolveRoll(request);
      rawRoll = (preparedSharedRoll || localResult)!.dice;
    } catch {
      const message = "Dice rolling is unavailable because secure browser randomness could not be accessed.";
      setDiceError(message);
      setDiceAnnouncement(message);
      setDiceAnnouncementKey(current => current + 1);
      return;
    }

    let animationFailed = false;
    if (shouldAnimate) {
      virtualDiceBusyRef.current = true;
      setVirtualDiceBusy(true);
      let watchdog: number | undefined;
      try {
        const animation = virtualDiceOverlay.current?.roll({
          dice: rawRoll.results.map(value => ({ sides: rawRoll.sides, value })),
          style: diceStyle,
        });
        if (!animation) throw new Error("The virtual dice overlay is unavailable.");
        const timeout = new Promise<never>((_, reject) => {
          watchdog = window.setTimeout(() => reject(new Error("The virtual dice renderer timed out.")), 15000);
        });
        await Promise.race([animation, timeout]);
      } catch {
        animationFailed = true;
        virtualDiceOverlay.current?.cancel();
      } finally {
        if (watchdog !== undefined) window.clearTimeout(watchdog);
        virtualDiceBusyRef.current = false;
        setVirtualDiceBusy(false);
      }
    }

    try {
      const result = (preparedSharedRoll || localResult)!;
      setLatestRoll(result);
      if (request.category === "skill" || request.category === "save") {
        setFocusRerollSource(request.label.includes("— Focus reroll") ? null : { request, resultId: result.id });
      } else {
        setFocusRerollSource(null);
      }
      if (request.category === "attack") setLatestAttackId(result.id);
      if (request.category === "skill" && !request.label.includes("Masterful Expertise reroll")) {
        setMasterfulRollId(result.id);
      }
      setRollHistory(current => {
        const next = prependRollHistory(current, result);
        persistRollHistory(next);
        return next;
      });
      setDiceAnnouncement(announceRoll(result));
      setDiceAnnouncementKey(current => current + 1);
      setDiceError(animationFailed ? "Animated dice were unavailable; the roll was completed normally." : "");
      if (preparedSharedRoll && liveRollCampaignId && cloudId) {
        void fetch(`/api/campaigns/${liveRollCampaignId}/session/rolls`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "publish", characterId: cloudId, rollId: preparedSharedRoll.id }),
        }).then(response => {
          if (!response.ok) throw new Error("publish failed");
        }).catch(() => setDiceError("The roll completed locally, but could not be shared with the live session."));
      }
    } catch {
      const message = "The roll could not be resolved.";
      setDiceError(message);
      setDiceAnnouncement(message);
      setDiceAnnouncementKey(current => current + 1);
    }
  }

  function rollHeaderDice(kind: "d20" | "2d6") {
    void completeRoll({
      category: "generic",
      character: rollCharacter(),
      label: kind === "d20" ? "d20 Roll" : "2d6 Roll",
      dice: kind === "d20" ? { count: 1, sides: 20 } : { count: 2, sides: 6 },
    });
  }

  // Track use per browser session, scoped to the saved character.
  useEffect(() => {
    let active = true;
    const key = `twe-masterful-${cloudId || "unsaved"}`;
    void Promise.resolve().then(() => {
      if (!active) return;
      try { setMasterfulUsed(sessionStorage.getItem(key) === "used"); } catch { setMasterfulUsed(false); }
      setMasterfulRestored(true);
    });
    return () => { active = false; };
  }, [cloudId]);

  function resetMasterfulScene() {
    const key = `twe-masterful-${cloudId || "unsaved"}`;
    try { sessionStorage.removeItem(key); } catch {}
    setMasterfulUsed(false);
    setMasterfulRequest(null);
    setMasterfulRollId(null);
  }

  function rerollMasterful() {
    if (sheet.classMode !== "full" || sheet.classOne !== "Expert" || masterfulUsed || !masterfulRequest || latestRoll?.id !== masterfulRollId) return;
    const key = `twe-masterful-${cloudId || "unsaved"}`;
    try { sessionStorage.setItem(key, "used"); } catch {}
    setMasterfulUsed(true);
    setMasterfulRequest(null);
    setMasterfulRollId(null);
    void completeRoll({ ...masterfulRequest, label: `${masterfulRequest.label} — Masterful Expertise reroll` });
  }

  useEffect(() => {
    let active = true;
    const key = `twe-veterans-luck-${cloudId || "unsaved"}`;
    void Promise.resolve().then(() => {
      if (!active) return;
      try { setVeteransUsed(sessionStorage.getItem(key) === "used"); } catch { setVeteransUsed(false); }
      setVeteransOutcome("");
      setVeteransReady(true);
    });
    return () => { active = false; };
  }, [cloudId]);

  function applyVeteransLuck(kind: "hit" | "miss") {
    if (sheet.classMode !== "full" || sheet.classOne !== "Warrior" || !veteransReady || veteransUsed || virtualDiceBusy) return;
    if (kind === "hit" && (latestRoll?.category !== "attack" || latestRoll.id !== latestAttackId)) return;
    const description = kind === "hit"
      ? `${latestRoll?.label || "Attack"}: forced hit`
      : "An incoming attack against you: forced miss";
    // Veteran's Luck changes the adjudicated outcome, not the physical die result.
    try { sessionStorage.setItem(`twe-veterans-luck-${cloudId || "unsaved"}`, "used"); } catch {}
    setVeteransUsed(true);
    setVeteransOutcome(description);
    setDiceAnnouncement(`Veteran’s Luck — ${description}`);
    setDiceAnnouncementKey(current => current + 1);
  }

  function resetVeteransScene() {
    try { sessionStorage.removeItem(`twe-veterans-luck-${cloudId || "unsaved"}`); } catch {}
    setVeteransUsed(false);
    setVeteransOutcome("");
  }

  const situationalRerolls = [
    { name: "Impostor", eligible: true, context: "failed check or save while maintaining an imposture or disguise" },
    { name: "Trapmaster", eligible: true, context: "failed check or save involving traps or snares" },
    { name: "Rider", eligible: sheet.focusPicks.some(pick => pick.name === "Rider" && pick.level === 2) && focusRerollSource?.request.category === "skill" && focusRerollSource.request.label.startsWith("Ride ("), context: "failed Ride skill check" },
  ].filter(option => sheet.focusPicks.some(pick => pick.name === option.name) && option.eligible);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      const used: Record<string, boolean> = {};
      for (const name of ["Impostor", "Trapmaster", "Rider"]) {
        try { used[name] = sessionStorage.getItem(`twe-focus-reroll-${cloudId || "unsaved"}-${name}`) === "used"; } catch { used[name] = false; }
      }
      setFocusRerollUsed(used);
      setFocusRerollReady(true);
    });
    return () => { active = false; };
  }, [cloudId]);

  function applySituationalReroll(name: string) {
    const option = situationalRerolls.find(value => value.name === name);
    if (!option || focusRerollUsed[name] || !focusRerollReady || virtualDiceBusy || !focusRerollSource || latestRoll?.id !== focusRerollSource.resultId) return;
    const request = focusRerollSource.request;
    if (request.category !== "skill" && request.category !== "save") return;
    try { sessionStorage.setItem(`twe-focus-reroll-${cloudId || "unsaved"}-${name}`, "used"); } catch {}
    setFocusRerollUsed(current => ({ ...current, [name]: true }));
    setFocusRerollSource(null);
    void completeRoll({ ...request, label: `${request.label} — Focus reroll (${name})` });
  }

  function resetSituationalRerolls() {
    for (const name of ["Impostor", "Trapmaster", "Rider"]) {
      try { sessionStorage.removeItem(`twe-focus-reroll-${cloudId || "unsaved"}-${name}`); } catch {}
    }
    setFocusRerollUsed({});
    setFocusRerollSource(null);
  }

  function rollSkillCheck(skill: string, attribute: AttributeName) {
    const profile = skillProfile(skill);
    const specialist = selectedFocusPicks.find(pick => pick.name === "Specialist" && pick.choice === skill);
    const giftedChirurgeon = skill === "Heal" && selectedFocusPicks.some(pick => pick.name === "Gifted Chirurgeon");
    // Sniper’s Eye applies only to ranged execution attacks and target shooting,
    // not to ordinary Shoot skill checks.
    const sniperEyeBonus = skill === "Shoot" && sniperEyeContext && selectedFocusPicks.some(pick => pick.name === "Sniper’s Eye");
    const diceCount = specialist?.level === 2 ? 4 : specialist || giftedChirurgeon || sniperEyeBonus ? 3 : 2;
    setSkillRollChooser(null);
    setSniperEyeContext(false);
    const diplomacyApplies = diplomacyContext && selectedFocusPicks.some(pick => pick.name === "Diplomatic Grace");
    setDiplomacyContext(false);
    const request: RollRequest = {
      category: "skill",
      character: rollCharacter(),
      label: `${skill} (${attribute}) Check${sniperEyeBonus ? " — ranged execution / target shooting" : ""}${diplomacyApplies ? " — Diplomatic Grace (reroll 1s)" : ""}`,
      ...(diplomacyApplies ? { rerollOnes: true } : {}),
      dice: { count: diceCount, sides: 6 },
      ...(diceCount > 2 ? { keepHighest: 2 } : {}),
      modifiers: [
        { label: `${skill} skill`, value: profile.effective },
        { label: attribute, value: attributeMod(attribute) },
      ],
    };
    // Combat skills aren't eligible for Masterful Expertise.
    setMasterfulRequest(!["Stab", "Shoot", "Punch", "Magic"].includes(skill) ? request : null);
    setMasterfulRollId(null);
    void completeRoll(request);
  }

  function rollWeaponAttack(name: string, hit: number) {
    void completeRoll({
      category: "attack",
      character: rollCharacter(),
      label: `${name} — Attack`,
      dice: { count: 1, sides: 20 },
      modifiers: [{ label: "Attack bonus", value: hit }],
    });
  }

  function rollWeaponDamage(name: string, expression: string, shock?: string) {
    try {
      const damage = parseDamageExpression(expression);
      const shockMinimum = parseShockMinimum(shock);
      void completeRoll({
        category: "damage",
        character: rollCharacter(),
        label: `${name} — Damage`,
        dice: damage.dice,
        modifiers: damage.modifier ? [{ label: "Damage modifier", value: damage.modifier }] : [],
        ...(shockMinimum ? { shockMinimum } : {}),
      });
    } catch {
      setDiceError(`The displayed ${name} damage expression could not be rolled.`);
    }
  }

  function rollUnarmedMiss(name: string, shock: string, includeShock: boolean) {
    const modifier = unarmedMissDamageBonus(shock, includeShock);
    void completeRoll({
      category: "damage",
      character: rollCharacter(),
      label: `${name} — Unarmed Combatant level 2 miss${includeShock ? " + applicable Shock" : " (no Shock)"}`,
      dice: { count: 1, sides: 6 },
      modifiers: modifier ? [{ label: "Applicable Shock", value: modifier }] : [],
    });
  }

  function rollSave(name: keyof typeof saves) {
    const nullifierBonus = magicalSaveContext && selectedFocusPicks.some(pick => pick.name === "Nullifier");
    void completeRoll({
      category: "save",
      character: rollCharacter(),
      label: `${name} Saving Throw${nullifierBonus ? " (Nullifier: magical effect)" : ""}`,
      dice: { count: 1, sides: 20 },
      ...(nullifierBonus ? { modifiers: [{ label: "Nullifier vs magic", value: 2 }] } : {}),
      target: saves[name],
      targetKind: "saving-throw",
    });
  }

  function rollInitiative() {
    const alert = selectedFocusPicks.some(pick => pick.name === "Alert");
    const alertLevelTwo = selectedFocusPicks.some(pick => pick.name === "Alert" && pick.level === 2);
    // Alert 2 grants first action regardless of initiative totals, except
    // when another participant also has Alert 2. Keep the roll for tie handling.
    void completeRoll({
      category: "initiative",
      character: rollCharacter(),
      label: alertLevelTwo ? "Initiative (Alert 2: act first unless another Alert 2 is present)" : alert ? "Initiative (Alert: take better die)" : "Initiative",
      dice: { count: alert ? 2 : 1, sides: 8 },
      ...(alert ? { keepHighest: 1 } : {}),
      modifiers: [{ label: "Initiative modifier", value: calculatedInitiative }],
    });
  }

  function clearLocalRollHistory() {
    clearRollHistory();
    setRollHistory([]);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (!initialCharacter && !startNew) {
        const raw = localStorage.getItem("wwn-cecil-sheet");
        if (raw) try {
          setSheet(normalizeIncomingSheet(JSON.parse(raw)));
        } catch {}
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [initialCharacter, startNew]);

  useEffect(() => {
    const synchronizeGuidedCreationMode = () => {
      const guided = guidedCreationModeFromUrl(window.location.href);
      setWizardOpen(guided);
      setCreationEntry(current => guided ? "guided" : current === "guided" ? "none" : current);
    };
    synchronizeGuidedCreationMode();
    window.addEventListener("popstate", synchronizeGuidedCreationMode);
    return () => window.removeEventListener("popstate", synchronizeGuidedCreationMode);
  }, []);

  useEffect(() => {
    if (!cloudId || typeof window === "undefined") return;
    guidedCreationNewRecord.current = window.sessionStorage.getItem(guidedNewRecordStorageKey(cloudId)) === "1";
  }, [cloudId]);

  useEffect(() => {
    const synchronizeLevelUpMode = () =>
      setLevelUpOpen(levelUpModeFromUrl(window.location.href));
    synchronizeLevelUpMode();
    window.addEventListener("popstate", synchronizeLevelUpMode);
    return () => window.removeEventListener("popstate", synchronizeLevelUpMode);
  }, []);

  useEffect(() => {
    if (!hydrated || !canEdit) return;
    const t = setTimeout(() => {
      localStorage.setItem("wwn-cecil-sheet", JSON.stringify(sheet));
      if (!cloudId) setSaved("Saved on this device");
    }, 250);
    return () => clearTimeout(t);
  }, [sheet, hydrated, cloudId, canEdit]);

  useEffect(() => {
    if (sessionPending) return;
    const scope = signedIn ? "mine" : "public";
    const timeout = window.setTimeout(() => {
      setLibraryScope(scope);
      void refreshLibrary(scope);
    }, 0);
    return () => window.clearTimeout(timeout);
  // `refreshLibrary` is intentionally a page-local command, not reactive state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionPending, signedIn]);

  useEffect(() => {
    if (!hydrated || !canEdit || !cloudId || cloudVersion === null || characterEditMode) return;
    const serialized = JSON.stringify(sheet);
    if (serialized === lastCloudData.current) return;
    setSaved("Unsaved changes");
    const t = setTimeout(() => { void saveToCloud(); }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, hydrated, cloudId, canEdit, characterEditMode]);

  useEffect(() => {
    const surface = editableSurface.current;
    if (!surface) return;
    const controls = Array.from(
      surface.querySelectorAll("input, select, textarea, button"),
    ) as unknown as Array<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >;
    controls.forEach(control => {
      const readonlyInteractive = Boolean(
        control.closest('[data-readonly-interactive="true"]'),
      );
      const buildControlled = Boolean(
        control.closest('[data-character-build-section="true"], [data-character-build-control="true"]'),
      );
      const playStateControl = Boolean(
        control.closest('[data-character-play-state="true"]'),
      );
      const disabledForPermission = !canEdit && !readonlyInteractive;
      const disabledForBuildLock = canEdit && !buildFieldsEditable && buildControlled && !readonlyInteractive && !playStateControl;
      const shouldDisable = disabledForPermission || disabledForBuildLock;
      if (shouldDisable && !control.disabled) {
        control.dataset.sheetModeDisabled = "true";
        if (disabledForBuildLock) control.dataset.characterBuildDisabled = "true";
        control.disabled = true;
      } else if (!shouldDisable && control.dataset.sheetModeDisabled === "true") {
        control.disabled = false;
        delete control.dataset.sheetModeDisabled;
        delete control.dataset.characterBuildDisabled;
      }
    });
  }, [canEdit, buildFieldsEditable, sheet, tab]);

  useEffect(() => {
    function handleHistoryNavigation() {
      const match = window.location.pathname.match(/^\/character\/(chr_[A-Za-z0-9_-]+)$/u);
      if (match) {
        void openCloudCharacter(match[1], { updateHistory: false });
        return;
      }
      if (window.location.pathname === "/") {
        const raw = localStorage.getItem("wwn-cecil-sheet");
        if (raw) try {
          setSheet(normalizeIncomingSheet(JSON.parse(raw)));
        } catch {}
        setCloudId(null);
        setCloudVersion(null);
        setCloudVisibility("private");
        setCloudAdminReadOnly(false);
        setCloudCanEdit(false);
        lastCloudData.current = "";
        setSaved(signedIn ? "Saved on this device" : "Sign in to edit");
      }
    }
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, [signedIn]);

  const patch = <K extends keyof Sheet>(key: K, value: Sheet[K]) => {
    if (!canEdit || (!buildFieldsEditable && CHARACTER_BUILD_KEY_SET.has(key))) return;
    setSheet(s => ({ ...s, [key]: value }));
  };
  const patchCompanion = <K extends keyof Companion>(id: string, key: K, value: Companion[K]) =>
    canEdit && setSheet(current => ({
        ...current,
        companions: current.companions.map(companion => companion.id === id ? { ...companion, [key]: value } : companion),
      }));
  const chooseBeastmasterCatalogProfile = (id: string, bestiaryId: string) => {
    if (!canEdit) return;
    if (!bestiaryId) {
      patchCompanion(id, "bestiaryId", "");
      return;
    }
    const creature = beastmasterCatalogCreature(bestiaryId);
    if (!creature) return;
    const attack = creature.attacks[0];
    const profileNotes = [
      `Bestiary profile: ${creature.name}.`,
      creature.notes,
      ...(creature.abilities ?? []).map(ability => `${ability.name}: ${ability.summary}`),
    ].filter(Boolean).join("\n");
    setSheet(current => ({
      ...current,
      companions: current.companions.map(companion => companion.id !== id || !companion.bound ? companion : {
        ...companion,
        bestiaryId: creature.id,
        description: creature.description,
        hitDice: creature.sourceStats.hitDiceDisplay ?? `${creature.sourceStats.hitDice} HD`,
        hpCurrent: creature.hpMax,
        hpMax: creature.hpMax,
        ac: creature.armorClass,
        move: creature.sourceStats.move,
        attackBonus: formatBeastmasterHitBonus(attack?.attackBonus ?? null),
        damage: attack ? `${attack.name}: ${attack.damage}${attack.shock ? ` · Shock ${attack.shock}` : ""}` : "—",
        physicalSave: creature.physicalSave,
        evasionSave: creature.evasionSave,
        mentalSave: creature.mentalSave,
        morale: String(creature.sourceStats.morale),
        instinct: String(creature.sourceStats.instinct),
        skillBonus: formatBeastmasterHitBonus(creature.sourceStats.skill),
        notes: profileNotes,
      }),
    }));
  };
  const changeBeastmasterBond = (bond: Sheet["beastmasterBond"]) => {
    if (!buildFieldsEditable) return;
    const redundant = chosenFriendBenefitArts as readonly string[];
    setSheet(current => ({
      ...current,
      beastmasterBond: bond,
      artPicks: bond === "chosen-friend"
        ? current.artPicks.map(selection => redundant.includes(artSelectionName(selection)) ? "" : selection)
        : current.artPicks,
      artEffort: bond === "chosen-friend"
        ? current.artEffort.map((committed, index) => redundant.includes(artSelectionName(current.artPicks[index] || "")) ? 0 : committed)
        : current.artEffort,
    }));
  };

  function selectAttributeMethod(method: AttributeMethod) {
    setSheet(current => {
      if (method === "array") {
        const attrs = Object.fromEntries(attributes.map((attribute, index) => [
          attribute,
          Math.min(18, standardAttributeArray[index] + current.attributeBoosts[attribute]),
        ])) as Sheet["attrs"];
        return { ...current, attributeMethod: method, attributeSubstitution: "", attrs };
      }
      const rolls = attributes.every(attribute => validRolledAttribute(current.attributeRolls[attribute]))
        ? current.attributeRolls
        : Object.fromEntries(attributes.map(attribute => [
            attribute,
            validRolledAttribute(current.attrs[attribute] - current.attributeBoosts[attribute]),
          ])) as Sheet["attributeRolls"];
      const attrs = Object.fromEntries(attributes.map(attribute => [
        attribute,
        rolls[attribute] ? Math.min(18, rolls[attribute] + current.attributeBoosts[attribute]) : 0,
      ])) as Sheet["attrs"];
      return { ...current, attributeMethod: method, attributeRolls: rolls, attributeSubstitution: "", attrs };
    });
  }

  function setRolledAttribute(attribute: typeof attributes[number], value: number) {
    if (value && !validRolledAttribute(value)) return;
    setSheet(current => {
      const attributeRolls = { ...current.attributeRolls, [attribute]: value };
      return {
        ...current,
        attributeRolls,
        attrs: {
          ...current.attrs,
          [attribute]: value
            ? Math.min(18, (current.attributeSubstitution === attribute ? 14 : value) + current.attributeBoosts[attribute])
            : 0,
        },
      };
    });
  }

  function setAttributeSubstitution(attribute: Sheet["attributeSubstitution"]) {
    setSheet(current => ({
      ...current,
      attributeSubstitution: attribute,
      attrs: Object.fromEntries(attributes.map(name => [
        name,
        current.attributeRolls[name]
          ? Math.min(18, (name === attribute ? 14 : current.attributeRolls[name]) + current.attributeBoosts[name])
          : 0,
      ])) as Sheet["attrs"],
    }));
  }

  function setArrayAttribute(attribute: typeof attributes[number], value: number) {
    if (!standardAttributeArray.includes(value as typeof standardAttributeArray[number])) return;
    setSheet(current => {
      const baseScore = (name: typeof attributes[number]) => current.attrs[name] - current.attributeBoosts[name];
      const otherAttribute = attributes.find(name => name !== attribute && baseScore(name) === value);
      const priorValue = baseScore(attribute);
      const attrs = {
        ...current.attrs,
        [attribute]: Math.min(18, value + current.attributeBoosts[attribute]),
      };
      if (otherAttribute) attrs[otherAttribute] = Math.min(18, priorValue + current.attributeBoosts[otherAttribute]);
      return { ...current, attrs };
    });
  }

  function selectBackground(background: string) {
    // Background results are specific to a package. Reset only those results;
    // character purchases, inventory, notes, and all unrelated data remain.
    setSheet(current => ({
      ...current,
      background,
      backgroundCombatSkill: "",
      backgroundQuickSkillReplacements: blankBackgroundQuickSkillReplacements(background),
      backgroundDevelopmentMethod: current.backgroundDevelopmentMethod === "review" ? "quick" : current.backgroundDevelopmentMethod,
      backgroundLearningPicks: blankBackgroundLearningPicks(),
      backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
      backgroundDevelopmentLegacy: undefined,
    }));
  }

  function selectBackgroundDevelopmentMethod(method: Exclude<BackgroundDevelopmentMethod, "review">) {
    setSheet(current => ({ ...current, backgroundDevelopmentMethod: method, backgroundDevelopmentLegacy: undefined }));
  }

  function setBackgroundRollTable(index: number, table: BackgroundDevelopmentRoll["table"]) {
    setSheet(current => ({
      ...current,
      backgroundDevelopmentRolls: current.backgroundDevelopmentRolls.map((roll, row) => row === index ? blankBackgroundDevelopmentRoll(table) : roll),
    }));
  }

  function rollBackgroundDevelopmentRow(index: number) {
    setSheet(current => {
      const existing = current.backgroundDevelopmentRolls[index] || blankBackgroundDevelopmentRoll();
      const rolled = rollBackgroundTable(current.background, existing.table);
      return {
        ...current,
        backgroundDevelopmentRolls: current.backgroundDevelopmentRolls.map((roll, row) => row === index ? rolled : roll),
      };
    });
  }

  function setBackgroundAttributePoint(rowIndex: number, pointIndex: number, attribute: AttributeName) {
    setSheet(current => {
      const row = current.backgroundDevelopmentRolls[rowIndex];
      if (!row) return current;
      const result = resolvedBackgroundRollResult(current.background, row);
      const permitted = backgroundAttributeChoices(result) as AttributeName[];
      const pointCount = backgroundAttributePointCount(result);
      if (!permitted.includes(attribute) || pointIndex < 0 || pointIndex >= pointCount) return current;
      const currentChoice = row.attributeChoices[pointIndex];
      const growth = backgroundAttributeGrowth(current);
      const currentScore = (current.attrs[attribute] || 0) + growth[attribute];
      if (currentChoice !== attribute && currentScore >= 18) return current;
      const attributeChoices = [...row.attributeChoices];
      attributeChoices[pointIndex] = attribute;
      return {
        ...current,
        backgroundDevelopmentRolls: current.backgroundDevelopmentRolls.map((roll, index) => index === rowIndex
          ? { ...roll, attributeChoices: attributeChoices.slice(0, pointCount) }
          : roll),
      };
    });
  }

  async function uploadPortrait(file?: File) {
    if (!file) return;
    if (!signedIn) {
      requireSignIn("upload a portrait");
      return;
    }
    if (!canEdit) {
      setTransferMessage("Only this character’s owner can replace its portrait.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setTransferMessage("Choose an image file for the character portrait.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setTransferMessage("Portrait images must be smaller than 5 MB.");
      return;
    }
    try {
      const source = await createImageBitmap(file);
      const maxSide = 640;
      const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      source.close();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!blob) throw new Error("Portrait conversion failed.");
      if (!cloudId || cloudVersion === null) {
        const portrait = await blobToDataURL(blob);
        patch("portrait", portrait);
        setTransferMessage("Portrait added to this browser copy. It will upload after the character is added to My Characters.");
      } else {
        const uploaded = await uploadPortraitBlob(blob, cloudId, cloudVersion);
        const nextSheet = { ...sheet, portrait: uploaded.url };
        setSheet(nextSheet);
        setCloudVersion(uploaded.version);
        lastCloudData.current = JSON.stringify(nextSheet);
        setSaved("Saved online");
        setTransferMessage("Character portrait updated.");
      }
    } catch {
      setTransferMessage("That image could not be used. Try a JPG, PNG, or WebP file.");
    } finally {
      if (portraitInput.current) portraitInput.current.value = "";
    }
  }

  function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(blob);
    });
  }

  async function uploadPortraitBlob(blob: Blob, publicId: string, version: number) {
    const response = await fetch(`/api/characters/${publicId}/portrait`, {
      method: "POST",
      headers: {
        "content-type": blob.type || "image/jpeg",
        "x-character-version": String(version),
      },
      body: blob,
    });
    const payload = await response.json() as { url?: string; version?: number; error?: string };
    if (!response.ok || !payload.url || !payload.version) {
      throw new Error(payload.error || "Portrait upload failed.");
    }
    return { url: payload.url, version: Number(payload.version) };
  }

  async function removePortrait() {
    if (!signedIn) {
      requireSignIn("remove a portrait");
      return;
    }
    if (!canEdit) {
      setTransferMessage("Only this character’s owner can remove its portrait.");
      return;
    }
    if (!cloudId || cloudVersion === null) {
      patch("portrait", "");
      return;
    }
    const response = await fetch(`/api/characters/${cloudId}/portrait`, {
      method: "DELETE",
      headers: { "x-character-version": String(cloudVersion) },
    });
    const payload = await response.json() as { version?: number; error?: string };
    if (!response.ok || !payload.version) {
      setTransferMessage(payload.error || "The portrait could not be removed.");
      return;
    }
    const nextSheet = { ...sheet, portrait: "" };
    setSheet(nextSheet);
    setCloudVersion(Number(payload.version));
    lastCloudData.current = JSON.stringify(nextSheet);
    setSaved("Saved online");
    setTransferMessage("Character portrait removed.");
  }

  function takeRest() {
    const healing = sheet.frail ? 0 : Math.max(0, Math.min(sheet.level || 0, calculatedHpMax - sheet.hpCurrent));
    const strainRecovery = !sheet.frail && sheet.strainCurrent > 0 ? 1 : 0;
    const castings = sheet.spellPicks.reduce((total, pick) => total + spellCastCount(pick), 0);
    const recoverableArtEffort = sheet.artPicks.map((name, index) =>
      artEffortRestRecovers(creationArtForSelection(availableArts, name)?.text || "")
        ? artEffortCommitmentCount(sheet.artEffort[index]) : 0);
    const effort = artEffortTotal(recoverableArtEffort);
    const sustainedEffort = artEffortTotal(sheet.artEffort) - effort;
    const familiarRefreshes = [...sheet.companions, ...sheet.archivedCompanions]
      .filter(companion => companion.kind === "familiar" && companion.effortRefreshUsed)
      .length;
    const details = [
      healing ? `heal ${healing} HP` : sheet.frail ? "restore no HP (Frail characters cannot heal naturally)" : "restore no HP",
      strainRecovery ? "remove 1 System Strain" : sheet.frail ? "remove no System Strain (Frail characters cannot recover Strain naturally)" : "remove no System Strain",
      castings ? `restore ${castings} spell casting${castings === 1 ? "" : "s"}` : "restore no spent spell castings",
      effort ? `recover ${effort} scene/day Effort` : "recover no scene/day Art Effort",
      sustainedEffort ? `keep ${sustainedEffort} ongoing Art Effort committed` : "",
      familiarRefreshes ? "reset the Spirit Familiar’s daily Effort refresh" : "",
    ].filter(Boolean).join(", ");
    if (!window.confirm(`Take a good night's rest?\n\nThis will ${details}. Prepared spells and other character details will not change.`)) return;
    const resetFamiliarRefresh = (companion: Companion) =>
      companion.kind === "familiar" && companion.effortRefreshUsed
        ? { ...companion, effortRefreshUsed: false }
        : companion;
    setSheet(current => ({
      ...current,
      hpCurrent: Math.min(calculatedHpMax, current.hpCurrent + (current.frail ? 0 : Math.max(0, current.level || 0))),
      strainCurrent: Math.max(0, current.strainCurrent - (current.frail ? 0 : 1)),
      spellPicks: current.spellPicks.map(pick => ({ ...pick, cast: false, casts: 0 })),
      artEffort: current.artPicks.map((name, index) =>
        artEffortRestRecovers(creationArtForSelection(availableArts, name)?.text || "")
          ? 0 : artEffortCommitmentCount(current.artEffort[index])),
      effortUsed: 0,
      companions: current.companions.map(resetFamiliarRefresh),
      archivedCompanions: current.archivedCompanions.map(resetFamiliarRefresh),
    }));
    setTransferMessage("Rest complete: HP, System Strain, spell castings, scene/day Art Effort, and familiar refreshes updated. Sustained Art Effort remains committed until released.");
  }

  async function refreshLibrary(scope = libraryScope, query = libraryQuery) {
    if (scope === "mine" && !signedIn) {
      setLibrary([]);
      setLibraryError("Sign in with Google to view My Characters.");
      return;
    }
    if (scope === "all" && !isAdmin) {
      setLibrary([]);
      setLibraryError("Administrator access is required to view all characters.");
      return;
    }
    setLibraryBusy(true);
    setLibraryError("");
    try {
      const search = scope !== "mine" && query.trim()
        ? `&q=${encodeURIComponent(query.trim())}`
        : "";
      const response = await fetch(`/api/characters?scope=${scope}${search}`, { cache: "no-store" });
      const payload = await response.json() as { characters?: LibraryCharacter[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setLibrary(payload.characters || []);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "The character library could not be loaded.");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function openCloudCharacter(
    id: string,
    options: { updateHistory?: boolean } = {},
  ) {
    setLibraryBusy(true);
    setLibraryError("");
    try {
      const response = await fetch(`/api/characters/${id}`, { cache: "no-store" });
      const payload = await response.json() as {
        character?: Partial<Sheet>;
        version?: number;
        visibility?: CharacterVisibility;
        archivedAt?: string | null;
        permissions?: { canEdit: boolean; adminReadOnly: boolean };
        campaigns?: CharacterCampaignLink[];
        error?: string;
      };
      if (!response.ok || !payload.character) throw new Error(payload.error);
      const merged = normalizeIncomingSheet(payload.character);
      lastCloudData.current = JSON.stringify(merged);
      setSheet(merged);
      setCloudId(id);
      setCloudVersion(Number(payload.version));
      setCloudVisibility(payload.visibility || "private");
      setCloudArchivedAt(payload.archivedAt ?? null);
      setCloudCanEdit(Boolean(payload.permissions?.canEdit));
      setCloudAdminReadOnly(Boolean(payload.permissions?.adminReadOnly));
      setCampaignLinks(Array.isArray(payload.campaigns) ? payload.campaigns : []);
      setSaved(payload.permissions?.canEdit ? "Saved online" : "Read-only");
      setCharacterEditMode(false);
      characterEditSnapshot.current = null;
      window.sessionStorage.removeItem(guidedNewRecordStorageKey(id));
      guidedCreationNewRecord.current = false;
      setCreationEntry("none");
      setLibraryOpen(false);
      if (options.updateHistory !== false && window.location.pathname !== `/character/${id}`) {
        window.history.pushState({ characterId: id }, "", `/character/${id}`);
      }
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "The character could not be opened.");
    } finally {
      setLibraryBusy(false);
    }
  }

  async function addCurrentToLibrary(
    character = sheet,
    options: { keepBuildEditing?: boolean } = {},
  ) {
    if (!signedIn) {
      requireSignIn("add a character to My Characters");
      return;
    }
    setSaved("Saving online…");
    try {
      const portraitSource = character.portrait;
      const response = await fetch("/api/characters", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ character: { ...character, portrait: "" } }),
      });
      const payload = await response.json() as {
        id?: string;
        version?: number;
        visibility?: CharacterVisibility;
        error?: string;
      };
      if (!response.ok || !payload.id) throw new Error(payload.error);
      let nextVersion = Number(payload.version);
      let nextCharacter = { ...character, portrait: "" };
      if (portraitSource?.startsWith("data:image/") || portraitSource?.startsWith("/api/portraits/")) {
        const portraitBlob = await (await fetch(portraitSource)).blob();
        const uploaded = await uploadPortraitBlob(portraitBlob, payload.id, nextVersion);
        nextVersion = uploaded.version;
        nextCharacter = { ...character, portrait: uploaded.url };
      }
      setSheet(nextCharacter);
      setCloudId(payload.id);
      setCloudVersion(nextVersion);
      setCloudVisibility(payload.visibility || "private");
      setCloudCanEdit(true);
      setCloudAdminReadOnly(false);
      setCampaignLinks([]);
      lastCloudData.current = JSON.stringify(nextCharacter);
      if (guidedCreationNewRecord.current) {
        window.sessionStorage.setItem(guidedNewRecordStorageKey(payload.id), "1");
      }
      setSaved("Saved online");
      if (options.keepBuildEditing) {
        characterEditSnapshot.current = structuredClone(nextCharacter);
        setCharacterEditMode(true);
      } else {
        characterEditSnapshot.current = null;
        setCharacterEditMode(false);
      }
      window.history.pushState(
        { characterId: payload.id },
        "",
        withGuidedCreationMode(
          `/character/${payload.id}`,
          guidedCreationModeFromUrl(window.location.href),
        ),
      );
      setLibraryScope("mine");
      await refreshLibrary("mine");
      setLibraryOpen(false);
    } catch (error) {
      setSaved("Not saved online");
      setLibraryError(error instanceof Error ? error.message : "The character could not be added.");
    }
  }

  async function saveToCloud(): Promise<boolean> {
    if (!signedIn || !canEdit || !cloudId || cloudVersion === null) return false;
    setSaved("Saving online…");
    try {
      let character = sheet;
      let expectedVersion = cloudVersion;
      if (character.portrait?.startsWith("data:image/")) {
        const portraitBlob = await (await fetch(character.portrait)).blob();
        const uploaded = await uploadPortraitBlob(portraitBlob, cloudId, expectedVersion);
        expectedVersion = uploaded.version;
        character = { ...character, portrait: uploaded.url };
        setSheet(character);
        setCloudVersion(expectedVersion);
      }
      const savingData = JSON.stringify(character);
      const response = await fetch(`/api/characters/${cloudId}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ character, version: expectedVersion }),
      });
      const payload = await response.json() as { version?: number; updatedAt?: string; error?: string };
      if (response.status === 409) {
        setSaved("Newer online copy found");
        setTransferMessage("Someone else saved this character while you were editing. Your changes are still on this screen. Open the shared library and choose whether to reload the online copy or duplicate this one.");
        return false;
      }
      if (!response.ok) throw new Error(payload.error);
      lastCloudData.current = savingData;
      setCloudVersion(Number(payload.version));
      setSaved(`Saved online at ${new Date(String(payload.updatedAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      void refreshLibrary("mine");
      return true;
    } catch (error) {
      setSaved("Not saved online");
      setTransferMessage(error instanceof Error ? error.message : "The character could not be saved.");
      return false;
    }
  }

  function beginCharacterEdit() {
    if (!cloudId || !canEdit || cloudArchivedAt) return;
    characterEditSnapshot.current = structuredClone(sheet);
    setCharacterEditMode(true);
    setTransferMessage("Foundational character fields are unlocked. Save or cancel when you are finished.");
  }

  async function saveCharacterEdits() {
    if (!characterEditMode) return;
    const succeeded = await saveToCloud();
    if (!succeeded) return;
    characterEditSnapshot.current = null;
    setCharacterEditMode(false);
    setCreationEntry("none");
    setTransferMessage("Character-building changes saved. Foundational fields are locked again.");
  }

  function cancelCharacterEdits() {
    const snapshot = characterEditSnapshot.current;
    if (snapshot) setSheet(current => restoreCharacterBuildFields(current, snapshot));
    characterEditSnapshot.current = null;
    setCharacterEditMode(false);
    setCreationEntry("none");
    setTransferMessage("Character-building changes discarded. Play-state changes were kept.");
  }

  async function changeVisibility(visibility: CharacterVisibility) {
    if (!signedIn || !canEdit || !cloudId) return;
    const previous = cloudVisibility;
    setCloudVisibility(visibility);
    try {
      const response = await fetch(`/api/characters/${cloudId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const payload = await response.json() as { visibility?: CharacterVisibility; error?: string };
      if (!response.ok || !payload.visibility) throw new Error(payload.error);
      setCloudVisibility(payload.visibility);
      setTransferMessage(
        payload.visibility === "private"
          ? "This character is private and visible only to you."
          : payload.visibility === "unlisted"
            ? "Anyone with the stable link can view this character."
            : "This character is public and appears in Public Characters.",
      );
      void refreshLibrary("mine");
    } catch (error) {
      setCloudVisibility(previous);
      setTransferMessage(error instanceof Error ? error.message : "Visibility could not be changed.");
    }
  }

  async function restoreArchivedCharacter() {
    if (!signedIn || !canEdit || !cloudId || !cloudArchivedAt) return;
    try {
      const response = await fetch(`/api/characters/${cloudId}/archive`, { method: "DELETE" });
      const payload = await response.json() as { archivedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "The character could not be restored.");
      setCloudArchivedAt(null);
      setTransferMessage("Character restored to your active roster.");
      void refreshLibrary("mine");
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "The character could not be restored.");
    }
  }

  async function copyShareLink() {
    if (!cloudId || cloudVisibility === "private") return;
    const shareURL = `${CANONICAL_ORIGIN}/character/${cloudId}`;
    try {
      await navigator.clipboard.writeText(shareURL);
      setTransferMessage("Canonical character link copied.");
    } catch {
      window.prompt("Copy this character link:", shareURL);
    }
  }

  function beginNewCharacter(mode: "guided" | "blank") {
    if (!signedIn) {
      requireSignIn("create a character");
      return;
    }
    const fresh = {
      ...createBlankSheet(),
      ...(mode === "guided" ? { level: 1 } : {}),
    };
    setSheet(fresh);
    setCreationEntry(mode);
    guidedCreationNewRecord.current = mode === "guided";
    if (mode === "guided") {
      window.localStorage.removeItem("twe-guided-creation:last-step:new-character");
    }
    setGuidedCreationMode(mode === "guided", "replace");
    setCloudId(null);
    setCloudVersion(null);
    setCloudVisibility("private");
    setCloudCanEdit(true);
    setCloudAdminReadOnly(false);
    setCampaignLinks([]);
    lastCloudData.current = "";
    characterEditSnapshot.current = mode === "blank" ? structuredClone(fresh) : null;
    setCharacterEditMode(mode === "blank");
    void addCurrentToLibrary(fresh, { keepBuildEditing: mode === "blank" });
  }

  function closeGuidedCreation(finished = false) {
    if (finished) {
      const completion = levelOneCreationStatus(sheet);
      if (!completion.canFinish) {
        setTransferMessage("Finish is blocked until the remaining level-1 choices are complete.");
        return;
      }
      setSheet(current => ({
        ...current,
        hpMax: completion.startingHp || current.hpMax,
        hpCurrent: current.hpCurrent || completion.startingHp,
      }));
      setCharacterEditMode(false);
      characterEditSnapshot.current = null;
      if (cloudId) window.sessionStorage.removeItem(guidedNewRecordStorageKey(cloudId));
      guidedCreationNewRecord.current = false;
      setCreationEntry("none");
      setTransferMessage("Guided creation is complete. Foundational choices are locked; use Edit Character at the bottom if they need correction.");
    } else {
      guidedCreationNewRecord.current = false;
      setCreationEntry("none");
      setTransferMessage("Guided creation closed. Every choice remains saved on this character.");
    }
    setTab("core");
    setGuidedCreationMode(false, "replace");
  }

  async function cancelGuidedCreation() {
    if (!window.confirm("Cancel character creation?\n\nThis discards the unfinished character and removes it from My Characters.")) return;
    if (guidedCreationNewRecord.current && cloudId) {
      const deleted = await deleteCharacter(cloudId, sheet.name, { skipConfirmation: true });
      if (!deleted) return;
    }
    guidedCreationNewRecord.current = false;
    if (cloudId) window.sessionStorage.removeItem(guidedNewRecordStorageKey(cloudId));
    window.localStorage.removeItem(`twe-guided-creation:last-step:${cloudId || "new-character"}`);
    window.localStorage.removeItem("wwn-cecil-sheet");
    setCloudId(null);
    setCloudVersion(null);
    setCloudVisibility("private");
    setCloudCanEdit(false);
    setCloudAdminReadOnly(false);
    setCampaignLinks([]);
    lastCloudData.current = "";
    setCreationEntry("none");
    setCharacterEditMode(false);
    characterEditSnapshot.current = null;
    setTab("core");
    setWizardOpen(false);
    setGuidedCreationMode(false, "replace");
    setTransferMessage("Character creation cancelled.");
    window.location.assign("/");
  }

  async function commitLevelUp(nextCharacter: Sheet, sourceLevel: number) {
    if (!cloudId || cloudVersion === null || !canEdit || cloudArchivedAt) {
      setTransferMessage("Level-up is available only for an active character you own.");
      return false;
    }
    setSaved("Applying level-up…");
    try {
      const currentResponse = await fetch(`/api/characters/${cloudId}`, { cache: "no-store" });
      const currentPayload = await currentResponse.json() as { character?: Partial<Sheet>; version?: number; error?: string };
      if (!currentResponse.ok || !currentPayload.character || !Number.isInteger(currentPayload.version)) throw new Error(currentPayload.error || "The character could not be checked before level-up.");
      if (Number(currentPayload.version) !== cloudVersion) {
        setSaved("Newer online copy found");
        setTransferMessage("This character changed elsewhere while the level-up wizard was open. No advancement was saved; reload the current sheet first.");
        return false;
      }
      if (Number(currentPayload.character.level) !== sourceLevel) {
        setSaved("Newer online copy found");
        setTransferMessage(`This character is no longer level ${sourceLevel}. Reload the current sheet before trying to advance it again.`);
        return false;
      }
      const response = await fetch(`/api/characters/${cloudId}`, {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ character: nextCharacter, version: currentPayload.version }),
      });
      const payload = await response.json() as { version?: number; error?: string };
      if (response.status === 409) {
        setSaved("Newer online copy found");
        setTransferMessage("This character changed in another tab before the level-up could be applied. No advancement was saved.");
        return false;
      }
      if (!response.ok || !payload.version) throw new Error(payload.error || "The level-up could not be saved.");
      const normalized = normalizeIncomingSheet(nextCharacter);
      setSheet(normalized);
      setCloudVersion(Number(payload.version));
      lastCloudData.current = JSON.stringify(normalized);
      setSaved("Saved online");
      setTransferMessage(`Level ${sourceLevel} → ${sourceLevel + 1} saved successfully.`);
      setLevelUpMode(false, "replace");
      setTab("core");
      void refreshLibrary("mine");
      return true;
    } catch (error) {
      setSaved("Not saved online");
      setTransferMessage(error instanceof Error ? error.message : "The level-up could not be saved.");
      return false;
    }
  }

  async function duplicateCharacter(id: string) {
    if (!signedIn) {
      requireSignIn("duplicate a character into My Characters");
      return;
    }
    const response = await fetch(`/api/characters/${id}`, { cache: "no-store" });
    const payload = await response.json() as { character?: Sheet; error?: string };
    if (!response.ok || !payload.character) {
      setLibraryError(payload.error || "The character could not be duplicated.");
      return;
    }
    await addCurrentToLibrary({ ...payload.character, name: `${payload.character.name} (Copy)` });
  }

  async function deleteCharacter(id: string, name: string, options: { skipConfirmation?: boolean } = {}): Promise<boolean> {
    if (!signedIn) {
      requireSignIn("delete a character");
      return false;
    }
    const characterName = name.trim() || "this unnamed character";
    if (!options.skipConfirmation && !window.confirm(`Delete ${characterName} from My Characters?\n\nThis cannot be undone.`)) return false;
    const response = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setLibraryError(payload.error || "The character could not be deleted.");
      return false;
    }
    if (cloudId === id) {
      setCloudId(null);
      setCloudVersion(null);
      setCloudVisibility("private");
      setCloudCanEdit(false);
      setCloudAdminReadOnly(false);
      setCampaignLinks([]);
      lastCloudData.current = "";
      setSaved("Deleted online");
      window.history.pushState({}, "", "/");
    }
    await refreshLibrary("mine");
    return true;
  }

  const moveItem = (kind: "spell" | "art", from: number, to: number) => {
    if (from === to) return;
    setSheet(current => {
      const key = kind === "spell" ? "spellPicks" : "artPicks";
      const reordered = [...current[key]] as (SpellPick | string)[];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      if (kind === "art") {
        const reorderedEffort = [...current.artEffort];
        const [movedEffort] = reorderedEffort.splice(from, 1);
        reorderedEffort.splice(to, 0, movedEffort);
        return { ...current, artPicks: reordered as string[], artEffort: reorderedEffort };
      }
      return { ...current, spellPicks: reordered as SpellPick[] };
    });
    setDragging({ kind, index: to });
  };
  const beginPointerDrag = (kind: "spell" | "art", index: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({ kind, index });
  };
  const continuePointerDrag = (kind: "spell" | "art", e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || dragging.kind !== kind) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(`[data-drag-kind="${kind}"]`);
    const targetIndex = Number(target?.dataset.dragIndex);
    if (Number.isInteger(targetIndex) && targetIndex !== dragging.index) moveItem(kind, dragging.index, targetIndex);
  };
  const effectiveLevel = Math.min(10, Math.max(1, sheet.level || 1));
  const selectedClasses = (sheet.classMode === "full" ? [sheet.classOne] : [sheet.classOne, sheet.classTwo]).filter(Boolean);
  const startingFocusSelections = sheet.classOne
    ? classRules(sheet.classMode, sheet.classOne, sheet.classTwo, 1).focusPicks +
      (selectedClasses.includes("Mageslayer") ? 1 : 0)
    : 0;
  const selectedFocusPicks = sheet.focusPicks.filter(pick => Boolean(pick.name));
  const magicalTraditions = selectedClasses.filter(c => c in traditionInfo) as TraditionName[];
  const armorRestrictedTraditions = magicalTraditions.filter(tradition => armorRestrictsMagic(traditionInfo[tradition].armor));
  const isMageClass = selectedClasses.some(name => traditionKinds[name] === "mage");
  const isExpertClass = selectedClasses.includes("Expert") || selectedClasses.includes("Wise");
  const backgroundGrowth = backgroundAttributeGrowth(sheet);
  const attributeScore = (attribute: AttributeName) => Math.min(18, Math.max(0, sheet.attrs[attribute] + backgroundGrowth[attribute]));
  const hasNegativeAttribute = hasNegativeEffectiveAttributeModifier(attribute => attributeScore(attribute as AttributeName), sheet.focusPicks);
  const focusRepeatAllowed = focusIsRepeatable;
  const focusEligibility = (name: string, slotIndex: number) => {
    if (!name) return { eligible: true, reason: "" };
    const currentPick = sheet.focusPicks[slotIndex];
    const existing = sheet.focusPicks.some((pick, index) => index !== slotIndex && pick.name === name);
    const spiritRows = sheet.focusPicks
      .map((pick, index) => ({ pick, index }))
      .filter(({ pick }) => pick.name === "Spirit Familiar");
    const firstSpiritIndex = spiritRows[0]?.index ?? -1;
    const addingSpiritRepeat = name === "Spirit Familiar" && currentPick?.name !== name && spiritRows.length > 0;
    const existingSpiritRepeat = name === "Spirit Familiar" && currentPick?.name === name && slotIndex !== firstSpiritIndex;
    if (addingSpiritRepeat || existingSpiritRepeat) {
      const firstSpirit = firstSpiritIndex >= 0 ? sheet.focusPicks[firstSpiritIndex] : undefined;
      if (existingSpiritRepeat && Number(currentPick?.level) < 2) {
        return { eligible: false, reason: "Only Spirit Familiar level 2 can be repeated." };
      }
      if (effectiveLevel < 2 || (firstSpirit?.level || 1) < 2) {
        return { eligible: false, reason: "Spirit Familiar level 2 must be taken before its level-2 benefits can be repeated." };
      }
      const levelTwoSelections = spiritRows.filter(({ pick }) => pick.level >= 2).length + (addingSpiritRepeat ? 1 : 0);
      if (levelTwoSelections > spiritFamiliarLevelTwoSelectionLimit(effectiveLevel)) {
        return { eligible: false, reason: "This character has already taken every Spirit Familiar level-2 repeat available by this level." };
      }
    }
    if (existing && !focusRepeatAllowed(name)) return { eligible: false, reason: "This Focus can only be taken once." };
    if (name === "Developed Attribute" && isMageClass) return { eligible: false, reason: "Mages and partial Mages cannot take Developed Attribute." };
    if (name === "Armored Magic" && !armorRestrictedTraditions.length) return { eligible: false, reason: "Armored Magic is only available to Mages whose spells or arts are normally hindered by armor." };
    if (name === "Lucky" && !hasNegativeAttribute) return { eligible: false, reason: "Lucky requires at least one attribute modifier of −1 or less." };
    if (name === "Nullifier" && isMageClass) return { eligible: false, reason: "Mages and partial Mages cannot take Nullifier." };
    if (name === "Polymath" && !isExpertClass) return { eligible: false, reason: "Only Experts or partial Experts can take Polymath." };
    if (name === "Traditional Education" && !selectedClasses.includes("Invoker")) return { eligible: false, reason: "Only an Invoker can take Traditional Education." };
    const candidateLevel = addingSpiritRepeat ? 2 : Math.max(1, Math.min(2, currentPick?.level || 1));
    const candidatePicks = sheet.focusPicks.map((pick, index) =>
      index === slotIndex ? { ...pick, name, level: candidateLevel } : pick);
    if (focusSelectionCost(candidatePicks) > allowedFocusPicks) {
      return { eligible: false, reason: "There are not enough Focus picks remaining." };
    }
    return { eligible: true, reason: "" };
  };
  const castingTraditions = magicalTraditions.filter(t => traditionInfo[t].spells);
  const isInvoker = castingTraditions.includes("Invoker");
  const traditionalEducation = selectedFocusPicks.find(pick => pick.name === "Traditional Education");
  const traditionalEducationTradition = (["High Mage", "Elementalist", "Necromancer"].includes(traditionalEducation?.choice || "")
    ? traditionalEducation?.choice
    : "") as "" | "High Mage" | "Elementalist" | "Necromancer";
  const artTraditions = [...new Set([...magicalTraditions, ...(traditionalEducationTradition ? [traditionalEducationTradition] : [])])] as TraditionName[];
  const rules = classRules(sheet.classMode, sheet.classOne, sheet.classTwo, effectiveLevel);
  const henchkeeper = selectedFocusPicks.find(pick => pick.name === "Henchkeeper");
  const spiritFamiliars = useMemo(() => sheet.focusPicks
    .map((pick, index) => ({ pick, index }))
    .filter(({ pick }) => pick.name === "Spirit Familiar"), [sheet.focusPicks]);
  const spiritFamiliarBenefitCap = spiritFamiliarBenefitLimit(sheet.focusPicks);
  const hasHenchkeeper = Boolean(henchkeeper);
  const hasSpiritFamiliar = spiritFamiliars.length > 0;
  const hasBeastmaster = selectedClasses.includes("Beastmaster");
  const chosenFriend = hasBeastmaster && sheet.beastmasterBond === "chosen-friend";
  const henchmanCount = henchkeeper ? Math.ceil(Math.max(1, sheet.level) / 3) : 0;
  const companionTabs = sheet.companions.filter(companion =>
    companion.kind === "henchman"
      ? Boolean(henchkeeper)
      : companion.kind === "familiar"
        ? hasSpiritFamiliar
        : hasBeastmaster
  );
  const armoredMagicLevel = selectedFocusPicks.find(pick => pick.name === "Armored Magic")?.level || 0;
  const focusPicksUsed = focusSelectionCost(selectedFocusPicks);
  const developedAttributes = [...new Set(selectedFocusPicks
    .filter(pick => pick.name === "Developed Attribute" && attributes.includes(pick.choice as typeof attributes[number]))
    .map(pick => pick.choice as typeof attributes[number]))];
  const xenobloodedGravity = selectedFocusPicks.find(pick => pick.name === "Xenoblooded")?.choice || "";
  const attributeMod = (attribute: typeof attributes[number]) => {
    let value = mod(attributeScore(attribute));
    if (developedAttributes.includes(attribute)) value = Math.min(3, value + 1);
    if (xenobloodedGravity === "STR +1 / DEX -1") value += attribute === "STR" ? 1 : attribute === "DEX" ? -1 : 0;
    if (xenobloodedGravity === "DEX +1 / STR -1") value += attribute === "DEX" ? 1 : attribute === "STR" ? -1 : 0;
    return Math.min(3, value);
  };
  const minimumSkillSources = skillSourcesFor(sheet);
  const focusCreditAtCap = (skill: string, priorCredits: Readonly<Record<string, number>>) =>
    deriveSkillProfile({
      purchased: sheet.skillPurchases[skill] ?? -1,
      sourceCount: minimumSkillSources[skill]?.length ?? 0,
      credit: priorCredits[skill] || 0,
    }).effective >= 4;
  const advancementSkillCredits = advancementSkillCreditBySkill(sheet, focusCreditAtCap);
  const backgroundGrantResolutions = backgroundSkillGrantResolutions(sheet);
  const backgroundGrantResolution = (id: string, candidate = sheet) =>
    backgroundSkillGrantResolutions(candidate).find(grant => grant.id === id);
  const activeBackground = backgrounds[sheet.background];
  const backgroundCombatGrantId = activeBackground?.freeSkill.startsWith("Any Combat")
    ? "background-free"
    : sheet.backgroundDevelopmentMethod === "quick"
      ? (() => {
          const quickIndex = activeBackground?.quickSkills.findIndex(entry => entry.startsWith("Any Combat")) ?? -1;
          return quickIndex >= 0 ? `quick-${quickIndex}` : "";
        })()
      : "";
  const minimumSkillRanks = Object.fromEntries(skills.map(skill => [
    skill,
    minimumSkillSources[skill].length >= 2 ? 1 : minimumSkillSources[skill].length === 1 ? 0 : -1,
  ])) as Record<string, number>;
  const polymathLevel = selectedFocusPicks.find(pick => pick.name === "Polymath")?.level || 0;
  const skillProfile = (skill: string, purchases = sheet.skillPurchases) => {
    const sourceCount = minimumSkillSources[skill].length;
    const polymathFloor = noncombatSkills.includes(skill) && polymathLevel ? (polymathLevel >= 2 ? 1 : 0) : -1;
    return deriveSkillProfile({ purchased: purchases[skill], sourceCount, polymathFloor, credit: advancementSkillCredits[skill] || 0 });
  };
  const effectiveSkill = (skill: string) => skillProfile(skill).effective;
  const skillPointAllowance = Math.max(0, (effectiveLevel - 1) * (selectedClasses.includes("Expert") ? 4 : 3));
  const calculateSkillSpending = (values: Record<string, number>) => {
    const profiles = Object.fromEntries(skills.map(skill => [skill, skillProfile(skill, values)])) as Record<string, ReturnType<typeof skillProfile>>;
    const effectiveValues = Object.fromEntries(skills.map(skill => [skill, profiles[skill].granted])) as Record<string, number>;
    let freePickSkill = "";
    let freePickValue = 0;
    skills.forEach(skill => {
      const minimum = minimumSkillRanks[skill];
      const current = effectiveValues[skill];
      const value = current > minimum && minimum < 1
        ? skillRankCost(Math.min(1, minimum + 1)) - skillRankCost(minimum)
        : 0;
      if (value > freePickValue) {
        freePickValue = value;
        freePickSkill = skill;
      }
    });
    const gross = skills.reduce((total, skill) =>
      total + Math.max(0, skillRankCost(effectiveValues[skill]) - skillRankCost(minimumSkillRanks[skill])), 0);
    return { spent: Math.max(0, gross - freePickValue), freePickSkill, freePickValue, effectiveValues };
  };
  // Quick Learner's extra Expert point cannot be spent on Punch, Shoot, or Stab.
  const combatSkillSpending = (values: Record<string, number>) => {
    const plan = calculateSkillSpending(values);
    const gross = combatSkills.reduce((total, skill) => {
      const rank = skillProfile(skill, values).granted;
      return total + Math.max(0, skillRankCost(rank) - skillRankCost(minimumSkillRanks[skill]));
    }, 0);
    return Math.max(0, gross - (combatSkills.some(skill => skill === plan.freePickSkill) ? plan.freePickValue : 0));
  };
  const combatSkillBudget = Math.max(0, effectiveLevel - 1) * 3;
  const exceedsCombatSkillBudget = (values: Record<string, number>) =>
    selectedClasses.includes("Expert") && combatSkillSpending(values) > combatSkillBudget;
  const skillSpending = calculateSkillSpending(sheet.skillPurchases);
  const attributeBoostCount = attributes.reduce((total, attribute) => total + sheet.attributeBoosts[attribute], 0);
  const attributeBoostCost = attributeImprovementCostForCount(attributeBoostCount);
  const nextAttributeBoostCost = attributeImprovementCostForNext(attributeBoostCount);
  const attributeBoostLimit = effectiveLevel >= 9 ? 5 : effectiveLevel >= 6 ? 4 : effectiveLevel >= 3 ? 3 : 2;
  const availableSkillPoints = Math.max(0, skillPointAllowance - attributeBoostCost);
  const advancementPointsSpent = skillSpending.spent + attributeBoostCost;
  const advancementPointsRemaining = Math.max(0, skillPointAllowance - advancementPointsSpent);
  const changeAttributeBoost = (attribute: typeof attributes[number], change: -1 | 1) => {
    const currentBoosts = sheet.attributeBoosts[attribute];
    if (change > 0) {
      const nextCost = attributeImprovementCostForNext(attributeBoostCount);
      if (attributeBoostCount >= attributeBoostLimit || attributeScore(attribute) >= 18) return;
      if (advancementPointsSpent + nextCost > skillPointAllowance) return;
    } else if (currentBoosts <= 0) {
      return;
    }
    setSheet({
      ...sheet,
      attributeBoosts: { ...sheet.attributeBoosts, [attribute]: currentBoosts + change },
      attrs: { ...sheet.attrs, [attribute]: sheet.attrs[attribute] + change },
    });
  };
  const maxSkillRank = skillRankCap(effectiveLevel);
  const limits = isInvoker && castingTraditions.length === 1
    ? invokerLimits(effectiveLevel, sheet.classMode === "adventurer", attributeMod("INT"))
    : castingTraditions.length > 1
    ? {...dualCasterLimits(effectiveLevel), arts: 0}
    : castingTraditions.length ? casterLimits(effectiveLevel, sheet.classMode === "adventurer") : { max: 0, casts: 0, prepared: 0, arts: 0 };
  const baseAttack = sheet.classOne ? rules.attack : 0;
  const campaignWornArmor = campaignInventoryArmor(sheet.armor);
  const officialWornArmor = armors.find(armor => armor.name === sheet.armor);
  const armorBase = campaignWornArmor?.ac ?? officialWornArmor?.ac ?? 10;
  const wornArmor = campaignWornArmor ?? officialWornArmor ?? armors[0];
  const campaignShield = campaignInventoryArmor(sheet.shield);
  const shieldBase = sheet.shield === "Small Shield" ? 13 : sheet.shield === "Large Shield" ? 14
    : campaignShield?.shield === "small" ? campaignShield.ac
      : campaignShield?.shield === "large" ? campaignShield.ac
        : 0;
  const hasShield = Boolean(shieldBase);
  const castingBlocked = armorRestrictedTraditions.length > 0 && (
    armoredMagicLevel === 0
      ? wornArmor.name !== "No Armor" || hasShield
      : armoredMagicLevel === 1 && wornArmor.enc > 2
  );
  const castingBlockedReason = castingBlocked
    ? armoredMagicLevel === 1
      ? `${wornArmor.name} has Encumbrance ${wornArmor.enc}; Armored Magic level 1 only permits armor of Encumbrance 2 or less.`
      : `${wornArmor.name !== "No Armor" ? wornArmor.name : sheet.shield} prevents spellcasting without Armored Magic.`
    : "";
  const shieldAdjustedBase = applyShieldToArmorBase(armorBase, shieldBase);
  const imperviousDefense = selectedFocusPicks.some(pick => pick.name === "Impervious Defense");
  const naturalArmorBase = imperviousDefense ? 15 + Math.ceil(effectiveLevel / 2) : 0;
  const bestArmorBase = Math.max(shieldAdjustedBase, naturalArmorBase + (hasShield ? 1 : 0));
  const vowedArmorBase = selectedClasses.includes("Vowed") && wornArmor.name === "No Armor" && !hasShield
    ? 13 + Math.floor(effectiveLevel / 2)
    : 0;
  const coldFleshArmorBase = sheet.artPicks.some(name => artSelectionName(name) === "Cold Flesh") ? 12 + Math.floor(effectiveLevel / 2) : 0;
  const hasFeralToughness = sheet.artPicks.some(name => artSelectionName(name) === "Feral Toughness");
  const feralToughnessArmorBase = hasFeralToughness
    ? applyShieldToArmorBase(feralToughnessBaseArmorClass(effectiveLevel), shieldBase)
    : 0;
  const pavisIndex = sheet.artPicks.findIndex(name => artSelectionName(name) === "Pavis of Elements");
  const pavisActive = pavisIndex >= 0 && Boolean(sheet.artEffort[pavisIndex]);
  const defensiveBase = Math.max(
    bestArmorBase,
    vowedArmorBase,
    coldFleshArmorBase + (hasShield ? 1 : 0),
    feralToughnessArmorBase,
  );
  const calculatedAcBeforePavis = defensiveBase + attributeMod("DEX") + (sheet.armorBonus || 0);
  const calculatedAc = pavisActive ? Math.min(18, calculatedAcBeforePavis + 4) : calculatedAcBeforePavis;
  const calculatedInitiative = attributeMod("DEX");
  const hitPointPerDieBonus = hitPointClassBonus(
    sheet.classMode,
    sheet.classOne,
    sheet.classTwo,
  );
  const enteredHpRolls = sheet.hpRolls.slice(0, effectiveLevel);
  let calculatedHp = 0;
  let hpRollsComplete = Boolean(sheet.level) && enteredHpRolls.length >= effectiveLevel;
  const hasArmsmaster = selectedFocusPicks.some(pick => pick.name === "Armsmaster");
  const hasDieHard = selectedFocusPicks.some(pick => pick.name === "Die Hard");
  for (let index = 0; index < effectiveLevel; index += 1) {
    const rawRoll = Number(enteredHpRolls[index]);
    if (!rawRoll) { hpRollsComplete = false; break; }
    const dice = index + 1;
    const perDieModifier = attributeMod("CON") + hitPointPerDieBonus + (hasDieHard ? 2 : 0);
    const rolledTotal = Math.max(dice, rawRoll + perDieModifier * dice);
    calculatedHp = index === 0 ? rolledTotal : Math.max(calculatedHp + 1, rolledTotal);
  }
  const dieHardBonus = hasDieHard ? effectiveLevel * 2 : 0;
  const feralToughnessCompanion = hasFeralToughness
    ? sheet.companions.find(companion => companion.kind === "beastmaster" && companion.bound)
    : undefined;
  const feralToughnessHitDice = Math.max(0, parseBeastmasterHitDice(feralToughnessCompanion?.hitDice) ?? 0);
  const baseCalculatedHpMax = hpRollsComplete ? calculatedHp : sheet.hpMax;
  const calculatedHpMax = baseCalculatedHpMax + feralToughnessHitDice;
  const availableArts = artTraditions.flatMap(t => {
    const arts = t === "High Mage" ? highMageArts : traditionInfo[t].arts;
    return arts
      .filter(a => t !== "Beastmaster" || beastmasterArtAvailableForBond(a.name, sheet.beastmasterBond))
      .map(a => ({...a, minLevel: "minLevel" in a ? a.minLevel : undefined, tradition:t, value: artSelectionValue(t, a.name)}));
  });
  const forcedArts = artTraditions.flatMap(t =>
    forcedArtsForTraditions([t]).map(name => artSelectionValue(t, name)),
  );
  const repeatableArt = (name: string) => name === "Skilled";
  const artEligibility = (name: string, slotIndex: number) => {
    const art = creationArtForSelection(availableArts, name);
    if (!art) return { eligible: false, reason: "This Art is not available to the character’s traditions." };
    if ((art.minLevel || 1) > effectiveLevel) return { eligible: false, reason: `Requires level ${art.minLevel}.` };
    const missingPrerequisite = missingArtPrerequisite(
      artSelectionName(name),
      sheet.artPicks.map(artSelectionName),
    );
    if (missingPrerequisite) {
      return { eligible: false, reason: `Requires ${missingPrerequisite}.` };
    }
    if (!repeatableArt(artSelectionName(name)) && sheet.artPicks.some((picked, index) => index !== slotIndex && picked === name)) {
      return { eligible: false, reason: "This Art cannot be selected more than once." };
    }
    return { eligible: true, reason: "" };
  };
  const effortPools = artTraditions
    .filter(t => t !== "Invoker" && traditionInfo[t].usesEffort !== false)
    .map(t => {
    const info = traditionInfo[t];
    const skill = t === "Vowed" ? sheet.vowedEffortSkill : info.effortSkill;
    const effortAttributes = info.effortAttributes?.length
      ? info.effortAttributes.filter((attribute): attribute is typeof attributes[number] => attributes.includes(attribute as typeof attributes[number]))
      : t === "Vowed" ? [...attributes] : ["INT", "CHA"] as (typeof attributes[number])[];
    const partialPenalty = sheet.classMode === "adventurer" && traditionInfo[t].spells ? 1 : 0;
    const max = traditionalEducationTradition === t
      ? Math.max(1, effectiveSkill("Magic"))
      : effortMaximum({
          skillLevel: effectiveSkill(skill),
          attributeModifiers: effortAttributes.map((a) => attributeMod(a)),
          effortBase: info.effortBase,
          partialSpellPenalty: partialPenalty,
          usesEffort: info.usesEffort !== false,
        });
    const used = sheet.artPicks.reduce((total, name, index) =>
      creationArtForSelection(availableArts, name)?.tradition === t
        ? total + artEffortCommitmentCount(sheet.artEffort[index])
        : total,
    0);
    return {tradition:t,skill,max,used};
  });
  const availableSpells = [
    ...(castingTraditions.length > 0 || traditionalEducationTradition
      ? highMagic.map(s => ({...s, tradition:"High Magic"}))
      : []),
    ...(castingTraditions.includes("Elementalist") || traditionalEducationTradition === "Elementalist" ? traditionSpells.Elementalist.map(s => ({...s,tradition:"Elementalist"})) : []),
    ...(castingTraditions.includes("Necromancer") || traditionalEducationTradition === "Necromancer" ? traditionSpells.Necromancer.map(s => ({...s,tradition:"Necromancer"})) : []),
  ];
  const spellEligibility = (name: string, slotIndex: number) => {
    const spell = availableSpells.find(candidate => candidate.name === name);
    if (!spell) return { eligible: false, reason: "This spell is not available to the character’s traditions." };
    if (spell.level > limits.max) return { eligible: false, reason: `Requires access to level ${spell.level} spells.` };
    if (sheet.spellPicks.some((picked, index) => index !== slotIndex && picked.name === name)) {
      return { eligible: false, reason: "A spell only needs to be learned once." };
    }
    return { eligible: true, reason: "" };
  };
  const classLabel = !sheet.classOne ? "" : sheet.classMode === "full" ? sheet.classOne : `${sheet.classOne}${sheet.classTwo ? ` / ${sheet.classTwo}` : ""} Adventurer`;
  const artAllowance = magicalTraditions.reduce(
    (total, tradition) => total + artSlots(tradition, effectiveLevel, sheet.classMode === "adventurer"),
    0,
  ) + (traditionalEducationTradition ? artSlots(traditionalEducationTradition, 1, sheet.classMode === "adventurer") : 0);
  const knownSpellAllowance = knownSpellSlots(castingTraditions, effectiveLevel, sheet.classMode === "adventurer");
  const languageAllowance = startingLanguageAllowance(effectiveSkill("Know"), effectiveSkill("Connect"));
  const allowedFocusPicks = sheet.level && sheet.classOne
    ? rules.focusPicks + (selectedClasses.includes("Mageslayer") ? 1 : 0)
    : 0;
  const focusExtraPickCost = Math.max(0, focusPicksUsed - selectedFocusPicks.length);
  const focusSlotCount = Math.max(selectedFocusPicks.length, allowedFocusPicks - focusExtraPickCost);
  const saves = {
    Physical: 16 - sheet.level - Math.max(attributeMod("STR"), attributeMod("CON")),
    Evasion: 16 - sheet.level - Math.max(attributeMod("DEX"), attributeMod("INT")),
    Mental: 16 - sheet.level - Math.max(attributeMod("WIS"), attributeMod("CHA")),
    Luck: 16 - sheet.level,
  };
  const saveDetails = {
    Physical: `16 − level ${sheet.level} − best of STR ${signed(attributeMod("STR"))} / CON ${signed(attributeMod("CON"))}`,
    Evasion: `16 − level ${sheet.level} − best of DEX ${signed(attributeMod("DEX"))} / INT ${signed(attributeMod("INT"))}`,
    Mental: `16 − level ${sheet.level} − best of WIS ${signed(attributeMod("WIS"))} / CHA ${signed(attributeMod("CHA"))}`,
    Luck: `16 − level ${sheet.level}`,
  };
  const preparedCount = sheet.spellPicks.filter(s => s.name && s.prepared).length;
  const castsUsed = spellCastingUse(
    sheet.spellPicks,
    isInvoker,
    name => availableSpells.find(spell => spell.name === name)?.level || 0,
  );
  const readiedCapacity = attributeScore("STR") ? Math.floor(attributeScore("STR") / 2) : 0;
  const stowedCapacity = attributeScore("STR") || 0;
  const readiedSlots = inventorySlots(sheet.readied, readiedCapacity);
  const stowedSlots = inventorySlots(sheet.stowed, stowedCapacity);
  const customInventoryItems = customInventoryItemNames([
    sheet.readied,
    sheet.stowed,
    sheet.stored,
    ...sheet.companions.flatMap(companion => [companion.readied, companion.stowed]),
  ]);
  const readiedWeapons = readiedSlots
    .map((name, inventoryIndex) => ({ name, inventoryIndex }))
    .filter(item => inventoryWeapons.some(weapon => weapon.name === item.name) || Boolean(campaignInventoryWeapon(item.name)));
  const unarmedPrimary = selectedClasses.includes("Vowed") || selectedFocusPicks.some(pick => pick.name === "Unarmed Combatant");
  const displayedWeapons = unarmedPrimary
    ? [{ name: "Unarmed Attack", inventoryIndex: -1 }, ...readiedWeapons]
    : [...readiedWeapons, { name: "Unarmed Attack", inventoryIndex: -1 }];

  const setStowedItem = (index: number, value: string) => {
    if (value === "Unarmed Attack") return;
    patch("stowed", stowedSlots.map((item, itemIndex) => itemIndex === index ? value : item));
  };
  const moveStowedToStored = (index: number) => {
    setOtherStowedIndex(null);
    setOtherStowedDraftName("");
    setSheet(current => {
      const currentStowed = inventorySlots(current.stowed, stowedCapacity);
      const item = currentStowed[index] || "";
      if (!item) return current;
      const nextStowed = compactInventory(currentStowed.filter((_, itemIndex) => itemIndex !== index), stowedCapacity);
      return { ...current, stowed: nextStowed, stored: [...current.stored.filter(stored => stored.trim()), item] };
    });
  };
  const moveStoredToStowed = (index: number) => {
    setSheet(current => {
      const currentStored = current.stored.filter(item => item.trim());
      const item = currentStored[index] || "";
      if (!item) return current;
      const nextStored = currentStored.filter((_, itemIndex) => itemIndex !== index);
      const nextStowed = inventorySlots([...current.stowed.filter(stowed => stowed.trim()), item], stowedCapacity);
      return { ...current, stored: nextStored, stowed: nextStowed };
    });
  };
  type InventoryLocation = "readied" | "stowed" | "stored";
  const moveInventory = (source: InventoryLocation, index: number, destination: InventoryLocation, swapIndex?: number) => {
    if (source === destination) return;
    setSheet(current => {
      const readied = inventorySlots(current.readied, readiedCapacity);
      const stowed = inventorySlots(current.stowed, stowedCapacity);
      const stored = current.stored.filter(Boolean);
      const locations = { readied, stowed, stored };
      const sourceSlots = locations[source];
      const item = sourceSlots[index];
      if (!item) return current;
      if (destination === "stored") {
        sourceSlots.splice(index, 1);
        stored.push(item);
      } else {
        const capacity = destination === "readied" ? readiedCapacity : stowedCapacity;
        const targetSlots = locations[destination];
        const free = targetSlots.findIndex((value, i) => !value && i < capacity);
        const destinationIndex = free >= 0 ? free : swapIndex;
        if (destinationIndex === undefined || destinationIndex < 0 || destinationIndex >= capacity) return current;
        const displaced = targetSlots[destinationIndex] || "";
        targetSlots[destinationIndex] = item;
        if (source === "stored") {
          stored.splice(index, 1);
          if (displaced) stored.push(displaced);
        } else {
          sourceSlots[index] = displaced;
        }
      }
      return { ...current, readied: compactInventory(readied, readiedCapacity), stowed: compactInventory(stowed, stowedCapacity), stored };
    });
    setInventorySwap(null);
  };
  const requestInventoryMove = (source: InventoryLocation, index: number, destination: InventoryLocation) => {
    if (destination === "stored") return moveInventory(source, index, destination);
    const slots = destination === "readied" ? readiedSlots : stowedSlots;
    const capacity = destination === "readied" ? readiedCapacity : stowedCapacity;
    if (slots.some((item, i) => !item && i < capacity)) moveInventory(source, index, destination);
    else if (capacity > 0) setInventorySwap({ source, index, destination });
    else setInventoryNotice(`No ${destination} slots are available at your current Strength.`);
  };
  const addNewInventoryItem = () => {
    const name = inventoryAddValue === "__other__" ? inventoryAddCustom.trim() : inventoryAddValue;
    if (!name || name === "Unarmed Attack") return;
    setSheet(current => {
      const readied = inventorySlots(current.readied, readiedCapacity);
      const stowed = inventorySlots(current.stowed, stowedCapacity);
      const readyIndex = readied.findIndex((item, i) => !item && i < readiedCapacity);
      const stowIndex = stowed.findIndex((item, i) => !item && i < stowedCapacity);
      if (readyIndex >= 0) readied[readyIndex] = name;
      else if (stowIndex >= 0) stowed[stowIndex] = name;
      return { ...current, readied, stowed, stored: readyIndex < 0 && stowIndex < 0 ? [...current.stored.filter(Boolean), name] : current.stored };
    });
    setInventoryNotice(`${inventoryItemDisplayName(name)} added to inventory.`);
    setInventoryAddOpen(false);
    setInventoryAddValue("");
    setInventoryAddCustom("");
  };
  const companionInventoryLabel = (companion: Companion, index: number) =>
    companion.name || (
      companion.kind === "familiar"
        ? "Familiar"
        : companion.kind === "beastmaster"
          ? sheet.beastmasterBond === "chosen-friend" ? "Chosen Friend" : "Beastmaster Companion"
          : `Henchman ${index + 1}`
    );
  const swapStowedBetweenOwners = (
    targetOwner: InventoryOwner,
    targetIndex: number,
    sourceOwner: InventoryOwner,
    sourceIndex: number,
  ) => {
    setOtherStowedIndex(null);
    setOtherStowedDraftName("");
    setCompanionOtherStowed({});
    setCompanionOtherStowedDrafts({});
    setSheet(current => {
      const pcGrowth = backgroundAttributeGrowth(current);
      const pcCapacity = Math.max(0, Math.min(18, (current.attrs.STR || 0) + pcGrowth.STR));
      const companionCapacity = (id: string) =>
        Math.max(0, current.companions.find(companion => companion.id === id)?.strength || 0);
      const ownerItems = (owner: InventoryOwner) =>
        owner.kind === "pc"
          ? inventorySlots(current.stowed, pcCapacity)
          : inventorySlots(
              current.companions.find(companion => companion.id === owner.id)?.stowed || [],
              companionCapacity(owner.id),
            );
      const targetItems = ownerItems(targetOwner);
      const sourceItems = ownerItems(sourceOwner);
      const targetItem = targetItems[targetIndex] || "";
      const sourceItem = sourceItems[sourceIndex] || "";
      if (!sourceItem) return current;
      targetItems[targetIndex] = sourceItem;
      sourceItems[sourceIndex] = targetItem;

      const nextCompanions = current.companions.map(companion => {
        if (targetOwner.kind === "companion" && companion.id === targetOwner.id) {
          return { ...companion, stowed: targetItems };
        }
        if (sourceOwner.kind === "companion" && companion.id === sourceOwner.id) {
          return { ...companion, stowed: sourceItems };
        }
        return companion;
      });
      return {
        ...current,
        stowed: targetOwner.kind === "pc"
          ? targetItems
          : sourceOwner.kind === "pc"
            ? sourceItems
            : current.stowed,
        companions: nextCompanions,
      };
    });
  };
  const swapReadiedWithStowed = (readiedIndex: number, stowedIndex: number) => {
    setOtherStowedIndex(null);
    setOtherStowedDraftName("");
    setSheet(current => {
      const nextReadied = inventorySlots(current.readied, readiedCapacity);
      const nextStowed = inventorySlots(current.stowed, stowedCapacity);
      const oldReadied = nextReadied[readiedIndex] || "";
      nextReadied[readiedIndex] = nextStowed[stowedIndex] || "";
      nextStowed[stowedIndex] = oldReadied;
      return { ...current, readied: nextReadied, stowed: nextStowed };
    });
  };
  const dropInventoryItem = (location: "readied" | "stowed", index: number, item: string) => {
    if (!window.confirm(`Drop ${inventoryItemDisplayName(item)}?\n\nThis removes it from the character’s inventory.`)) return;
    const capacity = location === "readied" ? readiedCapacity : stowedCapacity;
    setSheet(current => ({
      ...current,
      [location]: compactInventory(
        inventorySlots(current[location], capacity).filter((_, itemIndex) => itemIndex !== index),
        capacity,
      ),
    }));
  };
  const warning = (() => {
    const issues = [];
    if (preparedCount > limits.prepared) issues.push(`${preparedCount}/${limits.prepared} spells prepared`);
    if (castsUsed > limits.casts) issues.push(isInvoker ? `${castsUsed}/${limits.casts} Invoker spell points spent` : `${castsUsed}/${limits.casts} spell castings used`);
    if (sheet.artPicks.filter(Boolean).length > artAllowance) issues.push(`${sheet.artPicks.filter(Boolean).length}/${artAllowance} arts selected`);
    if (forcedArts.some(name => !sheet.artPicks.some(selection => creationArtForSelection(availableArts, selection)?.value === name))) issues.push("choose each required starting Art");
    if (sheet.spellPicks.some(p => (availableSpells.find(s => s.name === p.name)?.level ?? 0) > limits.max)) issues.push(`spell above level ${limits.max}`);
    if (sheet.artPicks.some(name => name && !creationArtForSelection(availableArts, name))) issues.push("an art belongs to a different tradition");
    if (sheet.classMode === "adventurer" && sheet.classOne === sheet.classTwo) issues.push("choose two different partial classes");
    if (sheet.classMode === "adventurer" && !creationPartialClassPairIsLegal(sheet.classOne, sheet.classTwo)) issues.push("choose a legal partial class pairing");
    if (traditionalEducation && !isInvoker) issues.push("Traditional Education is available only to Invokers");
    if (focusPicksUsed > rules.focusPicks) issues.push(`${focusPicksUsed}/${rules.focusPicks} Focus picks used`);
    if (selectedFocusPicks.some(pick => focusChoiceLabel(pick.name) && !pick.choice)) issues.push("a Focus needs a choice");
    if (selectedFocusPicks.some(pick => pick.choice && creationFocusChoiceOptions(pick.name).length && !creationFocusChoiceOptions(pick.name).includes(pick.choice))) issues.push("a Focus has an invalid choice");
    if (selectedClasses.includes("Wise") && !sheet.wiseConceptSkill) issues.push("choose the Wise concept bonus skill");
    if (sheet.backgroundDevelopmentMethod === "review") {
      issues.push("review legacy Background Development before applying a method");
    } else if (sheet.background && backgrounds[sheet.background]) {
      const activeBackgroundGrants = backgroundGrantResolutions.filter(grant =>
        grant.id === "background-free" || grant.id.startsWith("quick-") || grant.id.startsWith("learning-") || grant.id.startsWith("roll-"),
      );
      if (activeBackgroundGrants.some(grant => grant.needsChoice)) issues.push("complete a Background skill choice");
      if (activeBackgroundGrants.some(grant => grant.needsReplacement)) issues.push("choose another eligible Background skill instead of a third acquisition");
      if (sheet.backgroundDevelopmentMethod === "choose-learning" && sheet.backgroundLearningPicks.some(pick => !pick.result)) issues.push("choose both Background Learning results");
      if (sheet.backgroundDevelopmentMethod === "roll-growth-learning") {
        if (sheet.backgroundDevelopmentRolls.some(roll => !roll.die || !roll.result)) issues.push("roll all three Background Development results");
        if (sheet.backgroundDevelopmentRolls.some(roll => {
          const result = resolvedBackgroundRollResult(sheet.background, roll);
          const required = backgroundAttributePointCount(result);
          return required > 0 && roll.attributeChoices.length < required;
        })) issues.push("assign all Background Growth attribute points");
      }
    }
    const duplicateDevelopment = selectedFocusPicks.some((pick, index) => pick.name === "Developed Attribute" && pick.choice && selectedFocusPicks.some((other, otherIndex) => otherIndex !== index && other.name === "Developed Attribute" && other.choice === pick.choice));
    const duplicateSpecialism = selectedFocusPicks.some((pick, index) => pick.name === "Specialist" && pick.choice && selectedFocusPicks.some((other, otherIndex) => otherIndex !== index && other.name === "Specialist" && other.choice === pick.choice));
    if (duplicateDevelopment) issues.push("each Developed Attribute selection needs a different attribute");
    if (duplicateSpecialism) issues.push("each Specialist selection needs a different skill");
    if (advancementPointsSpent > skillPointAllowance) issues.push(`${advancementPointsSpent}/${skillPointAllowance} advancement points spent`);
    return issues.join(" · ");
  })();

  useEffect(() => {
    if (!hydrated) return;
    // Normalize saved selections when a rule dependency changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(current => {
      const legalFoci = current.focusPicks.map((pick, index) =>
        focusEligibility(pick.name, index).eligible ? pick : { name: "", level: 1 });
      const budgetedFoci: FocusPick[] = [];
      for (const pick of legalFoci) {
        if (!pick.name) {
          budgetedFoci.push(pick);
          continue;
        }
        const candidate = [...budgetedFoci, pick];
        budgetedFoci.push(
          focusSelectionCost(candidate) <= allowedFocusPicks
            ? pick
            : { name: "", level: 1 },
        );
      }
      const nextFoci = resizeSelections(budgetedFoci, focusSlotCount, pick => !pick.name, () => ({ name: "", level: 1 }));
      const legalArts = current.artPicks.map((name, index) => !name || artEligibility(name, index).eligible ? name : "");
      const nextArts = resizeSelections(legalArts, artAllowance, name => !name, () => "");
      const legalSpells = current.spellPicks.map((pick, index) =>
        !pick.name || spellEligibility(pick.name, index).eligible ? pick : { name: "", prepared: false, cast: false });
      const nextSpells = resizeSelections(legalSpells, knownSpellAllowance, pick => !pick.name, () => ({ name: "", prepared: false, cast: false }));
      let preparedSeen = 0;
      const cappedSpells = nextSpells.map(pick => {
        if (!pick.prepared) return pick;
        preparedSeen += 1;
        return preparedSeen <= limits.prepared ? pick : { ...pick, prepared: false, cast: false };
      });
      const nextEffort = reconcileArtEffortBySlot(current.artPicks, current.artEffort, nextArts);
      const unchanged =
        JSON.stringify(nextFoci) === JSON.stringify(current.focusPicks) &&
        JSON.stringify(nextArts) === JSON.stringify(current.artPicks) &&
        JSON.stringify(cappedSpells) === JSON.stringify(current.spellPicks) &&
        JSON.stringify(nextEffort) === JSON.stringify(current.artEffort);
      return unchanged ? current : { ...current, focusPicks: nextFoci, artPicks: nextArts, artEffort: nextEffort, spellPicks: cappedSpells };
    });
  // Eligibility helpers intentionally derive from all selected classes, levels,
  // attributes, traditions, and peer selections represented in this signature.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, focusSlotCount, artAllowance, knownSpellAllowance, limits.prepared, limits.max, selectedClasses.join("|"), sheet.beastmasterBond, sheet.attrs.STR, sheet.attrs.DEX, sheet.attrs.CON, sheet.attrs.INT, sheet.attrs.WIS, sheet.attrs.CHA, sheet.backgroundDevelopmentMethod, JSON.stringify(sheet.backgroundDevelopmentRolls), JSON.stringify(sheet.backgroundLearningPicks)]);

  useEffect(() => {
    if (!hydrated) return;
    // Focus changes activate or archive companions while preserving their entered data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(current => {
      const existingHenchmen = current.companions.filter(companion => companion.kind === "henchman");
      const existingFamiliars = current.companions.filter(companion => companion.kind === "familiar");
      const existingBeastmasters = current.companions.filter(companion => companion.kind === "beastmaster");
      const archivedHenchmen = current.archivedCompanions.filter(companion => companion.kind === "henchman");
      const archivedFamiliars = current.archivedCompanions.filter(companion => companion.kind === "familiar");
      const archivedBeastmasters = current.archivedCompanions.filter(companion => companion.kind === "beastmaster");
      const availableHenchmen = [...existingHenchmen, ...archivedHenchmen];
      const availableFamiliars = [...existingFamiliars, ...archivedFamiliars];
      const availableBeastmasters = [...existingBeastmasters, ...archivedBeastmasters];
      const nextHenchmen = hasHenchkeeper
        ? [
            ...availableHenchmen.slice(0, henchmanCount),
            ...Array.from({ length: Math.max(0, henchmanCount - availableHenchmen.length) }, (_, index) =>
              newCompanion("henchman", availableHenchmen.length + index, sheet.level)
            ),
          ]
        : [];
      const primarySpiritFocusSlot = spiritFamiliars[0]?.index;
      const existingSpiritFamiliar = primarySpiritFocusSlot === undefined
        ? undefined
        : availableFamiliars.find((companion) => companion.focusSlot === primarySpiritFocusSlot)
          || existingFamiliars[0]
          || archivedFamiliars[0];
      const nextFamiliars = primarySpiritFocusSlot === undefined
        ? []
        : (() => {
            const familiar = existingSpiritFamiliar || newCompanion("familiar", 0, current.level, primarySpiritFocusSlot);
            const benefitCap = spiritFamiliarBenefitLimit(current.focusPicks);
            const activeBenefits = (familiar.familiarBenefits || []).slice(0, benefitCap);
            const maximum = spiritFamiliarMaximumHitPoints(
              current.level,
              activeBenefits.includes(spiritFamiliarTripleHpBenefit),
            );
            const hitPoints = reconcileSpiritFamiliarHitPoints(
              familiar.hpCurrent,
              familiar.hpMax,
              maximum,
            );
            return [{
              ...familiar,
              focusSlot: primarySpiritFocusSlot,
              hpCurrent: hitPoints.current,
              hpMax: hitPoints.maximum,
              ac: 14,
              move: "30′",
            }];
          })();
      const nextBeastmasters = hasBeastmaster
        ? [availableBeastmasters[0] || newCompanion("beastmaster", 0, sheet.level)]
        : [];
      const next = [...nextHenchmen, ...nextFamiliars, ...nextBeastmasters];
      const activeIds = new Set(next.map(companion => companion.id));
      const archivedIds = new Set<string>();
      const nextArchive = [...current.archivedCompanions, ...current.companions]
        .filter(companion => {
          if (activeIds.has(companion.id) || archivedIds.has(companion.id)) return false;
          archivedIds.add(companion.id);
          return true;
        });
      return JSON.stringify(next) === JSON.stringify(current.companions) &&
        JSON.stringify(nextArchive) === JSON.stringify(current.archivedCompanions)
        ? current
        : { ...current, companions: next, archivedCompanions: nextArchive };
    });
  }, [hydrated, hasHenchkeeper, hasSpiritFamiliar, hasBeastmaster, henchmanCount, sheet.level, spiritFamiliars]);

  useEffect(() => {
    if (!hydrated) return;
    // Unarmed Attack is virtual. Older drafts may have contained an inventory
    // copy, but it is never a real item to ready, stow, transfer, or drop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(current => {
      const readied = current.readied.filter(item => item !== "Unarmed Attack");
      const stowed = current.stowed.filter(item => item !== "Unarmed Attack");
      return readied.length === current.readied.length && stowed.length === current.stowed.length
        ? current
        : { ...current, readied, stowed };
    });
  }, [hydrated]);

  function weaponCalc(pick: WeaponPick) {
    const campaignWeapon = campaignInventoryWeapon(pick.name);
    const w = campaignWeapon ?? weapons.find(x => x.name === pick.name);
    if (!w) return null;
    const bestPhysicalModifier = Math.max(attributeMod("STR"), attributeMod("DEX"));
    const attrMod = w.attribute === "Dex" ? attributeMod("DEX") : w.attribute === "Str" ? attributeMod("STR") : bestPhysicalModifier;
    const isUnarmed = w.name === "Unarmed Attack";
    const isThrownWeapon = w.traits.split(",").map(trait => trait.trim()).includes("T");
    // Explicit player choice controls versatile thrown weapons, including custom campaign weapons.
    // Only melee use permits Shock.
    const isMelee = isUnarmed || (isThrownWeapon && w.range !== "-" ? !preferThrownMode : (campaignWeapon ? campaignWeapon.skill !== "Shoot" : w.range === "-"));
    const isThrown = isThrownWeapon && !isMelee;
    const skillName = isUnarmed ? "Punch" : isThrownWeapon && w.range !== "-" ? (isMelee ? "Stab" : "Shoot") : campaignWeapon?.skill ?? (isMelee ? "Stab" : "Shoot");
    const skill = effectiveSkill(skillName);
    const unskilled = skill < 0 && w.name !== "Crossbow" ? -2 : 0;
    const armsmaster = selectedFocusPicks.find(focus => focus.name === "Armsmaster");
    const deadeye = selectedFocusPicks.find(focus => focus.name === "Deadeye");
    const closeCombatant = selectedFocusPicks.find(focus => focus.name === "Close Combatant");
    const shockingAssault = selectedFocusPicks.find(focus => focus.name === "Shocking Assault");
    const unarmedCombatant = selectedFocusPicks.find(focus => focus.name === "Unarmed Combatant");
    const isVowed = selectedClasses.includes("Vowed");
    const warriorDamage = sheet.classMode === "full" && sheet.classOne === "Warrior" ? Math.ceil(effectiveLevel / 2) : 0;
    const focusHitBonus = !isUnarmed && armsmaster?.level === 2 && (isMelee || isThrown) ? 1 : 0;
    // Armsmaster lets the player choose damage *or* Shock; the sheet uses
    // damage as its displayed default and explains the alternative instead of
    // incorrectly stacking the same Stab rank onto both values.
    const armsmasterDamage = !isUnarmed && armsmaster && (isMelee || isThrown) && !(deadeye && !isMelee)
      ? Math.max(0, effectiveSkill("Stab"))
      : 0;
    const deadeyeDamage = !isMelee && !isUnarmed && deadeye ? Math.max(0, effectiveSkill("Shoot")) : 0;

    if (isUnarmed) {
      const shockThreshold = closeCombatant?.level === 2 || shockingAssault ? "-" : 15;
      const shockingAssaultBonus = shockingAssault?.level === 2 ? 2 : 0;
      const result = deriveUnarmedAttack({
        baseAttack,
        punchSkill: effectiveSkill("Punch"),
        physicalModifier: bestPhysicalModifier,
        warriorDamage,
        shockingAssaultBonus,
        shockThreshold,
        unarmedCombatantLevel: unarmedCombatant?.level || 0,
        vowedProgression: isVowed ? vowedProgression[effectiveLevel - 1] : undefined,
        magicalVowedAttack: isVowed && effectiveLevel >= 3,
      });
      return { w, skillName: "Punch", range: "-", virtual: true, ...result };
    }
    const rangedMeleePenalty = rangedAttackInMeleePenalty({ ranged: !isMelee, threatened: rangedInMelee, deadeyeLevel: deadeye?.level || 0, closeCombatantKnife: Boolean(closeCombatant) && isThrown && /knife|dagger/i.test(w.name) });
    const hit = baseAttack + attrMod + Math.max(0, skill) + unskilled + focusHitBonus + rangedMeleePenalty;
    const extraDamage = attrMod + warriorDamage + Math.max(armsmasterToShock && isMelee && w.shock !== "None" ? 0 : armsmasterDamage, deadeyeDamage);
    const shock = !isMelee || w.shock === "None" ? "None" : (() => {
      const match = w.shock.match(/^(\d+)\/AC\s*(\d+)$/i);
      if (!match) return w.shock;
      const shockDamage = Number(match[1]) + attrMod + warriorDamage + (armsmasterToShock && isMelee ? armsmasterDamage : 0)
        + (shockingAssault?.level === 2 ? 2 : 0);
      // These Foci treat the target as AC 10 for Shock eligibility; they do
      // not limit Shock to enemies whose actual AC is 10 or lower.
      const bypassTargetAc = (armsmaster?.level === 2 || closeCombatant?.level === 2 || shockingAssault)
        && Number(match[2]) >= 10;
      const shockAc = bypassTargetAc ? "-" : `AC ${Number(match[2])}`;
      return `${Math.max(0, shockDamage)}/${shockAc}`;
    })();
    const armsmasterNote = armsmasterDamage && w.shock !== "None"
      ? ` · Armsmaster can apply Stab ${signed(armsmasterDamage)} to Shock instead of damage`
      : "";
    return { w, skillName, hit, damage: `${w.damage}${extraDamage ? signed(extraDamage) : ""}`, shock, range: w.range, virtual: false, note: `${skillName} ${skill >= 0 ? signed(skill) : "untrained"} effective${armsmasterNote}${rangedMeleePenalty ? " · Deadeye: −4 for ranged use while threatened in melee" : ""}` };
  }

  const updateBackgroundLearningPick = (index: number, update: Partial<BackgroundLearningPick>) => {
    setSheet(current => ({
      ...current,
      backgroundLearningPicks: current.backgroundLearningPicks.map((pick, row) => row === index ? { ...pick, ...update } : pick),
    }));
  };
  const updateBackgroundDevelopmentRoll = (index: number, update: Partial<BackgroundDevelopmentRoll>) => {
    setSheet(current => ({
      ...current,
      backgroundDevelopmentRolls: current.backgroundDevelopmentRolls.map((roll, row) => row === index ? { ...roll, ...update } : roll),
    }));
  };
  type BackgroundSkillFollowupProps = {
    result: string;
    choice: string;
    replacement: string;
    needsReplacement: boolean;
    onChoice: (value: string) => void;
    onReplacement: (value: string) => void;
    choiceOptions: readonly string[];
    replacementOptions: readonly string[];
  };
  const renderBackgroundSkillFollowUp = ({
    result,
    choice,
    replacement,
    needsReplacement,
    onChoice,
    onReplacement,
    choiceOptions,
    replacementOptions,
  }: BackgroundSkillFollowupProps) => {
    const specialLabel = result === "Any Combat" ? "Choose combat skill" : "Choose skill";
    return <>
      {choiceOptions.length > 0 && <label className="field">
        <span>{needsReplacement ? `Choose another eligible ${result === "Any Combat" ? "combat skill" : "skill"}` : specialLabel}</span>
        <select value={choice} onChange={event => onChoice(event.target.value)}>
          <option value="">{specialLabel}…</option>
          {choiceOptions.map(skill => <option key={skill} value={skill}>{skill}</option>)}
        </select>
        {needsReplacement && <small className="background-choice-note">This would be a third starting acquisition. Choose a skill that is not already level 1.</small>}
      </label>}
      {needsReplacement && choiceOptions.length === 0 && <label className="field">
        <span>Choose another eligible skill</span>
        <select value={replacement} onChange={event => onReplacement(event.target.value)}>
          <option value="">Choose skill…</option>
          {replacementOptions.map(skill => <option key={skill} value={skill}>{skill}</option>)}
        </select>
        <small className="background-choice-note">This result would be a third starting acquisition. Pick a skill that is still below level 1.</small>
      </label>}
    </>;
  };
  const renderBackgroundAttributeChoices = (row: BackgroundDevelopmentRoll, rowIndex: number) => {
    const result = resolvedBackgroundRollResult(sheet.background, row);
    const permitted = backgroundAttributeChoices(result) as AttributeName[];
    const pointCount = backgroundAttributePointCount(result);
    if (!pointCount) return null;
    return <div className="background-attribute-points">
      {Array.from({ length: pointCount }, (_, pointIndex) => {
        const value = row.attributeChoices[pointIndex] || "";
        return <label className="field" key={`${rowIndex}-${pointIndex}`}>
          <span>{pointCount === 1 ? "Apply +1 to" : `Point ${pointIndex + 1}`}</span>
          <select value={value} onChange={event => setBackgroundAttributePoint(rowIndex, pointIndex, event.target.value as AttributeName)}>
            <option value="">Choose attribute…</option>
            {permitted.map(attribute => {
              const available = value === attribute || attributeScore(attribute) < 18;
              return <option key={attribute} value={attribute} disabled={!available}>{attribute}{available ? "" : " — maximum 18"}</option>;
            })}
          </select>
        </label>;
      })}
      {pointCount === 2 && <small className="background-choice-note">Assign both points to one attribute or split them between two.</small>}
    </div>;
  };

  return (
    <main>
      <VirtualDiceOverlay ref={virtualDiceOverlay} theme={displayTheme} />
      {signedIn ? <SignedInHeader utilities={<>
        <span className="save-state"><span className="dot" />{saved}</span>
        {canEdit && creationEntry !== "choose" && (cloudId
          ? <button type="button" onClick={() => void (characterEditMode ? saveCharacterEdits() : saveToCloud())}>{characterEditMode ? "Save Character" : "Save Now"}</button>
          : <button type="button" onClick={() => void addCurrentToLibrary()}>Add to My Characters</button>)}
        <button type="button" className="print-button" onClick={() => window.print()}>Print</button>
      </>} /> : <div className="topbar">
        <TalesBrandLink href={signedIn ? "/account" : "/"} />
        <div className="status">
          <div className="status-meta">
            <span className="save-state"><span className="dot" />{saved}</span>
          </div>
          <div className="header-actions">
            {!signedIn && <button className="library-button" onClick={() => {
              setLibraryScope("public");
              setLibraryOpen(true);
              void refreshLibrary("public");
            }}>Public Characters</button>}
            {!signedIn && !libraryOpen && <button
              type="button"
              className="primary-action account-signin"
              onClick={async () => {
                setTransferMessage("Opening Google sign-in…");
                setLibraryError("");
                try {
                  const { error } = await authClient.signIn.social({
                    provider: "google",
                    callbackURL: "/",
                  });
                  if (error) {
                    throw new Error(error.message || "Better Auth rejected Google sign-in.");
                  }
                } catch (error) {
                  const detail = error instanceof Error
                    ? error.message
                    : "The request could not be started.";
                  const feedback = `Google sign-in failed: ${detail}`;
                  setTransferMessage(feedback);
                  setLibraryError(feedback);
                }
              }}
            >Sign in with Google</button>}
            <button className="print-button" onClick={() => window.print()}>Print / PDF</button>
          </div>
        </div>
      </div>}

      {campaignContext && (
        <div className="campaign-character-context" role="status">
          <a href={`/campaigns/${campaignContext.id}`}>← Back to {campaignContext.name}</a>
          <strong>
            {campaignContext.readOnly
              ? "Viewing through campaign · Read only"
              : "Viewing your character through campaign"}
          </strong>
          <span>
            {campaignContext.readOnly
              ? "Campaign access permits viewing; only the character owner can make changes."
              : "You remain the owner and retain normal editing access."}
          </span>
        </div>
      )}

      {libraryOpen && <div className="library-backdrop" role="presentation">
        <section className="library-panel" role="dialog" aria-modal="true" aria-labelledby="library-title">
          <header className="library-header">
            <div><p className="eyebrow">THE COMPANY ARCHIVE</p><h1 id="library-title">Character Library</h1><p>Your private roster and publicly discoverable adventurers remain separate.</p></div>
            <img className="library-emblem" src="/assets/wwn-ledger-emblem.png" alt="" aria-hidden="true" />
            <button className="library-close" aria-label="Close character library" onClick={() => setLibraryOpen(false)}>×</button>
          </header>
          <div className="library-scopes" role="tablist" aria-label="Character library view">
            {signedIn && <button
              type="button"
              role="tab"
              aria-selected={libraryScope === "mine"}
              className={libraryScope === "mine" ? "active" : ""}
              onClick={() => { setLibraryScope("mine"); void refreshLibrary("mine"); }}
            >My Characters</button>}
            <button
              type="button"
              role="tab"
              aria-selected={libraryScope === "public"}
              className={libraryScope === "public" ? "active" : ""}
              onClick={() => { setLibraryScope("public"); void refreshLibrary("public"); }}
            >Public Characters</button>
            {isAdmin && <button
              type="button"
              role="tab"
              aria-selected={libraryScope === "all"}
              className={libraryScope === "all" ? "active" : ""}
              onClick={() => { setLibraryScope("all"); void refreshLibrary("all"); }}
            >All Characters</button>}
          </div>
          {libraryScope !== "mine" && <form className="library-search" onSubmit={event => { event.preventDefault(); void refreshLibrary(libraryScope, libraryQuery); }}>
            <label htmlFor="library-search">Search {libraryScope === "all" ? "all" : "public"} characters</label>
            <div><input id="library-search" type="search" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /><button type="submit">Search</button></div>
          </form>}
          <div className="library-actions">
            {signedIn && libraryScope === "mine" && <button className="primary-action" onClick={() => window.location.assign("/?new=1")}>＋ Create New Character</button>}
            {signedIn && libraryScope === "mine" && !cloudId && <button onClick={() => void addCurrentToLibrary()}>☁ Add Current Browser Character</button>}
            <button onClick={() => void refreshLibrary(libraryScope)}>↻ Refresh</button>
          </div>
          {!signedIn && <div className="library-signin">
            <p>Sign in with Google to create, edit, and manage private characters.</p>
            <button
              type="button"
              className="primary-action"
              onClick={async () => {
                setTransferMessage("Opening Google sign-in…");
                setLibraryError("");
                try {
                  const { error } = await authClient.signIn.social({
                    provider: "google",
                    callbackURL: "/",
                  });
                  if (error) {
                    throw new Error(error.message || "Better Auth rejected Google sign-in.");
                  }
                } catch (error) {
                  const detail = error instanceof Error
                    ? error.message
                    : "The request could not be started.";
                  const feedback = `Google sign-in failed: ${detail}`;
                  setTransferMessage(feedback);
                  setLibraryError(feedback);
                }
              }}
            >Sign in with Google</button>
          </div>}
          {libraryError && <div className="library-error" role="alert">{libraryError}</div>}
          <div className="library-list">
            {libraryBusy && library.length === 0 && <div className="library-empty"><span>⌛</span><h2>Opening the archive…</h2></div>}
            {!libraryBusy && library.length === 0 && !libraryError && <div className="library-empty"><span>✦</span><h2>{libraryScope === "mine" ? "No characters in your roster yet" : libraryScope === "all" ? "No characters found" : "No public characters found"}</h2><p>{libraryScope === "mine" ? "Create a character to begin your roster." : "Try a different search or return later."}</p></div>}
            {library.map(character => <article className={`library-card ${cloudId === character.id ? "current" : ""}`} key={character.id}>
              <button className="library-card-main" onClick={() => void openCloudCharacter(character.id)}>
                <span className="library-level">LVL <b>{character.level}</b></span>
                <span><strong>{character.name}</strong><small>{character.classLabel}{character.player ? ` · ${character.player}` : ""}</small>{libraryScope === "all" && <small className="library-owner-state">{character.ownerState === "mine" ? "Mine" : character.ownerState === "unowned" ? "Unowned" : "Other user"} · {character.visibility}</small>}</span>
                <time>Updated {new Date(character.updatedAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}</time>
              </button>
              <div className="library-card-actions">
                <button onClick={() => void openCloudCharacter(character.id)}>Open</button>
                {signedIn && <button onClick={() => void duplicateCharacter(character.id)}>Duplicate</button>}
                {character.permissions.canEdit && <button className="danger-action" onClick={() => void deleteCharacter(character.id, character.name)}>Delete</button>}
              </div>
            </article>)}
          </div>
          <footer className="library-footer">{isAdmin ? "Administrator access is read-only outside My Characters; only owners can make changes." : "Owned characters autosave. Private characters are visible only to their owner; public characters are read-only to everyone else."}</footer>
        </section>
      </div>}

      <div ref={editableSurface} className={`folio ${canEdit ? "" : "read-only-folio"}`}>
        {startNew && creationEntry === "choose" ? <section className="creation-entry" aria-labelledby="creation-entry-title">
          <p>NEW CHARACTER</p>
          <h1 id="creation-entry-title">How would you like to begin?</h1>
          <div className="creation-entry-options">
            <article>
              <span>BEGINNER-FRIENDLY</span>
              <h2>Guided Creation</h2>
              <p>Work through existing Worlds Without Number level-1 choices in a dependency-aware order. Your normal character record saves as you go.</p>
              <button type="button" className="primary-button" onClick={() => beginNewCharacter("guided")} disabled={sessionPending}>Start Guided Creation</button>
            </article>
            <article>
              <span>EXPERIENCED PLAYERS</span>
              <h2>Blank Character</h2>
              <p>Open the familiar direct character-sheet workflow with no wizard layer.</p>
              <button type="button" className="secondary-button" onClick={() => beginNewCharacter("blank")} disabled={sessionPending}>Start Blank Character</button>
            </article>
          </div>
          {!signedIn && <p className="creation-warning">Sign in to create and save a private character.</p>}
        </section> : wizardOpen ? <GuidedCreationWizard
          sheet={sheet}
          canEdit={canEdit && (creationEntry === "guided" || characterEditMode)}
          persistenceKey={cloudId || "new-character"}
          reviewStats={{ ac: calculatedAc, attack: baseAttack }}
          onChange={update => setSheet(current => ({ ...current, ...update }))}
          onPortrait={file => void uploadPortrait(file)}
          onExit={() => closeGuidedCreation(false)}
          onCancel={() => void cancelGuidedCreation()}
          onFinish={() => closeGuidedCreation(true)}
        /> : levelUpOpen && canEdit && cloudId && !cloudArchivedAt && sheet.level >= 1 && sheet.level < 10 ? <LevelUpWizard
          sheet={sheet}
          canEdit={canEdit}
          persistenceKey={cloudId}
          onCancel={() => setLevelUpMode(false, "replace")}
          onFinish={(next, sourceLevel) => commitLevelUp(next as Sheet, sourceLevel)}
        /> : <>
        {transferMessage && <div className="transfer-message" role="status">{transferMessage}<button data-readonly-interactive="true" aria-label="Dismiss message" onClick={() => setTransferMessage("")}>×</button></div>}
        {signedIn && canEdit && cloudId && !cloudArchivedAt && creationEntry !== "choose" && sheet.level === 1 && !levelOneStatus.canFinish && <div className="character-sheet-guided-action" data-readonly-interactive="true">
          <button type="button" onClick={() => { setCreationEntry("guided"); setGuidedCreationMode(true); }}>Guided Creation</button>
        </div>}
        {!canEdit && !campaignContext?.readOnly && <div className="read-only-banner" role="status">
          <strong>{cloudAdminReadOnly ? "Viewing as administrator · Read only" : "Read-only character"}</strong>
          <span>{cloudAdminReadOnly ? "Administrator access allows viewing; only the owner can change this character." : signedIn ? "Only the owner can change this character." : "Sign in with Google to create or manage your own characters."}</span>
          {!signedIn && <button type="button" data-readonly-interactive="true" onClick={signInWithGoogle}>Sign in with Google</button>}
        </div>}
        <div className="hero">
          <img className="hero-illustration" src="/assets/wwn-header-flow-v2.png" alt="" aria-hidden="true" />
          <section className="hero-identity-panel" aria-label="Character identity">
            <div className={`portrait-frame ${sheet.portrait ? "has-portrait" : ""}`}>
              {sheet.portrait ? <img src={sheet.portrait} alt={`${sheet.name || "Character"} portrait`} /> : <span aria-hidden="true">✦</span>}
              {canEdit && <details className="portrait-action-menu"><summary aria-label="Portrait options" title="Portrait options">☰</summary><div className="portrait-action-list"><button type="button" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");portraitInput.current?.click();}}>{sheet.portrait?"Change portrait":"Add portrait"}</button>{sheet.portrait&&<><button type="button" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");setTokenCropDraft({...{cx:0.5,cy:0.5,size:0.72,aspect:1},...sheet.tokenCrop});setTokenEditorOpen(true);}}>Set Token</button><button type="button" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");void removePortrait();}}>Remove portrait</button></>}</div></details>}
              <input ref={portraitInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => void uploadPortrait(e.target.files?.[0])} />
            </div>
            {tokenEditorOpen&&sheet.portrait&&createPortal(<div className="token-crop-backdrop" role="presentation" onPointerDown={event=>{if(event.target===event.currentTarget)setTokenEditorOpen(false);}}><div className="token-crop-dialog" role="dialog" aria-modal="true" aria-label="Choose map token portrait"><h3>Map Token</h3><p>Move the circle to frame your token. Adjust its size below.</p><div className="token-crop-preview" style={{aspectRatio:tokenCropDraft.aspect}} onPointerMove={event=>{if(!tokenDrag.current)return;const bounds=event.currentTarget.getBoundingClientRect();const halfX=tokenCropDraft.size*Math.min(1,1/tokenCropDraft.aspect)/2;const halfY=tokenCropDraft.size*Math.min(1,tokenCropDraft.aspect)/2;setTokenCropDraft(value=>({...value,cx:Math.max(halfX,Math.min(1-halfX,(event.clientX-bounds.left)/bounds.width)),cy:Math.max(halfY,Math.min(1-halfY,(event.clientY-bounds.top)/bounds.height))}));}} onPointerUp={event=>{tokenDrag.current=false;event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{tokenDrag.current=false;}}><img src={sheet.portrait} alt="Full portrait token crop preview" onLoad={event=>{const image=event.currentTarget;const aspect=image.naturalWidth/image.naturalHeight;if(Number.isFinite(aspect)&&aspect>0)setTokenCropDraft(value=>({...value,aspect}));}}/><div className="token-crop-circle" style={{left:(tokenCropDraft.cx*100)+"%",top:(tokenCropDraft.cy*100)+"%",width:(tokenCropDraft.size*Math.min(1,1/tokenCropDraft.aspect)*100)+"%",height:(tokenCropDraft.size*Math.min(1,tokenCropDraft.aspect)*100)+"%"}} onPointerDown={event=>{tokenDrag.current=true;event.currentTarget.parentElement?.setPointerCapture(event.pointerId);event.preventDefault();}}/></div><label>Circle size <input type="range" min="20" max="100" value={Math.round(tokenCropDraft.size*100)} onChange={event=>setTokenCropDraft(current=>{const size=Number(event.target.value)/100;const halfX=size*Math.min(1,1/current.aspect)/2;const halfY=size*Math.min(1,current.aspect)/2;return {cx:Math.max(halfX,Math.min(1-halfX,current.cx)),cy:Math.max(halfY,Math.min(1-halfY,current.cy)),size};})}/></label><div className="token-crop-actions"><button type="button" onClick={()=>setTokenEditorOpen(false)}>Cancel</button><button type="button" onClick={()=>{patch("tokenCrop",tokenCropDraft);setTokenEditorOpen(false);}}>Save token</button></div></div></div>,document.body)}
            <div className="hero-identity-copy">
              <p className="eyebrow">THE RECORD OF</p>
              <textarea ref={characterNameInput} className="character-name" data-character-build-control="true" rows={1} value={sheet.name} onChange={e => patch("name", e.target.value)} aria-label="Character name" />
              <p className="hero-summary">{sheet.level ? `Level ${sheet.level}` : "Level —"} {classLabel || "Class —"}</p>
              <div className="hero-wealth" aria-label="Character wealth">
                <span className="wealth-label">COIN PURSE</span>
                <div className="hero-wealth-values">
                  <label><input type="number" value={sheet.gp} onChange={e => patch("gp", Number(e.target.value))} aria-label="Gold pieces" /><b>GP</b></label>
                  <i>◆</i>
                  <label><input type="number" value={sheet.sp} onChange={e => patch("sp", Number(e.target.value))} aria-label="Silver pieces" /><b>SP</b></label>
                  <i>◆</i>
                  <label><input type="number" value={sheet.cp} onChange={e => patch("cp", Number(e.target.value))} aria-label="Copper pieces" /><b>CP</b></label>
                </div>
              </div>
            </div>
          </section>
          <section className="hero-tools hero-play-panel" aria-label="Play utilities">
            <RulesAssistant />
            <div className="hero-stats" aria-label="Dice and combat statistics">
              <DiceControl expression="d20" result={latestRoll?.category === "generic" && latestRoll.dice.count === 1 && latestRoll.dice.sides === 20 ? latestRoll : null} onRoll={() => rollHeaderDice("d20")} disabled={virtualDiceBusy} />
              <DiceControl expression="2d6" result={latestRoll?.category === "generic" && latestRoll.dice.count === 2 && latestRoll.dice.sides === 6 ? latestRoll : null} onRoll={() => rollHeaderDice("2d6")} disabled={virtualDiceBusy} />
              <label className="hero-stat-card hero-ac-card" title="Calculated from armor, shield, Dexterity, and armor bonus"><input type="number" value={calculatedAc} disabled aria-label="Calculated armor class" /><span className="hero-card-label">ARMOR CLASS</span></label>
              <label className="hero-stat-card hp-stat"><span className="paired"><input type="number" value={sheet.hpCurrent || ""} onChange={e => patch("hpCurrent", Number(e.target.value))} aria-label="Current hit points" /><em>/</em><input type="number" value={calculatedHpMax || ""} disabled={hpRollsComplete} onChange={e => patch("hpMax", Number(e.target.value))} aria-label={hpRollsComplete ? "Calculated maximum hit points" : "Maximum hit points"} /></span><span className="hero-card-label">HIT POINTS</span></label>
            </div>
            <div className="hero-roll-row" data-readonly-interactive="true">
              <div className="hero-latest-roll">
                <RollResultTray result={latestRoll} />
                {focusRerollReady && situationalRerolls.length > 0 && <div className="masterful-controls">
                  {situationalRerolls.map(option => <button key={option.name} type="button" title={option.context} disabled={focusRerollUsed[option.name] || !focusRerollSource || latestRoll?.id !== focusRerollSource.resultId || virtualDiceBusy} onClick={() => applySituationalReroll(option.name)}>{option.name}: Reroll failed check</button>)}
                  <button type="button" onClick={resetSituationalRerolls}>New Scene (Focus rerolls)</button>
                  <small>Only use a reroll when the GM confirms the check failed and the circumstance qualifies. Once per scene for each Focus. {situationalRerolls.filter(option => focusRerollUsed[option.name]).map(option => option.name).join(", ")}{situationalRerolls.some(option => focusRerollUsed[option.name]) ? " used." : ""}</small>
                </div>}
                {sheet.classMode === "full" && sheet.classOne === "Warrior" && veteransReady && <div className="masterful-controls">
                  <button type="button" disabled={veteransUsed || virtualDiceBusy || latestRoll?.category !== "attack" || latestRoll.id !== latestAttackId} onClick={() => applyVeteransLuck("hit")}>Veteran’s Luck: Force hit</button>
                  <button type="button" disabled={veteransUsed || virtualDiceBusy} onClick={() => applyVeteransLuck("miss")}>Veteran’s Luck: Force incoming miss</button>
                  <button type="button" onClick={resetVeteransScene}>New Scene</button>
                  <small role="status">{veteransOutcome || (veteransUsed ? "Veteran’s Luck used this scene" : "Once per scene · Outcome override, not an extra roll · Confirm with GM")}</small>
                </div>}
                {sheet.classMode === "full" && sheet.classOne === "Expert" && masterfulRestored && <div className="masterful-controls">
                  <button type="button" disabled={!masterfulRequest || masterfulUsed || latestRoll?.id !== masterfulRollId || virtualDiceBusy} onClick={rerollMasterful}>Reroll failed noncombat check (Masterful Expertise)</button>
                  <button type="button" onClick={resetMasterfulScene}>New Scene</button>
                  <small>{masterfulUsed ? "Masterful Expertise used this scene" : "One reroll per scene · Confirm failure with GM before using"}</small>
                </div>}
              </div>
              {cloudId && canEdit && !cloudArchivedAt && <CharacterLiveSessionPanel characterId={cloudId} campaignLinks={campaignLinks} campaignContextId={campaignContext?.id} onJoinedSessionChange={updateJoinedLiveSessionCampaign} />}
              <div className="hero-roll-history-control">
                <button type="button" className="roll-history-toggle" aria-expanded={rollHistoryOpen} aria-controls="roll-history-popout" aria-haspopup="dialog" onClick={() => setRollHistoryOpen(open => !open)}>Roll History{rollHistory.length ? ` (${rollHistory.length})` : ""}</button>
                {rollHistoryOpen && <div className="roll-history-popout" id="roll-history-popout"><RollHistoryPanel history={rollHistory} open={rollHistoryOpen} onClose={() => setRollHistoryOpen(false)} onClear={clearLocalRollHistory} /></div>}
              </div>
            </div>
            {diceError && <p className="dice-error" role="alert">{diceError}</p>}
          </section>
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {diceAnnouncement && <span key={diceAnnouncementKey}>{diceAnnouncement}</span>}
        </div>

        <nav className="tabs" aria-label="Character sheet pages">
          {(["core","magic","inventory","notes"] as Tab[]).map(t =>
            <button
              key={t}
              data-readonly-interactive="true"
              className={[tab === t ? "active" : "", t === "inventory" ? "tab-inventory" : ""].filter(Boolean).join(" ")}
              onClick={() => setTab(t)}
            >{t === "core" ? "Core Sheet" : t[0].toUpperCase()+t.slice(1)}</button>
          )}
          {companionTabs.map((companion, index) => {
            const companionTab: Tab = `companion:${companion.id}`;
            const fallback = companion.kind === "familiar"
              ? "Familiar"
              : companion.kind === "beastmaster"
                ? chosenFriend ? "Chosen Friend" : "Beastmaster Companion"
                : `Henchman ${index + 1}`;
            return <button key={companion.id} data-readonly-interactive="true" className={tab === companionTab ? "active" : ""} onClick={() => setTab(companionTab)}>{companion.name || fallback}</button>;
          })}
          {canEdit && <button
            className="tab-rest"
            onClick={takeRest}
          >
            Rest
          </button>}
        </nav>

        {warning && <div className="rule-warning"><strong>Level check:</strong> {warning}. The selections remain visible so nothing is lost.</div>}

        {tab === "core" && <div className="page-grid core-grid">
          <div className="stack">
            <Section title="Identity" buildControlled>
              <div className="two-col">
                <Field label="Player" value={sheet.player} onChange={v => patch("player", v)} />
                <label className="field">
                  <span>Character Level</span>
                  <span className="level-control-row">
                    <select
                      className="level-select"
                      value={sheet.level || ""}
                      onChange={e => {
                        const nextLevel = e.target.value === "" ? 0 : Number(e.target.value);
                        if (sheet.level >= 1 && nextLevel > sheet.level) {
                          setLevelUpMode(true);
                          setTransferMessage("Use the Level-Up Wizard to apply one legal level at a time.");
                          return;
                        }
                        patch("level", nextLevel);
                      }}
                    >
                      <option value="">Choose level…</option>
                      {Array.from({ length: 10 }, (_, index) => index + 1).map(level => (
                        <option key={level} value={level} disabled={sheet.level >= 1 && level > sheet.level}>{level}</option>
                      ))}
                    </select>
                    {signedIn && canEdit && cloudId && !cloudArchivedAt && creationEntry !== "choose" && sheet.level >= 1 && sheet.level < 10 && <button type="button" className="level-up-inline-button" data-readonly-interactive="true" onClick={() => setLevelUpMode(true)}>Level Up</button>}
                  </span>
                </label>
                <label className="field"><span>Class structure</span><select value={sheet.classMode} onChange={e => patch("classMode", e.target.value as Sheet["classMode"])}><option value="full">Full class</option><option value="adventurer">Adventurer (two partial classes)</option></select></label>
                <Field label="Race / Species" value={sheet.species} onChange={v => patch("species", v)} />
                <label className="field class-field">
                  <span>Class</span>
                  <select aria-label={sheet.classMode === "full" ? "Class" : "First partial class"} value={sheet.classOne} onChange={e => patch("classOne", e.target.value)}><option value="">{sheet.classMode === "full" ? "Choose a class…" : "Choose first partial class…"}</option>{(sheet.classMode === "full" ? fullClasses : partialClasses).map(c => {
                    const incompatible = sheet.classMode === "adventurer" && Boolean(sheet.classTwo) && !creationPartialClassPairIsLegal(c, sheet.classTwo);
                    return <option key={c} disabled={incompatible}>{c}</option>;
                  })}</select>
                  {sheet.classMode === "adventurer" && <select aria-label="Second partial class" value={sheet.classTwo} onChange={e => patch("classTwo", e.target.value)}><option value="">Choose second partial class…</option>{partialClasses.map(c => {
                    const incompatible = !creationPartialClassPairIsLegal(sheet.classOne, c);
                    return <option key={c} disabled={incompatible}>{c}</option>;
                  })}</select>}
                </label>
                <Field label="Homeland" value={sheet.homeland} onChange={v => patch("homeland", v)} />
                <label className="field">
                  <span>Background</span>
                  <select value={backgroundNames.includes(sheet.background) ? sheet.background : ""} onChange={e => selectBackground(e.target.value)}>
                    <option value="">Choose background…</option>
                    {backgroundNames.map(background => <option key={background} value={background}>{background}</option>)}
                  </select>
                </label>
                <Field label="Profession" value={sheet.profession} onChange={v => patch("profession", v)} />
              </div>
              <Field label="Description" value={sheet.description} onChange={v => patch("description", v)} />
            </Section>
            <Section title="Base Attributes" buildControlled aside={<span className="caption">SRD attribute generation · modifiers calculate automatically</span>} className="attributes-section">
              <div className="attribute-method-controls">
                <label className="field">
                  <span>Generation method</span>
                  <select aria-label="Generation method" value={sheet.attributeMethod} onChange={e => selectAttributeMethod(e.target.value as AttributeMethod)}>
                    <option value="rolled">Roll 3d6 in order</option>
                    <option value="array">Assign standard array</option>
                  </select>
                </label>
                {sheet.attributeMethod === "rolled" ? (
                  <>
                    <label className="field">
                      <span>Optional 14 substitution</span>
                      <select aria-label="Optional 14 substitution" value={sheet.attributeSubstitution} onChange={e => setAttributeSubstitution(e.target.value as Sheet["attributeSubstitution"])}>
                        <option value="">Do not substitute</option>
                        {attributes.map(attribute => <option key={attribute} value={attribute} disabled={!sheet.attributeRolls[attribute]}>{attribute} becomes 14</option>)}
                      </select>
                    </label>
                  </>
                ) : <p className="attribute-rule-note">Assign each value once: 14, 12, 11, 10, 9, and 7. Changing one score swaps it with the attribute that currently has that value.</p>}
              </div>
              <div className="attributes">
                {attributes.map(attribute => {
                  const rolled = sheet.attributeRolls[attribute];
                  const substituted = sheet.attributeMethod === "rolled" && sheet.attributeSubstitution === attribute && Boolean(rolled);
                  const baseScore = sheet.attrs[attribute] - sheet.attributeBoosts[attribute];
                  return <label key={attribute} className={substituted ? "attribute-substituted" : ""}>
                    <span>{attribute}</span>
                    {sheet.attributeMethod === "rolled" ? (
                      <select aria-label={`${attribute} rolled score`} value={rolled || ""} onChange={e => setRolledAttribute(attribute, Number(e.target.value))}>
                        <option value="">—</option>
                        {scoreOptions.map(value => {
                          const finalValue = Math.min(18, (substituted ? 14 : value) + sheet.attributeBoosts[attribute] + backgroundGrowth[attribute]);
                          return <option key={value} value={value}>{sheet.attributeBoosts[attribute] || backgroundGrowth[attribute] ? finalValue : value}</option>;
                        })}
                      </select>
                    ) : (
                      <select aria-label={`${attribute} array score`} value={baseScore} onChange={e => setArrayAttribute(attribute, Number(e.target.value))}>
                        {standardAttributeArray.map(value => <option key={value} value={value}>{Math.min(18, value + sheet.attributeBoosts[attribute] + backgroundGrowth[attribute])}</option>)}
                      </select>
                    )}
                    <b title={developedAttributes.includes(attribute) ? "Attribute modifier including Developed Attribute" : "Attribute modifier"}>{attributeScore(attribute) ? signed(attributeMod(attribute)) : "—"}</b>
                    {substituted && <small title={`The rolled ${rolled} is replaced with 14 under the SRD rule.`}>rolled {rolled} → 14</small>}
                    {sheet.attributeBoosts[attribute] > 0 && <small title="Purchased with advancement skill points">{baseScore} base +{sheet.attributeBoosts[attribute]} purchased</small>}
                    {backgroundGrowth[attribute] > 0 && <small title="Applied from the selected Background Growth results">+{backgroundGrowth[attribute]} Background Growth</small>}
                  </label>;
                })}
              </div>
              <div className="attribute-advancement">
                <div className="attribute-advancement-summary">
                  <strong>Level-up attribute improvements</strong>
                  <span>{attributeBoostCount}/{attributeBoostLimit} · next +1: {attributeBoostCount < attributeBoostLimit ? nextAttributeBoostCost : "—"} pts · {advancementPointsRemaining}{"\u00a0"}available</span>
                </div>
                <div className="attribute-boost-controls">
                  {attributes.map(attribute => {
                    const nextCost = attributeImprovementCostForNext(attributeBoostCount);
                    const limitReached = attributeBoostCount >= attributeBoostLimit;
                    const scoreMaxed = attributeScore(attribute) >= 18;
                    const insufficientPoints = advancementPointsSpent + nextCost > skillPointAllowance;
                    const cannotAdd = limitReached || scoreMaxed || insufficientPoints;
                    const addTitle = limitReached
                      ? `No more attribute improvements are available at level ${effectiveLevel}.`
                      : scoreMaxed
                        ? `${attribute} is already at the normal maximum of 18.`
                        : insufficientPoints
                          ? `Needs ${nextCost} advancement points; ${advancementPointsRemaining} remain. Reduce Skill spending to free points.`
                          : `Spend ${nextCost} advancement ${nextCost === 1 ? "point" : "points"} to increase ${attribute} by 1.`;
                    return <div key={attribute}>
                      <span>{attribute}</span>
                      <button type="button" aria-label={`Remove purchased ${attribute} improvement`} disabled={!sheet.attributeBoosts[attribute]} onClick={() => changeAttributeBoost(attribute, -1)}>−</button>
                      <b>{sheet.attributeBoosts[attribute]}</b>
                      <button type="button" title={addTitle} aria-label={`Purchase ${attribute} improvement for ${nextCost} ${nextCost === 1 ? "point" : "points"}`} disabled={cannotAdd} onClick={() => changeAttributeBoost(attribute, 1)}>+</button>
                    </div>;
                  })}
                </div>
                <small className="attribute-advancement-note" title="The third improvement requires level 3, the fourth level 6, and the fifth level 9. All improvements share the advancement-point pool with Skills.">
                  Skills and attributes share the same pool · {advancementPointsSpent}/{skillPointAllowance} spent
                </small>
              </div>
              {selectedFocusPicks.some(pick => pick.name === "Nullifier") && <label className="skill-context-option"><input type="checkbox" checked={magicalSaveContext} onChange={event => setMagicalSaveContext(event.target.checked)} /> Magical effect (Nullifier: +2 to saves)</label>}<div className="saves">{Object.entries(saves).map(([k,v]) => <div className="save-card" key={k} title={saveDetails[k as keyof typeof saveDetails]}><span>{k}</span><b>{v}+</b><small>{saveDetails[k as keyof typeof saveDetails]}</small><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollSave(k as keyof typeof saves)}>Roll Save</button></div>)}</div>
            </Section>
            <Section title="Background & Class Benefits" buildControlled>
              {classLabel && <div className="class-benefit-card"><strong>{classLabel}</strong><p>{rules.summary}</p><dl><div><dt>Hit dice</dt><dd>{rules.hitDice}</dd></div><div><dt>Base attack</dt><dd>{signed(rules.attack)}</dd></div><div><dt>Focus picks</dt><dd>{allowedFocusPicks}</dd></div></dl>{magicalTraditions.map(t=><p key={t}><b>{t}:</b> {traditionInfo[t].armor}</p>)}</div>}
              {sheet.background && backgrounds[sheet.background] ? (
                <div className="background-benefit-card" aria-live="polite">
                  <strong>{sheet.background} Benefits</strong>
                  <dl>
                    <div><dt>Free skill</dt><dd>{backgrounds[sheet.background].freeSkill}</dd></div>
                    <div><dt>Quick Skills</dt><dd>{backgrounds[sheet.background].quickSkills.join(" · ")}</dd></div>
                  </dl>
                  <div className="background-development">
                    <strong>Background Development</strong>
                    <p>The Free Skill above is always granted separately. Choose exactly one development method; its benefits stay separate from purchased ranks.</p>
                    <div className="background-method-options" role="radiogroup" aria-label="Background Development method">
                      {([
                        { method: "quick", label: "Quick Skills Package" },
                        { method: "choose-learning", label: "Choose Learning" },
                        { method: "roll-growth-learning", label: "Roll Growth & Learning" },
                      ] as const).map(option => <button
                        key={option.method}
                        type="button"
                        role="radio"
                        aria-checked={sheet.backgroundDevelopmentMethod === option.method}
                        className={sheet.backgroundDevelopmentMethod === option.method ? "active" : ""}
                        onClick={() => selectBackgroundDevelopmentMethod(option.method)}
                      >{option.label}</button>)}
                    </div>
                    {sheet.backgroundDevelopmentMethod === "review" && <div className="background-legacy-review">
                      <strong>Development method review required</strong>
                      <p>This saved character recorded the old, invalid combined Growth and Learning state. Its recorded values are preserved, but none of those development benefits are applied until you select one valid method above.</p>
                      {sheet.backgroundDevelopmentLegacy && <small>
                        Recorded Growth: {sheet.backgroundDevelopmentLegacy.growthRolls.filter(roll => roll.die).map((roll, index) => `#${index + 1} d6 ${roll.die} (${roll.result || "unresolved"})`).join(" · ") || "none"}
                        {" · "}Recorded Learning: {sheet.backgroundDevelopmentLegacy.learningPicks.filter(pick => pick.result).map((pick, index) => `#${index + 1} ${pick.result}${pick.choice ? ` → ${pick.choice}` : ""}`).join(" · ") || "none"}
                      </small>}
                    </div>}
                    {backgroundCombatGrantId && <label className="field background-skill-method">
                      <span>Background Any Combat skill</span>
                      <select value={creationBackgroundSkillChoiceValue(sheet, backgroundCombatGrantId)} onChange={event => patch("backgroundCombatSkill", event.target.value)}>
                        <option value="">Choose Punch, Shoot, or Stab…</option>
                        {creationBackgroundSkillChoiceOptions(sheet, backgroundCombatGrantId).map(skill => <option key={skill} value={skill}>{skill}</option>)}
                      </select>
                    </label>}
                    {sheet.backgroundDevelopmentMethod === "quick" && <div className="background-development-summary">
                      <strong>Quick Skills Package</strong>
                      <span>Applies {backgrounds[sheet.background].quickSkills.join(" · ")}.</span>
                    </div>}
                    {sheet.backgroundDevelopmentMethod === "quick" && backgroundGrantResolutions
                      .filter(grant => grant.id.startsWith("quick-") && grant.needsReplacement)
                      .map(grant => {
                        const index = Number(grant.id.slice("quick-".length));
                        return <label className="field background-skill-method" key={grant.id}>
                          <span>Replace capped Quick Skill: {grant.rawSkill}</span>
                          <select
                            value={grant.replacementOptions.includes(grant.replacement || "") ? grant.replacement || "" : ""}
                            onChange={event => patch("backgroundQuickSkillReplacements", blankBackgroundQuickSkillReplacements(sheet.background).map((_, row) => row === index ? event.target.value : sheet.backgroundQuickSkillReplacements[row] || ""))}
                          >
                            <option value="">Choose another skill…</option>
                            {grant.replacementOptions.map(skill => <option key={skill} value={skill}>{skill}</option>)}
                          </select>
                          <small className="background-choice-note">This Quick Skill would be a third starting acquisition. Pick a skill that is still below level 1.</small>
                        </label>;
                      })}
                    {sheet.backgroundDevelopmentMethod === "choose-learning" && <div className="background-growth">
                      <div className="background-growth-heading"><strong>Choose Learning</strong><span>Choose exactly two results from this background’s Learning table. Any Skill cannot be deliberately selected.</span></div>
                      <div className="background-learning-rows">
                      {sheet.backgroundLearningPicks.map((pick, index) => {
                        const grantId = `learning-${index}`;
                        const resolution = backgroundGrantResolution(grantId);
                        const learningResults = [...new Set(backgrounds[sheet.background].learning.filter(result => result !== "Any Skill"))];
                        return <div className="background-result-row" key={grantId}>
                          <label className="field"><span>Learning {index + 1}</span><select value={pick.result} onChange={event => updateBackgroundLearningPick(index, { result: event.target.value, choice: "", replacement: "" })}><option value="">Choose result…</option>{learningResults.map(result => {
                            const candidate = { ...sheet, backgroundLearningPicks: sheet.backgroundLearningPicks.map((value, row) => row === index ? { result, choice: "", replacement: "" } : value) };
                            const candidateResolution = backgroundGrantResolution(grantId, candidate);
                            const available = result === "Any Combat" || !candidateResolution?.needsReplacement;
                            return <option key={result} value={result} disabled={!available}>{result}{available ? "" : " — already level 1"}</option>;
                          })}</select></label>
                          {renderBackgroundSkillFollowUp({
                            result: pick.result,
                            choice: creationBackgroundSkillChoiceValue(sheet, grantId),
                            replacement: pick.replacement || "",
                            needsReplacement: Boolean(resolution?.needsReplacement),
                            onChoice: value => updateBackgroundLearningPick(index, { choice: value, replacement: "" }),
                            onReplacement: value => updateBackgroundLearningPick(index, { replacement: value }),
                            choiceOptions: creationBackgroundSkillChoiceOptions(sheet, grantId),
                            replacementOptions: resolution?.replacementOptions || [],
                          })}
                        </div>;
                      })}
                      </div>
                    </div>}
                    {sheet.backgroundDevelopmentMethod === "roll-growth-learning" && <div className="background-growth">
                      <div className="background-growth-heading"><strong>Roll Growth & Learning</strong><span>For each of the three independent rolls, choose Growth or Learning first, then roll that table’s die.</span></div>
                      {sheet.backgroundDevelopmentRolls.map((roll, index) => {
                        const grantId = `roll-${index}`;
                        const result = resolvedBackgroundRollResult(sheet.background, roll);
                        const dieSize = roll.table === "growth" ? backgrounds[sheet.background].growth.length : backgrounds[sheet.background].learning.length;
                        const resolution = backgroundGrantResolution(grantId);
                        return <div className="background-result-row background-roll-row" key={grantId}>
                          <strong className="background-roll-name">Roll {index + 1}</strong>
                          <label className="field"><span>Table</span><select value={roll.table} onChange={event => setBackgroundRollTable(index, event.target.value as BackgroundDevelopmentRoll["table"])}><option value="growth">Growth</option><option value="learning">Learning</option></select></label>
                          <button className="background-roll-button" type="button" onClick={() => rollBackgroundDevelopmentRow(index)}>Roll d{dieSize}</button>
                          <label className="field">
                            <span>Physical d{dieSize} result</span>
                            <input
                              type="number"
                              min={1}
                              max={backgroundTableDieSides(sheet.background, roll.table)}
                              step={1}
                              value={roll.die || ""}
                              onChange={event => setSheet(current => ({
                                ...current,
                                backgroundDevelopmentRolls: current.backgroundDevelopmentRolls.map((value, row) => row === index
                                  ? backgroundDevelopmentRollFromDie(current.background, value.table, Number(event.target.value))
                                  : value),
                              }))}
                            />
                          </label>
                          <span className="background-result"><small>{roll.die ? `d${dieSize} → ${roll.die}` : `d${dieSize} not rolled`}</small><b>{result || "Result pending"}</b></span>
                          {renderBackgroundAttributeChoices(roll, index)}
                          {result && renderBackgroundSkillFollowUp({
                            result,
                            choice: creationBackgroundSkillChoiceValue(sheet, grantId),
                            replacement: roll.replacement || "",
                            needsReplacement: Boolean(resolution?.needsReplacement),
                            onChoice: value => updateBackgroundDevelopmentRoll(index, { choice: value, replacement: "" }),
                            onReplacement: value => updateBackgroundDevelopmentRoll(index, { replacement: value }),
                            choiceOptions: creationBackgroundSkillChoiceOptions(sheet, grantId),
                            replacementOptions: resolution?.replacementOptions || [],
                          })}
                        </div>;
                      })}
                    </div>}
                  </div>
                </div>
              ) : null}
            </Section>
          </div>

          <div className="stack">
            <Section title="Health & Defenses">
              <div className="vitals">
                <StepperField label="HP current" value={sheet.hpCurrent} minimum={0} maximum={calculatedHpMax} onChange={value => patch("hpCurrent", value)} />
                <label className="field calculated-field"><span>HP maximum</span><input type="number" value={calculatedHpMax || ""} disabled={hpRollsComplete} onChange={e => patch("hpMax", Number(e.target.value))} /></label>
                <StepperField label="System Strain" value={sheet.strainCurrent} minimum={0} maximum={attributeScore("CON")} onChange={value => patch("strainCurrent", value)} />
                <div className="strain-max-frail"><label className="field calculated-field"><span>Strain maximum</span><input type="number" value={attributeScore("CON") || ""} disabled title="System Strain maximum equals Constitution" /></label><label className="strain-frail-toggle"><input type="checkbox" checked={sheet.frail} onChange={event => patch("frail", event.target.checked)} /> Frail</label></div>
                <label className="field"><span>Worn armor</span><select value={officialWornArmor || campaignWornArmor ? sheet.armor : "No Armor"} onChange={e => patch("armor", e.target.value)}>{armors.map(armor => <option key={armor.name} value={armor.name}>{armor.name} (AC {armor.ac})</option>)}{campaignWornArmor && !campaignArmorItems.some(item => campaignInventoryValue(item) === sheet.armor) && <option value={sheet.armor}>{campaignWornArmor.name} (AC {campaignWornArmor.ac}) · Saved snapshot</option>}{campaignArmorItems.filter(item => item.properties?.armor?.shield === "none").map(item => <option key={item.id} value={campaignInventoryValue(item)}>{item.name} (AC {item.properties?.armor?.armorClass}) · Campaign armour</option>)}</select></label>
                <label className="field"><span>Shield</span><select value={hasShield ? sheet.shield : ""} onChange={e => patch("shield", e.target.value)}>{shields.map(shield => <option key={shield || "none"} value={shield}>{shield || "No Shield"}</option>)}{campaignShield && !campaignArmorItems.some(item => campaignInventoryValue(item) === sheet.shield) && <option value={sheet.shield}>{campaignShield.name} · Saved snapshot</option>}{campaignArmorItems.filter(item => item.properties?.armor?.shield !== "none").map(item => <option key={item.id} value={campaignInventoryValue(item)}>{item.name} ({item.properties?.armor?.shield} shield, AC {item.properties?.armor?.armorClass})</option>)}</select></label>
                <Field label="Magic / custom AC bonus" value={sheet.armorBonus} onChange={v => patch("armorBonus", Number(v))} />
                <label className="field calculated-field"><span>Calculated Armor Class</span><input value={calculatedAc} disabled /></label>
                <div className="field calculated-field initiative-field"><span>Initiative</span><input value={signed(calculatedInitiative)} disabled /><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={rollInitiative}>Roll Initiative</button>{selectedFocusPicks.some(pick => pick.name === "Alert" && pick.level === 2) && <small>Alert 2: You act first unless another combatant also has Alert 2. Roll only to resolve competing Alert characters.</small>}</div>
                <label className="field calculated-field"><span>Base Attack Bonus</span><input value={signed(baseAttack)} disabled title="Calculated from class and character level" /></label>
              </div>
              <div className="hp-builder">
                <div className="hp-builder-heading"><strong>Hit Point Rolls</strong></div>
                <div className="hp-roll-grid">
                  {Array.from({ length: sheet.level || 0 }, (_, index) => {
                    const raw = sheet.hpRolls[index] || "";
                    let previousMaximum = 0;
                    let result = 0;
                    for (let step = 0; step <= index; step += 1) {
                      const roll = Number(sheet.hpRolls[step]);
                      if (!roll) { result = 0; break; }
                      const dice = step + 1;
                      const perDieModifier = attributeMod("CON") + hitPointPerDieBonus + (hasDieHard ? 2 : 0);
                      const rolled = Math.max(dice, roll + perDieModifier * dice);
                      previousMaximum = step === 0 ? rolled : Math.max(previousMaximum + 1, rolled);
                      result = previousMaximum;
                    }
                    return <label key={index}><span>Level {index + 1}</span><input type="number" min={1} max={(index + 1) * 6} value={raw} disabled={!buildFieldsEditable} placeholder={`${index + 1}d6 total`} onChange={e => {
                      const rolls = [...sheet.hpRolls];
                      rolls[index] = Number(e.target.value);
                      patch("hpRolls", rolls);
                    }} /><small>{result ? `Max HP ${result}` : "Enter roll"}</small></label>;
                  })}
                </div>

              </div>
            </Section>
            <Section title="Weapons">
              {selectedFocusPicks.some(pick => pick.name === "Whirlwind Assault") && <div className="whirlwind-focus-controls" role="group" aria-label="Whirlwind Assault combat abilities">
                <strong>Whirlwind Assault</strong>
                <p>Once per scene: apply melee Shock to eligible adjacent foes.</p>
                <button type="button" disabled={whirlwindSceneUsed} onClick={() => setWhirlwindSceneUsed(true)}>{whirlwindSceneUsed ? "Shock burst used this scene" : "Use Shock burst"}</button>
                <button type="button" onClick={() => setWhirlwindSceneUsed(false)}>New scene</button>
                {selectedFocusPicks.some(pick => pick.name === "Whirlwind Assault" && pick.level === 2) && <div>
                  <p>Level 2: first kill each round grants one extra attack.</p>
                  <button type="button" disabled={whirlwindRoundUsed} onClick={() => setWhirlwindRoundUsed(true)}>{whirlwindRoundUsed ? "Bonus attack used this round" : "Mark bonus attack used"}</button>
                  <button type="button" onClick={() => setWhirlwindRoundUsed(false)}>New round</button>
                </div>}
              </div>}
              <label className="skill-context-option"><input type="checkbox" checked={rangedInMelee} onChange={event => setRangedInMelee(event.target.checked)} /> Ranged attack while engaged in melee (bows and two-handed ranged weapons require Deadeye)</label>
              {hasArmsmaster && <label className="skill-context-option"><input type="checkbox" checked={armsmasterToShock} onChange={event => setArmsmasterToShock(event.target.checked)} /> Armsmaster: apply Stab bonus to eligible melee Shock instead of rolled damage</label>}
              <label className="skill-context-option"><input type="checkbox" checked={preferThrownMode} onChange={event => setPreferThrownMode(event.target.checked)} /> Throw versatile weapons instead of striking in melee (Shoot skill; no melee Shock)</label>
              <div className="weapon-list">
                {displayedWeapons.map(({ name, inventoryIndex }) => {
                  const pick = { name, skill: -1 };
                  const calc = weaponCalc(pick);
                  const displayName = inventoryItemDisplayName(name);
                  return <div className="weapon-row" key={`${inventoryIndex}-${name}`}>
                    <strong className="weapon-name" title={`${calc?.w.name}: ${calc?.w.damage} damage, ${calc?.w.shock} Shock, range ${calc?.range || calc?.w.range}, traits ${calc?.w.traits || "none"}.`}>{displayName}{calc?.virtual && <small> permanent</small>}</strong>
                    {calc && <><div className="weapon-stat-cell weapon-roll-cell"><span>Hit Bonus</span><b>{signed(calc.hit)}</b><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollWeaponAttack(displayName, calc.hit)}>Roll Attack</button></div><div className="weapon-stat-cell weapon-roll-cell"><span>Damage</span><b>{calc.damage}</b><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollWeaponDamage(displayName, calc.damage, calc.shock)}>Roll Damage</button></div><div className="weapon-stat-cell weapon-range-cell"><span>Range</span><b><WeaponRangeValue range={calc.range} /></b></div><div className="weapon-details">{calc.virtual && selectedFocusPicks.some(focus => focus.name === "Unarmed Combatant" && focus.level === 2) && <div className="weapon-unarmed-miss-actions"><span>Unarmed Combatant 2 · missed Punch attack</span><button type="button" className="roll-affordance" disabled={virtualDiceBusy} onClick={() => rollUnarmedMiss(displayName, calc.shock, false)}>Roll Miss (no Shock)</button>{parseShockMinimum(calc.shock) && <button type="button" className="roll-affordance" disabled={virtualDiceBusy} title="Only select when the target is susceptible to this attack’s Shock; immunity, shielding, or other defenses may prevent it." onClick={() => rollUnarmedMiss(displayName, calc.shock, true)}>Roll Miss + Shock</button>}</div>}<span>Shock Damage / AC</span><b>{calc.shock}</b><span>Attack detail</span><small>{calc.note}</small><span>Weapon Trait Codes</span><WeaponTraitCodes traits={calc.w.traits} /></div></>}
                  </div>
                })}
                {!readiedWeapons.length && <p className="empty-slots">Your Unarmed Attack is always available. Ready a weapon on the Inventory tab to add it here.</p>}
              </div>
            </Section>
            <Section title="Foci" buildControlled aside={<span className="caption">{allowedFocusPicks} picks at level {sheet.level || "—"} · {sheet.focusPicks.length} selection {sheet.focusPicks.length === 1 ? "slot" : "slots"} shown · Level 2 normally costs two picks; repeated Spirit Familiar level 2 costs one</span>}>
              {sheet.focusPicks.map((pick, i) => {
                const focus = foci.find(f => f.name === pick.name);
                const firstSpiritIndex = sheet.focusPicks.findIndex(candidate => candidate.name === "Spirit Familiar");
                const repeatedSpiritFamiliar = pick.name === "Spirit Familiar" && firstSpiritIndex >= 0 && i !== firstSpiritIndex;
                const levelTwoCandidateCost = focusSelectionCost(sheet.focusPicks.map((candidate, index) =>
                  index === i ? { ...candidate, level: 2 } : candidate));
                return <div className={`choice-row${focusChoiceLabel(pick.name) ? " has-focus-choice" : ""}`} key={i}>
                  <select title={focus ? `${focus.intro}\n\nLevel 1: ${focus.level1}${focus.level2 ? `\n\nLevel 2: ${focus.level2}` : ""}` : "Choose a Focus"} value={pick.name} onChange={e => {
                    const next = e.target.value;
                    const eligibility = focusEligibility(next, i);
                    if (!eligibility.eligible) { setTransferMessage(eligibility.reason); return; }
                    const repeatedSpirit = next === "Spirit Familiar" && sheet.focusPicks.some((candidate, index) => index !== i && candidate.name === "Spirit Familiar");
                    const nextPicks = sheet.focusPicks.map((x,j) => j===i ? {...x,name:next,level:repeatedSpirit ? 2 : x.level,choice:""}:x);
                    patch("focusPicks", inferFocusAdvancementFlags(nextPicks, startingFocusSelections));
                  }}><option value="">Choose a Focus…</option>{foci.map(f => {
                    const eligibility = focusEligibility(f.name, i);
                    return <option key={f.name} disabled={!eligibility.eligible} title={eligibility.reason}>{f.name}{eligibility.eligible ? "" : " — unavailable"}</option>;
                  })}</select>
                  <select value={pick.level} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,level:Number(e.target.value)}:x))}><option value={1} disabled={repeatedSpiritFamiliar}>Lvl 1</option><option value={2} disabled={(sheet.level < 2 && pick.name !== "Spirit Familiar") || !focus?.level2 || (pick.level !== 2 && levelTwoCandidateCost > allowedFocusPicks)}>{repeatedSpiritFamiliar ? "Lvl 2 repeat" : "Lvl 2"}</option></select>
                  {pick.name === "Developed Attribute" && <select aria-label="Developed Attribute choice" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose attribute…</option>{attributes.map(attribute => { const available = focusTargetAvailable(sheet.focusPicks, "Developed Attribute", attribute, i); return <option key={attribute} disabled={!available}>{attribute}{available ? "" : " — already improved"}</option>; })}</select>}
                  {pick.name === "Xenoblooded" && <select aria-label="Xenoblooded gravity adaptation" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose heritage benefit…</option><option>STR +1 / DEX -1</option><option>DEX +1 / STR -1</option><option value="Other">Other non-stat benefit</option></select>}
                  {pick.name === "Traditional Education" && <select aria-label="Traditional Education tradition" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose tradition…</option><option>High Mage</option><option>Elementalist</option><option>Necromancer</option></select>}
                  {!["Developed Attribute","Xenoblooded"].includes(pick.name) && bonusSkillChoices(pick.name).length > 1 && <select aria-label={`${pick.name} bonus skill`} value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose bonus skill…</option>{bonusSkillChoices(pick.name).map(skill => { const available = pick.name !== "Specialist" || focusTargetAvailable(sheet.focusPicks, "Specialist", skill, i); return <option key={skill} disabled={!available}>{skill}{available ? "" : " — already specialized"}</option>; })}</select>}
                  {focus ? <Tip title="?"><b>{focus.name}</b><br/>{focus.intro}<br/><br/><b>Level 1:</b> {focus.level1}{pick.level === 2 && <><br/><br/><b>Level 2:</b> {focus.level2}</>}</Tip> :
                    <span className="slot-number" aria-label={`Focus selection ${i + 1}`}>{i + 1}</span>}
                  {pick.advancement && focusBonusSkill(pick) && focusCreditAtCap(focusBonusSkill(pick), advancementSkillCreditBySkill({ ...sheet, focusPicks: sheet.focusPicks.slice(0, i) }, focusCreditAtCap)) && <select className="focus-credit-redirect" aria-label={`Redirect ${pick.name} skill credit`} value={pick.redirectSkill || ""} onChange={event => patch("focusPicks", sheet.focusPicks.map((entry, index) => index === i ? { ...entry, redirectSkill: event.target.value } : entry))}><option value="">Redirect 3 skill points…</option>{skills.filter(skill => skill !== focusBonusSkill(pick)).map(skill => <option key={skill} value={skill} disabled={focusCreditAtCap(skill, advancementSkillCreditBySkill({ ...sheet, focusPicks: sheet.focusPicks.slice(0, i) }, focusCreditAtCap))}>{skill}</option>)}</select>}
                </div>
              })}
              {!sheet.focusPicks.length && <p className="empty-slots">Choose a class and level to receive Focus selection slots.</p>}
            </Section>
            {(selectedFocusPicks.some(pick => ["Poisoner", "Die Hard", "Nullifier", "Lucky", "Close Combatant", "Gifted Chirurgeon", "Trapmaster", "Rider", "Authority", "Dealmaker", "Assassin", "Armored Magic", "Spirit Familiar", "Impervious Defense", "Armsmaster", "Well Met", "Connected", "Diplomatic Grace", "Sniper’s Eye"].includes(pick.name))) && <Section title="Situational Focus Abilities">
              <div className="whirlwind-focus-controls" role="group" aria-label="Situational Focus abilities">
                <button type="button" onClick={resetFocusAbilities}>Reset tracked uses (new day / session / week as applicable)</button>
                {selectedFocusPicks.some(pick => pick.name === "Poisoner") && <div>
                  <strong>Poisoner</strong>
                  <p>Reroll a failed save against poison. Venom deals 2d6 + character level on a qualifying hit or Shock; target makes a Physical save for half. Application takes a Main Action, and venom expires after ten minutes or the first hit or Shock. Track fresh doses (up to character level) manually.</p>
                  <button type="button" disabled={virtualDiceBusy} onClick={() => void completeRoll({ category: "damage", character: rollCharacter(), label: "Poisoner — toxin (2d6 + level; Physical save halves)", dice: { count: 2, sides: 6 }, modifiers: [{ label: "Character level", value: sheet.level }] })}>Roll Toxin Damage</button>
                  
                </div>}
                {hasDieHard && <div>
                  <strong>Die Hard</strong>
                  <p>Automatically stabilize when Mortally Wounded except by dismemberment, incineration, or similar destruction.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Die Hard" && pick.level === 2) && <><p>Once each day, the first injury that would reduce you to 0 HP leaves you at 1 HP instead. Does not prevent instantly lethal trauma.</p><button type="button" disabled={Boolean(focusAbilityUsed["Die Hard 2"])} onClick={() => markFocusAbility("Die Hard 2")}>{focusAbilityUsed["Die Hard 2"] ? "Daily survival used" : "Mark daily survival used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Nullifier") && <div>
                  <strong>Nullifier</strong>
                  <p>Magical saves gain +2 (also for allies within 20 feet). The first failed magical save each day becomes a success. Sense magic within 20 feet as an On Turn action.</p>
                  <button type="button" disabled={Boolean(focusAbilityUsed["Nullifier save"])} onClick={() => markFocusAbility("Nullifier save")}>{focusAbilityUsed["Nullifier save"] ? "Daily failed-save override used" : "Mark failed magical save as success"}</button>
                  {selectedFocusPicks.some(pick => pick.name === "Nullifier" && pick.level === 2) && <><p>Once per day, ignore one unwanted magical or supernatural effect as an Instant action, even without a saving throw.</p><button type="button" disabled={Boolean(focusAbilityUsed["Nullifier immunity"])} onClick={() => markFocusAbility("Nullifier immunity")}>{focusAbilityUsed["Nullifier immunity"] ? "Daily immunity used" : "Mark immunity used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Lucky") && <div>
                  <strong>Lucky</strong>
                  <p>Once per week, avert a blow or effect that would kill, mortally wound, or render you helpless. For games of chance, roll twice and use the better result.</p>
                  <button type="button" disabled={Boolean(focusAbilityUsed["Lucky survival"])} onClick={() => markFocusAbility("Lucky survival")}>{focusAbilityUsed["Lucky survival"] ? "Weekly escape used" : "Mark weekly escape used"}</button>
                  {selectedFocusPicks.some(pick => pick.name === "Lucky" && pick.level === 2) && <><p>Once per game session when in need or peril, roll 1d6: on 2–6 something helpful happens; on 1 matters get worse. GM interprets the result.</p><button type="button" disabled={virtualDiceBusy || Boolean(focusAbilityUsed["Lucky fortune"])} onClick={() => { markFocusAbility("Lucky fortune"); void completeRoll({ category: "generic", character: rollCharacter(), label: "Lucky 2 — Fortune (2–6 helpful; 1 worse)", dice: { count: 1, sides: 6 }, modifiers: [] }); }}>{focusAbilityUsed["Lucky fortune"] ? "Session fortune used" : "Roll Fortune (1d6)"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Gifted Chirurgeon") && <div>
                  <strong>Gifted Chirurgeon</strong>
                  <p>Stabilize one adjacent Mortally Wounded creature per round as an On Turn action. Heal skill checks use 3d6, keep the best two; first aid after battle heals twice the usual HP.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Gifted Chirurgeon" && pick.level === 2) && <><p>As a Main Action heal an adjacent wounded ally for 1d6 + Heal skill. This causes 1 System Strain; it cannot heal a target already at maximum System Strain.</p><button type="button" disabled={virtualDiceBusy} onClick={() => void completeRoll({ category: "generic", character: rollCharacter(), label: "Gifted Chirurgeon 2 — healing (add 1 System Strain to target)", dice: { count: 1, sides: 6 }, modifiers: [{ label: "Heal skill", value: skillProfile("Heal").effective }] })}>Roll Curative Healing</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Trapmaster") && <div>
                  <strong>Trapmaster</strong>
                  <p>Once per scene, reroll a failed save or skill check involving traps. You can maintain one improvised trap at a time; dangerous traps inflict 1d6 + twice your level and allow a save for half.</p>
                  <button type="button" disabled={virtualDiceBusy} onClick={() => void completeRoll({ category: "damage", character: rollCharacter(), label: "Trapmaster — improvised hazard (save for half)", dice: { count: 1, sides: 6 }, modifiers: [{ label: "Twice level", value: sheet.level * 2 }] })}>Roll Trap Damage</button>
                  {selectedFocusPicks.some(pick => pick.name === "Trapmaster" && pick.level === 2) && <small>Level 2: Can attempt to unravel magical traps and arcane hazards. Consult the Focus description for conditions.</small>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Rider") && <div>
                  <strong>Rider</strong>
                  <p>Steeds have Morale 12, may use your AC if higher, and travel 50% farther each day. At level 2 you can communicate telepathically with your bonded steed within 200 feet.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Rider" && pick.level === 2) && <><p>Once per scene, negate a successful attack against your steed as an Instant action; this is separate from the once-per-scene Ride check reroll.</p><button type="button" disabled={Boolean(focusAbilityUsed["Rider negate"])} onClick={() => markFocusAbility("Rider negate")}>{focusAbilityUsed["Rider negate"] ? "Steed protection used this scene" : "Mark steed attack negated"}</button><button type="button" onClick={() => setFocusAbilityUsed(current => ({ ...current, "Rider negate": false }))}>New Rider scene</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Authority") && <div>
                  <strong>Authority</strong>
                  <p>Once per day request cooperation from a non-hostile NPC using Cha/Lead against their Morale. A request cannot be extremely uncharacteristic or significantly harmful.</p>
                  <button type="button" disabled={Boolean(focusAbilityUsed["Authority request"])} onClick={() => markFocusAbility("Authority request")}>{focusAbilityUsed["Authority request"] ? "Daily request used" : "Mark daily request used"}</button>
                  {selectedFocusPicks.some(pick => pick.name === "Authority" && pick.level === 2) && <small>Level 2: Directly led NPC followers gain Morale and hit bonuses equal to your Lead skill, plus +1 to skill checks. This does not affect PCs.</small>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Dealmaker") && <div>
                  <strong>Dealmaker</strong>
                  <p>Find available buyers and sellers with half an hour of effort, subject to GM adjudication.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Dealmaker" && pick.level === 2) && <><p>Once per session, make a comprehensible request of someone not currently trying to kill you; a plausible bargain is offered for a price or favor.</p><button type="button" disabled={Boolean(focusAbilityUsed["Dealmaker bargain"])} onClick={() => markFocusAbility("Dealmaker bargain")}>{focusAbilityUsed["Dealmaker bargain"] ? "Session bargain used" : "Mark session bargain used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Assassin") && <div>
                  <strong>Assassin</strong>
                  <p>When using a concealed knife-sized object during a surprise round, point-blank thrown and melee attacks with it cannot miss. The object can be produced as an On Turn action. Confirm that the surprise-round conditions apply with the GM.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Assassin" && pick.level === 2) && <small>Level 2: Take and split a Move action before and after an Execution Attack, too quickly to alert the victim or be stopped by bodyguards.</small>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Armored Magic") && <div>
                  <strong>Armored Magic</strong>
                  <p>Level 1: Cast spells or use Arts in armor with Encumbrance 2 or less. A shield is permitted while casting if the other hand is free for gestures.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Armored Magic" && pick.level === 2) && <small>Level 2: Spells can be cast in armor of any Encumbrance and with both hands occupied, provided they are not bound.</small>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Spirit Familiar") && <div>
                  <strong>Spirit Familiar</strong>
                  <p>The familiar can be summoned or dismissed as a Main Action. If killed, it cannot be summoned again for 24 hours. Once per day it can refresh one point of Committed Effort.</p>
                  <button type="button" disabled={Boolean(focusAbilityUsed["Spirit Familiar effort"])} onClick={() => markFocusAbility("Spirit Familiar effort")}>{focusAbilityUsed["Spirit Familiar effort"] ? "Daily Effort refresh used" : "Mark familiar Effort refresh used"}</button>
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Impervious Defense") && <div>
                  <strong>Impervious Defense</strong>
                  <p>Innate AC is 15 plus half your level rounded up; it does not stack with worn armor, but shield and Dexterity modifiers still apply.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Impervious Defense" && pick.level === 2) && <><p>Once per day, as an Instant action, shrug off one weapon attack or physical trauma inflicted by a foe. It cannot negate falling damage or other environmental harm.</p><button type="button" disabled={Boolean(focusAbilityUsed["Impervious Defense protection"])} onClick={() => markFocusAbility("Impervious Defense protection")}>{focusAbilityUsed["Impervious Defense protection"] ? "Daily protection used" : "Mark protection used"}</button></>}
                </div>}
                {hasArmsmaster && <div>
                  <strong>Armsmaster</strong>
                  <p>Benefits apply to melee and thrown weapons, not unarmed strikes or non-thrown projectiles. The skill-level bonus may be applied to a weapon’s Shock damage instead of its rolled damage. Level 2 treats targets as AC 10 for eligible melee Shock.</p>
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Well Met") && <div>
                  <strong>Well Met</strong>
                  <p>When you are present, first-time reaction rolls for encountered creatures receive +1, even when another party member speaks. Hostile creatures usually allow parley unless ambushing or clearly motivated to attack immediately. The Focus only applies once to each target.</p>
                  <button type="button" disabled={virtualDiceBusy} onClick={() => void completeRoll({ category: "generic", character: rollCharacter(), label: "Well Met — first meeting reaction (+1)", dice: { count: 2, sides: 6 }, modifiers: [{ label: "Well Met", value: 1 }] })}>Roll First Reaction (2d6+1)</button>
                  {selectedFocusPicks.some(pick => pick.name === "Well Met" && pick.level === 2) && <><p>Once per session, make the subject of a reaction roll as friendly and helpful as plausibly possible; the GM decides the circumstances.</p><button type="button" disabled={Boolean(focusAbilityUsed["Well Met reaction"])} onClick={() => markFocusAbility("Well Met reaction")}>{focusAbilityUsed["Well Met reaction"] ? "Session reaction used" : "Mark exceptional reaction used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Connected") && <div>
                  <strong>Connected</strong>
                  <p>After a week in a sufficiently friendly area, call on one contact favor per game day; the GM determines the limits of the favor.</p>
                  <button type="button" disabled={Boolean(focusAbilityUsed["Connected favor"])} onClick={() => markFocusAbility("Connected favor")}>{focusAbilityUsed["Connected favor"] ? "Daily favor used" : "Mark daily favor used"}</button>
                  {selectedFocusPicks.some(pick => pick.name === "Connected" && pick.level === 2) && <><p>Once per session, arrange a plausible meeting with someone you know who can provide a modest favor.</p><button type="button" disabled={Boolean(focusAbilityUsed["Connected meeting"])} onClick={() => markFocusAbility("Connected meeting")}>{focusAbilityUsed["Connected meeting"] ? "Session meeting used" : "Mark session meeting used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Diplomatic Grace") && <div>
                  <strong>Diplomatic Grace</strong>
                  <p>Negotiation or diplomacy checks reroll each die that shows 1 once, using the existing skill-roll option.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Diplomatic Grace" && pick.level === 2) && <><p>Once per day, consecrate a specific, time-limited bargain. Breaking it requires a Mental save unless the target or someone dear to them faces great peril.</p><button type="button" disabled={Boolean(focusAbilityUsed["Diplomatic bargain"])} onClick={() => markFocusAbility("Diplomatic bargain")}>{focusAbilityUsed["Diplomatic bargain"] ? "Daily bargain used" : "Mark consecrated bargain used"}</button></>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Sniper’s Eye") && <div>
                  <strong>Sniper’s Eye</strong>
                  <p>Ranged Execution Attacks and target shooting use the existing 3d6 skill-check option, keeping the highest two dice.</p>
                  {selectedFocusPicks.some(pick => pick.name === "Sniper’s Eye" && pick.level === 2) && <small>Level 2: Ranged Execution Attacks cannot miss; the victim suffers −4 to the Physical save against mortal injury. Successful saves still result in double normal damage.</small>}
                </div>}
                {selectedFocusPicks.some(pick => pick.name === "Close Combatant") && <div>
                  <strong>Close Combatant</strong>
                  <p>Ignore Shock from melee assailants, but doing so disrupts spellcasting that round. Level 2 also allows Fighting Withdrawal as an On Turn action without a normal action cost.</p>
                </div>}
              </div>
            </Section>}
          </div>

          <div className="stack skills-column">
            <Section title="Skills" buildControlled className="skills-section" aside={<span className="caption">Skill ranks · granted sources · effective usable value</span>}>
              <div className={`skill-budget ${advancementPointsSpent > skillPointAllowance ? "over-budget" : ""}`}>
                <strong>Advancement skill points</strong>
                <div className="skill-budget-summary">
                  <span>{skillSpending.spent} skill + {attributeBoostCost} attribute</span>
                  <span>{skillPointAllowance} total · {advancementPointsRemaining}{"\u00a0"}available</span>
                </div>
                <small>
                  {skillSpending.freePickSkill && <span className="free-creation-pick">Free creation pick: {skillSpending.freePickSkill}.</span>}
                </small>
              </div>
              <div className="skills">
                {skills.map(skill => {
                  const profile = skillProfile(skill);
                  // The selector edits the underlying trained rank before
                  // advancement-Focus credit or phantom floors are applied.
                  // This keeps paid skill points stable when a Focus is added,
                  // removed, or reselected; the final usable rank is shown
                  // separately as Effective below.
                  const minimumSelectable = minimumSkillRanks[skill];
                  const purchasesForDisplayedRank = (rank: number) => storedRankForDisplayedSkillRank(rank, profile.sourceCount);
                  return <div className="skill-row" key={skill}><label><span><span className="skill-name" title={skillOverviews[skill]} tabIndex={0}>{skill}</span>
                    {profile.sourceCount > 0 && <small className="skill-minimum" tabIndex={0}>
                      <span className="skill-minimum-word">Granted</span> {profile.sourceFloor >= 0 ? `+${profile.sourceFloor}` : "untrained"}
                      <span className="skill-minimum-popup" role="tooltip">
                        {minimumSkillSources[skill].map((source, index) => <span key={`${source}-${index}`}>{source}</span>)}
                      </span>
                    </small>}
                    {profile.polymathFloor >= 0 && profile.effective === profile.polymathFloor && profile.granted < profile.polymathFloor && <small className="focus-applied">Polymath floor → +{profile.polymathFloor}</small>}
                    {profile.credit ? <small className="focus-applied">Advancement Focus credit {profile.credit}{profile.creditRemaining ? ` · ${profile.creditRemaining} banked` : ""}</small> : null}
                    <small className="focus-applied">Effective → {profile.effective < 0 ? "Untrained" : `+${profile.effective}`}</small>
                  </span><select value={profile.granted} aria-label={`${skill} trained skill level before Focus credit`} onChange={e => {
                    const selectedRank = Number(e.target.value);
                    const nextPurchases = {...sheet.skillPurchases, [skill]: purchasesForDisplayedRank(selectedRank)};
                    const plan = calculateSkillSpending(nextPurchases);
                    const nextProfile = skillProfile(skill, nextPurchases);
                    if (nextProfile.granted !== selectedRank || nextProfile.granted < minimumSelectable) return;
                    if ((plan.spent > availableSkillPoints || exceedsCombatSkillBudget(nextPurchases)) && nextProfile.granted > skillProfile(skill).granted) return;
                    patch("skillPurchases", nextPurchases);
                  }}>
                    {[-1,0,1,2,3,4].map(n => {
                      const nextPurchases = {...sheet.skillPurchases, [skill]: purchasesForDisplayedRank(n)};
                      const plan = calculateSkillSpending(nextPurchases);
                      const nextProfile = skillProfile(skill, nextPurchases);
                      const legalCap = Math.min(4, maxSkillRank + (profile.sourceCount ? 1 : 0));
                      const disabled = n < minimumSelectable ||
                        nextProfile.granted !== n ||
                        (nextProfile.granted > legalCap && nextProfile.granted > profile.granted) ||
                        ((plan.spent > availableSkillPoints || exceedsCombatSkillBudget(nextPurchases)) && nextProfile.granted > profile.granted);
                      return <option key={n} value={n} disabled={disabled}>{n < 0 ? "Untrained" : `+${n}`}</option>;
                    })}
                  </select></label><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} aria-expanded={skillRollChooser === skill} onClick={() => { setSkillRollChooser(current => current === skill ? null : skill); setSniperEyeContext(false); setDiplomacyContext(false); }}>Roll</button>{skillRollChooser === skill && <div className="skill-roll-chooser" data-readonly-interactive="true" role="group" aria-label={`Choose an attribute for ${skill}`}><span>Roll with</span>{selectedFocusPicks.some(pick => pick.name === "Diplomatic Grace") && <label className="skill-context-option"><input type="checkbox" checked={diplomacyContext} onChange={event => setDiplomacyContext(event.target.checked)} /> Negotiation or diplomacy (Diplomatic Grace: reroll each die showing 1 once)</label>}{skill === "Shoot" && selectedFocusPicks.some(pick => pick.name === "Sniper’s Eye") && <label className="skill-context-option"><input type="checkbox" checked={sniperEyeContext} onChange={event => setSniperEyeContext(event.target.checked)} /> Ranged execution or target shooting (Sniper’s Eye: 3d6, keep highest 2)</label>}<div className="skill-roll-options">{attributes.map(attribute => <button type="button" key={attribute} disabled={virtualDiceBusy} onClick={() => rollSkillCheck(skill, attribute)}>{attribute} {signed(attributeMod(attribute))}</button>)}</div></div>}</div>;
                })}
              </div>
            </Section>
            <Section title="Languages" buildControlled aside={<span className="caption">{sheet.languages.length}/{languageAllowance} known · lingua franca + native tongue + Know/Connect bonuses</span>}>
              <label className="field language-picker">
                <span>Add language</span>
                <select value="" onChange={e => {
                  const language = e.target.value;
                  if (language && !sheet.languages.includes(language) && sheet.languages.length < languageAllowance) patch("languages", [...sheet.languages, language]);
                }}>
                  <option value="">Choose a language…</option>
                  {officialLanguages.map(language => <option key={language} value={language} disabled={sheet.languages.includes(language) || sheet.languages.length >= languageAllowance}>{language}</option>)}
                </select>
              </label>
              <div className="known-languages" aria-live="polite">
                {sheet.languages.map(language => <span className="language-chip" key={language}>{language}<button type="button" aria-label={`Remove ${language}`} title={`Remove ${language}`} onClick={() => patch("languages", sheet.languages.filter(item => item !== language))}>×</button></span>)}
                {!sheet.languages.length && <p className="empty-slots">No known languages selected.</p>}
              </div>
            </Section>
          </div>
        </div>}

        {tab === "magic" && magicalTraditions.length === 0 && <div className="nonmagic-panel"><span>⚔</span><h2>{classLabel} has no magical tradition</h2><p>This page stays out of the way for non-magical characters. Class abilities and progression are summarized on the Core Sheet.</p></div>}
        {tab === "magic" && magicalTraditions.length > 0 && <div className="magic-layout">
          <div className="magic-summary">
            <div><span>Tradition</span><b className="tradition-name">{magicalTraditions.join(" + ")}</b></div><div><span>{castingTraditions.length ? "Prepared" : "Spellcasting"}</span><b className={preparedCount > limits.prepared ? "bad":""}>{castingTraditions.length ? `${preparedCount}/${limits.prepared}` : "None"}</b></div><div><span>{isInvoker ? "Spell points used" : castingTraditions.length ? "Cast today" : "Arts known"}</span><b>{castingTraditions.length ? `${castsUsed}/${limits.casts}` : `${sheet.artPicks.filter(Boolean).length}/${artAllowance}`}</b></div><div><span>Effort committed</span><b className="effort-pools">{effortPools.map(p=><small key={p.tradition}>{p.tradition} {p.used}/{p.max}</small>)}</b></div>
          </div>
          {castingBlocked && <p className="casting-restriction" role="status"><strong>Armor restriction active:</strong> {castingBlockedReason}</p>}
          {selectedClasses.includes("Thought Noble") && <p className="casting-restriction thought-noble-rule" role="note"><strong>Thought Noble:</strong> Effort equals Notice plus the better of INT or WIS modifier, minimum 1. Thought Noble Arts may be used in armor, are invisible to non-magical senses, and a target that succeeds on a save against an Art is immune to that Art for the rest of the scene.</p>}
          {selectedClasses.includes("Vowed") && <Section title="Vowed Discipline" buildControlled><div className="vowed-controls"><label className="field"><span>Order skill (Effort + bonus skill)</span><select value={sheet.vowedEffortSkill} onChange={e=>patch("vowedEffortSkill",e.target.value)}>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label><div><span>Punch hit</span><b>{signed(vowedProgression[effectiveLevel-1].hit)}</b></div><div><span>Punch damage</span><b>{vowedProgression[effectiveLevel-1].damage}</b></div><div><span>Punch Shock</span><b>{vowedProgression[effectiveLevel-1].shock.replace("/", "/AC ")}</b></div></div><p className="section-intro">The selected Order skill is the Vowed’s required noncombat bonus skill and is also used to calculate Vowed Effort.</p></Section>}
          {selectedClasses.includes("Wise") && <Section title="Wise Concept" buildControlled><div className="vowed-controls"><label className="field"><span>Concept bonus skill</span><select value={sheet.wiseConceptSkill} onChange={e=>patch("wiseConceptSkill",e.target.value)}><option value="">Choose a concept-appropriate skill…</option>{skills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the skill most appropriate to the Wise’s concept. It is granted as the Wise class bonus skill and shown with its source on the Skills panel.</p></Section>}
          {hasBeastmaster && <Section title="Beastmaster Companion Bond" buildControlled><div className="vowed-controls"><label className="field"><span>Bond</span><select value={sheet.beastmasterBond || "bind-companion"} onChange={e=>changeBeastmasterBond(e.target.value as Sheet["beastmasterBond"])}><option value="bind-companion">Bind Companion · standard rules</option><option value="chosen-friend">Chosen Friend · campaign option</option></select></label></div><p className="section-intro">Bind Companion is the standard Beastmaster rule. Chosen Friend is an explicit campaign option: it keeps one lifelong companion and grants Shared Vitality and Mind Call benefits outside the standard Art budget.</p></Section>}
          {castingTraditions.length > 0 && <Section title="Spellbook" aside={<span className="caption">{knownSpellAllowance} known-spell selections at level {sheet.level} · spell levels 1–{limits.max} · prepare up to {limits.prepared}</span>}>
            <p className="section-intro">{isInvoker ? `Invoker spells spend points equal to spell level. You have ${limits.casts} spell points each day and may cast a prepared spell repeatedly.` : "Choose each known spell from the complete SRD list. Prepared spells are bright; unprepared spells remain muted. Press Cast each time a spell is used; Undo removes one casting if play is retconned or the button is pressed accidentally."}</p>
            <div className="spell-list">
              {sheet.spellPicks.map((pick, i) => {
                const spell = availableSpells.find(s => s.name === pick.name);
                const unavailable = spell && spell.level > limits.max;
                const castCount = spellCastCount(pick);
                const castCost = spellCastCost(isInvoker, spell?.level || 0);
                const canCast = Boolean(spell) && canRecordSpellCast({
                  prepared: pick.prepared,
                  castingBlocked,
                  used: castsUsed,
                  limit: limits.casts,
                  cost: castCost,
                });
                return <div className={`spell-row ${pick.prepared ? "prepared":"unprepared"} ${unavailable ? "locked":""} ${dragging?.kind==="spell"&&dragging.index===i ? "dragging":""}`} key={i} data-drag-kind="spell" data-drag-index={i}
                  onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=Number(e.dataTransfer.getData("text/plain"));if(Number.isInteger(from))moveItem("spell",from,i);setDragging(null)}}>
                  <button className="drag-handle" aria-label={`Reorder ${pick.name || `spell row ${i+1}`}`} title="Drag to reorder"
                    draggable onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));setDragging({kind:"spell",index:i})}} onDragEnd={()=>setDragging(null)}
                    onPointerDown={e=>beginPointerDrag("spell",i,e)} onPointerMove={e=>continuePointerDrag("spell",e)} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}>⠿</button>
                  <label className="check"><input type="checkbox" checked={pick.prepared} disabled={!pick.name || (!pick.prepared && preparedCount >= limits.prepared)} onChange={e => patch("spellPicks",sheet.spellPicks.map((x,j)=>j===i?{...x,prepared:e.target.checked}:x))}/><span>Prepared</span></label>
                  <select aria-label={`Spell selection ${i + 1}`} value={pick.name} onChange={e => {
                    const next = e.target.value;
                    if (next && !spellEligibility(next, i).eligible) { setTransferMessage(spellEligibility(next, i).reason); return; }
                    patch("spellPicks",sheet.spellPicks.map((x,j)=>j===i?{...x,name:next,cast:false,casts:0}:x));
                  }}>
                    <option value="">Choose a spell…</option>
                    {unavailable && <option value={pick.name} disabled>L{spell.level} · unavailable at this level · {pick.name}</option>}
                    {[1,2,3,4,5].flatMap(l => availableSpells.filter(s=>s.level===l && s.level<=limits.max).map(s=> {
                      const eligibility = spellEligibility(s.name, i);
                      return <option key={`${s.tradition}-${s.name}`} value={s.name} disabled={!eligibility.eligible}>L{s.level} · {s.tradition} · {s.name}{eligibility.eligible ? "" : " — already known"}</option>;
                    }))}
                  </select>
                  {spell ? <Tip title="?" ariaLabel={`Spell level ${spell.level}`}><RulesTooltip name={`${spell.name} · ${spell.tradition}`} text={spell.text} extra={`Spell level ${spell.level}.`}/></Tip> :
                    <span className="slot-number" aria-label={`Spell selection ${i + 1}`}>{i + 1}</span>}
                  <div className={`spell-cast-control ${castingBlocked ? "casting-blocked" : ""}`} title={castingBlocked ? castingBlockedReason : undefined}>
                    <button type="button" className="spell-cast-button" disabled={!canCast} onClick={() => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: castCount + 1, cast: false } : x))}>Cast</button>
                    <span className="spell-cast-count" aria-label={`${pick.name || "Spell"} cast ${castCount} ${castCount === 1 ? "time" : "times"} today`} aria-live="polite">×{castCount}</span>
                    <button type="button" className="spell-cast-undo" disabled={castCount <= 0} onClick={() => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: Math.max(0, castCount - 1), cast: false } : x))}>Undo</button>
                  </div>
                </div>
              })}
            </div>
          </Section>}
          <Section title="Arts" buildControlled aside={<span className="caption">{artTraditions.join(" + ")} · {sheet.artPicks.filter(Boolean).length}/{artAllowance} available by level {sheet.level}</span>}>
            <p className="section-intro">Commit or release Effort as required by each Art. Rest recovers scene/day Effort, not ongoing effects.</p>
            <div className="arts-grid">{sheet.artPicks.map((name, i) => {
              const art = creationArtForSelection(availableArts, name);
              const requiredArt = forcedArts[i];
              const choiceDefinition = artChoiceDefinition(name);
              const choiceKey = artChoiceKey(name);
              const choiceValues = artChoiceValues(name, sheet.artChoices);
              return <div className={`art-card ${dragging?.kind === "art" && dragging.index === i ? "dragging" : ""}`} key={i} data-drag-kind="art" data-drag-index={i}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData("text/plain")); if (Number.isInteger(from)) moveItem("art", from, i); setDragging(null); }}>
                <button className="drag-handle" aria-label={`Reorder ${name || `art row ${i + 1}`}`} title="Drag to reorder"
                  draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setDragging({ kind: "art", index: i }); }} onDragEnd={() => setDragging(null)}
                  onPointerDown={e => beginPointerDrag("art", i, e)} onPointerMove={e => continuePointerDrag("art", e)} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>⠿</button>
                <select title={art?.text || "Choose an art"} value={name} onChange={e => {
                  const next = e.target.value;
                  if (next && !artEligibility(next, i).eligible) { setTransferMessage(artEligibility(next, i).reason); return; }
                  setSheet(current => ({
                    ...current,
                    artPicks: current.artPicks.map((x, j) => j === i ? next : x),
                    artEffort: current.artEffort.map((count, j) => j === i ? 0 : artEffortCommitmentCount(count)),
                  }));
                }}><option value="">{requiredArt ? `Choose ${artSelectionName(requiredArt)}…` : "Choose an art…"}</option>{artTraditions.filter(t => t !== "Invoker").map(t => <optgroup key={t} label={t}>{availableArts.filter(a => (!requiredArt || a.value === requiredArt) && a.tradition === t).map(a => {
                  const eligibility = artEligibility(a.value, i);
                  return <option value={a.value} disabled={!eligibility.eligible} key={`${t}-${a.name}`}>{a.name}{eligibility.eligible ? "" : ` — ${eligibility.reason}`}</option>;
                })}</optgroup>)}</select>
                {choiceDefinition && <div className="art-choice-fields" aria-label={choiceDefinition.label}>
                  {choiceValues.map((value, choiceIndex) => <label className="field" key={`${choiceKey}-${choiceIndex}`}>
                    <span>{choiceDefinition.itemLabel}{choiceDefinition.count > 1 ? ` ${choiceIndex + 1}` : ""}</span>
                    <input value={value} maxLength={80} onChange={e => patch("artChoices", {
                      ...sheet.artChoices,
                      [choiceKey]: choiceValues.map((current, index) => index === choiceIndex ? e.target.value : current),
                    })} />
                  </label>)}
                  <small>{choiceDefinition.help}</small>
                </div>}
                {requiredArt && <small>Required starting Art</small>}
                {art ? <Tip title="?"><RulesTooltip name={art.name} text={art.text} extra={art.minLevel ? `Minimum level ${art.minLevel}.` : undefined}/></Tip> :
                  <span className="slot-number" aria-label={`Art selection ${i + 1}`}>{i + 1}</span>}
                {(() => {
                  const effortCount = artEffortCommitmentCount(sheet.artEffort[i]);
                  const pool = effortPools.find(p => p.tradition === art?.tradition);
                  const blockedByArmor = Boolean(art && armorRestrictedTraditions.includes(art.tradition)) && castingBlocked;
                  const canCommit = Boolean(name) && !blockedByArmor && Boolean(pool) && (pool?.used ?? 0) < (pool?.max ?? 0);
                  return <div className="art-effort-control" data-character-play-state="true" title={blockedByArmor ? castingBlockedReason : undefined}>
                    <button type="button" className="art-effort-commit" disabled={!canCommit} onClick={() => patch("artEffort", sheet.artPicks.map((_, j) => j === i ? effortCount + 1 : artEffortCommitmentCount(sheet.artEffort[j])))}>Commit</button>
                    <span className="art-effort-count" aria-label={`${art?.name || "Art"} has ${effortCount} Effort committed`} aria-live="polite">×{effortCount}</span>
                    <button type="button" className="art-effort-release" disabled={effortCount <= 0} onClick={() => patch("artEffort", sheet.artPicks.map((_, j) => j === i ? Math.max(0, effortCount - 1) : artEffortCommitmentCount(sheet.artEffort[j])))}>Release</button>
                  </div>;
                })()}
              </div>;
            })}</div>
            {!sheet.artPicks.length && <p className="empty-slots">This class has no Art selections at the current level.</p>}
          </Section>
        </div>}

        {tab === "inventory" && <div className="inventory-grid">
          <div className="inventory-toolbar">
            <button type="button" className="custom-item-save" onClick={() => setInventoryAddOpen(true)}>+ Add New Item</button>
            <span className="caption">New items go to Readied, then Stowed, then Stored as space permits.</span>
            {inventoryNotice && <span role="status" className="caption">{inventoryNotice}</span>}
          </div>
          {inventoryAddOpen && <div className="inventory-dialog-backdrop">
            <div className="inventory-dialog" role="dialog" aria-modal="true" aria-label="Add New Item">
              <h3>Add New Item</h3>
              <select aria-label="New inventory item" value={inventoryAddValue} onChange={event => setInventoryAddValue(event.target.value)}>
                <option value="">Choose an item…</option>
                <option value="__other__">Other / Custom item…</option>
                <CampaignInventoryOptions items={campaignInventoryItems} />
                {customInventoryItems.length > 0 && <optgroup label="Custom Items">{customInventoryItems.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>}
                <optgroup label="Weapons">{inventoryWeapons.map(weapon => <option key={weapon.name} value={weapon.name}>{weapon.name}</option>)}</optgroup>
                <optgroup label="Armor & Shields">{inventoryArmors.map(armor => <option key={armor} value={armor}>{armor}</option>)}</optgroup>
                <optgroup label="Adventuring Gear">{adventuringGear.map(gear => <option key={gear} value={gear}>{gear}</option>)}</optgroup>
                <optgroup label="Gear Bundles">{gearBundles.map(bundle => <option key={bundle} value={bundle}>{bundle}</option>)}</optgroup>
              </select>
              {inventoryAddValue === "__other__" && <input autoFocus aria-label="Custom item name" placeholder="Item name" value={inventoryAddCustom} onChange={event => setInventoryAddCustom(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addNewInventoryItem(); }} />}
              <div className="inventory-dialog-actions">
                <button type="button" className="drop-item" onClick={() => setInventoryAddOpen(false)}>Cancel</button>
                <button type="button" className="custom-item-save" disabled={!inventoryAddValue || (inventoryAddValue === "__other__" && !inventoryAddCustom.trim())} onClick={addNewInventoryItem}>Add Item</button>
              </div>
            </div>
          </div>}
          {inventorySwap && (() => {
            const choices = inventorySwap.destination === "readied" ? readiedSlots : stowedSlots;
            const incoming = inventorySwap.source === "stored" ? sheet.stored.filter(Boolean)[inventorySwap.index] : sheet[inventorySwap.source][inventorySwap.index];
            return <div className="inventory-dialog-backdrop">
              <div className="inventory-dialog" role="dialog" aria-modal="true" aria-label="Choose item to swap">
                <h3>{inventorySwap.destination === "readied" ? "Readied" : "Stowed"} Inventory Full</h3>
                <p>Choose an item to swap with <strong>{inventoryItemDisplayName(incoming || "")}</strong>.</p>
                <div className="inventory-swap-choices">{choices.map((item, index) => item && <button key={index} type="button" className="inventory-swap-choice" onClick={() => moveInventory(inventorySwap.source, inventorySwap.index, inventorySwap.destination, index)}>{inventoryItemDisplayName(item)}</button>)}</div>
                <button type="button" className="drop-item" onClick={() => setInventorySwap(null)}>Cancel</button>
              </div>
            </div>;
          })()}
          <Section title="Readied Items" aside={<span className="caption">{attributeScore("STR") ? `Standard capacity: ${readiedCapacity} · half STR ${attributeScore("STR")}, rounded down` : "Choose a Strength score to calculate capacity"}</span>}>
            {readiedSlots.map((item, i) => <div className={`inventory-item-row ${i >= readiedCapacity ? "inventory-overflow" : ""}`} key={i}>
              <label className="field">
                <span>{i+1}{i >= readiedCapacity ? " · Over capacity" : ""}</span>
                <select value="" aria-label={`Readied item slot ${i + 1}`} onChange={e => {
                  if (e.target.value !== "") swapReadiedWithStowed(i, Number(e.target.value));
                }}>
                  <option value="">{item ? inventoryItemDisplayName(item) : "Choose a stowed item…"}</option>
                  {stowedSlots.map((stowedItem, stowedIndex) => stowedItem && <option value={stowedIndex} key={`${stowedIndex}-${stowedItem}`}>{inventoryItemDisplayName(stowedItem)}</option>)}
                </select>
              </label>
              {item && <span className="inventory-item-actions"><button type="button" className="drop-item" onClick={() => requestInventoryMove("readied", i, "stowed")}>Stow</button><button type="button" className="drop-item" onClick={() => requestInventoryMove("readied", i, "stored")}>Store</button><button type="button" className="drop-item" onClick={() => dropInventoryItem("readied", i, item)}>Drop</button></span>}
            </div>)}
            {!readiedSlots.length && <p className="empty-slots">No Readied slots until a Strength score is selected.</p>}
          </Section>
          <Section title="Stowed Items" aside={<span className="caption">{attributeScore("STR") ? `Standard capacity: ${stowedCapacity} · equal to STR ${attributeScore("STR")}` : "Choose a Strength score to calculate capacity"}</span>}>
            {stowedSlots.map((item, i) => {
              const editingOther = otherStowedIndex === i;
              return <div className={`inventory-item-row inventory-stowed-row ${i >= stowedCapacity ? "inventory-overflow" : ""}`} key={i}>
                <div className="inventory-stowed-controls">
                  <label className="field">
                  <span>{i+1}{i >= stowedCapacity ? " · Over capacity" : ""}</span>
                  <select value={editingOther ? "__other__" : item} aria-label={`Stowed item slot ${i + 1}`} onChange={e => {
                    const transfer = decodeInventoryTransfer(e.target.value);
                    if (transfer) {
                      swapStowedBetweenOwners({ kind: "pc" }, i, transfer, transfer.index);
                      return;
                    }
                    if (e.target.value === "__other__") {
                      setOtherStowedIndex(i);
                      setOtherStowedDraftName("");
                    } else {
                      setOtherStowedIndex(null);
                      setOtherStowedDraftName("");
                      setStowedItem(i, e.target.value);
                    }
                  }}>
                    <option value="">Choose an owned item…</option>
                    {item && <option value={item}>{inventoryItemDisplayName(item)}</option>}
                    {sheet.companions.map((companion, companionIndex) => {
                      const items = inventorySlots(companion.stowed, Math.max(0, companion.strength || 0));
                      const available = items.map((name, index) => ({ name, index })).filter(entry => entry.name);
                      if (!available.length) return null;
                      return <optgroup key={companion.id} label={`${companionInventoryLabel(companion, companionIndex)}’s Stowed Items`}>
                        {available.map(entry => <option key={`${companion.id}-${entry.index}-${entry.name}`} value={encodeInventoryTransfer({ kind: "companion", id: companion.id }, entry.index)}>{inventoryItemDisplayName(entry.name)}</option>)}
                      </optgroup>;
                    })}
                  </select>
                </label>
                {editingOther && <div className="custom-item-entry">
                  <input autoFocus aria-label={`Other stowed item ${i + 1}`} placeholder="Type item name…" value={otherStowedDraftName} onChange={e => setOtherStowedDraftName(e.target.value)} onKeyDown={e => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const name = otherStowedDraftName.trim();
                    if (!name) return;
                    setStowedItem(i, name);
                    setOtherStowedIndex(null);
                    setOtherStowedDraftName("");
                  }} />
                  <button type="button" className="custom-item-save" disabled={!otherStowedDraftName.trim()} onClick={() => {
                    const name = otherStowedDraftName.trim();
                    if (!name) return;
                    setStowedItem(i, name);
                    setOtherStowedIndex(null);
                    setOtherStowedDraftName("");
                  }}>Save</button>
                </div>}
                {item && !editingOther && <span className="inventory-item-actions"><button type="button" className="drop-item" onClick={() => requestInventoryMove("stowed", i, "readied")}>Ready</button><button type="button" className="drop-item" onClick={() => requestInventoryMove("stowed", i, "stored")}>Store</button><button type="button" className="drop-item" onClick={() => dropInventoryItem("stowed", i, item)}>Drop</button></span>}
                </div>
                {!editingOther && campaignInventorySnapshot(item) && <small className="campaign-item-description"><strong>{campaignInventoryKindLabel(campaignInventorySnapshot(item)?.kind ?? "mundane")}</strong>{inventoryItemDescription(item) ? ` · ${inventoryItemDescription(item)}` : ""}</small>}
              </div>;
            })}
            {!stowedSlots.length && <p className="empty-slots">No Stowed slots until a Strength score is selected.</p>}
          </Section>
          <StoredItemsSection items={sheet.stored} campaignItems={campaignInventoryItems} customItems={customInventoryItems} campaignError={campaignInventoryError} onChange={items => patch("stored", items)} onStow={index => requestInventoryMove("stored", index, "stowed")} onReady={index => requestInventoryMove("stored", index, "readied")} />
        </div>}

        {tab === "notes" && <div className="notes-grid">
          <Section title="Goals"><label className="field"><textarea className="tall" value={sheet.goals} onChange={e=>patch("goals",e.target.value)}/></label></Section>
          <Section title="Allies & Enemies"><label className="field"><textarea className="tall" value={sheet.allies} onChange={e=>patch("allies",e.target.value)}/></label></Section>
          <Section title="Notes"><label className="field"><textarea className="very-tall" value={sheet.notes} onChange={e=>patch("notes",e.target.value)}/></label></Section>
        </div>}

        {tab.startsWith("companion:") && (() => {
          const companion = sheet.companions.find(item => `companion:${item.id}` === tab);
          if (!companion) return null;
          if (companion.kind === "beastmaster") {
            const chosenFriendCompanion = sheet.beastmasterBond === "chosen-friend";
            if (!companion.bound) return <div className="companion-grid">
              <Section
                title={chosenFriendCompanion ? "Chosen Friend" : "Beastmaster Companion"}
                aside={<span className="caption">No companion currently bound</span>}
              >
                <p className="section-intro">No creature is currently recorded as bound. After using Bind Companion in play—normally a day’s work with a suitable animal in the area, or a Main Action on an encountered animal that may resist with a Mental save—record that companion here.</p>
                <button type="button" className="text-button" onClick={() => patchCompanion(companion.id, "bound", true)}>Record a bound companion</button>
              </Section>
            </div>;
            const hasSharedVitalityArt = sheet.artPicks.some(selection => artSelectionName(selection) === "Shared Vitality");
            const mindCallIndex = sheet.artPicks.findIndex(selection => artSelectionName(selection) === "Mind Call");
            const hasMindCallArt = mindCallIndex >= 0;
            const mindCallCommitted = mindCallIndex >= 0 && Boolean(sheet.artEffort[mindCallIndex]);
            const companionRules = beastmasterCompanionRules({
              level: effectiveLevel,
              bond: sheet.beastmasterBond,
              hasSharedVitalityArt,
              hasMindCallArt,
              mindCallCommitted,
              hitDice: companion.hitDice,
              attackBonus: companion.attackBonus,
            });
            const eligibleCatalogProfiles = beastmasterCatalogCreatures();
            const companionAttackBonus = companionRules.effectiveHitBonus;
            const companionDamageExpression = extractBeastmasterDamageExpression(companion.damage);
            const companionAttackName = beastmasterAttackName(companion.damage, companion.name || "Companion");
            const catalogGroups = new Map<string, typeof eligibleCatalogProfiles>();
            for (const profile of eligibleCatalogProfiles) {
              const label = `${profile.category || "Other"} · ${profile.family || "Other"}`;
              catalogGroups.set(label, [...(catalogGroups.get(label) || []), profile]);
            }
            return <div className="companion-grid">
              <Section
                title={chosenFriendCompanion ? "Chosen Friend" : "Beastmaster Companion"}
                aside={<span className="caption">{chosenFriendCompanion ? "Lifelong bond · Shared Vitality + Mind Call" : "Bound animal companion"}</span>}
              >
                <div className="two-col">
                  <Field label="Name" value={companion.name} onChange={value => patchCompanion(companion.id, "name", value)} />
                  <label className="field"><span>Bestiary profile</span><select value={companion.bestiaryId || ""} onChange={event => chooseBeastmasterCatalogProfile(companion.id, event.target.value)}><option value="">Custom creature…</option>{[...catalogGroups.entries()].map(([label, profiles]) => <optgroup key={label} label={label}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {formatBeastmasterHitDice(profile.sourceStats.hitDice)}</option>)}</optgroup>)}</select></label>
                </div>
                <Field label="Appearance / details" value={companion.description} onChange={value => patchCompanion(companion.id, "description", value)} />
                <button type="button" className="text-button" onClick={() => patchCompanion(companion.id, "bound", false)}>Release companion</button>
                <div className="companion-stats">
                  <Field label="Base Hit Dice" value={companion.hitDice} onChange={value => patchCompanion(companion.id, "hitDice", value)} />
                  <label className="field"><span>Effective Hit Dice</span><input readOnly value={formatBeastmasterHitDice(companionRules.effectiveHitDice)} /></label>
                  <label className="field"><span>Hit Points</span><span className="companion-hp"><input type="number" min={0} value={companion.hpCurrent || ""} onChange={e => patchCompanion(companion.id, "hpCurrent", Math.max(0, Number(e.target.value) || 0))} aria-label="Current hit points" /><i>/</i><input type="number" min={0} value={companion.hpMax || ""} onChange={e => patchCompanion(companion.id, "hpMax", Math.max(0, Number(e.target.value) || 0))} aria-label="Maximum hit points" /></span></label>
                  <label className="field"><span>Armor Class</span><input type="number" value={companion.ac || ""} onChange={e => patchCompanion(companion.id, "ac", Math.max(0, Number(e.target.value) || 0))} /></label>
                  <Field label="Movement" value={companion.move} onChange={value => patchCompanion(companion.id, "move", value)} />
                  <label className="field companion-roll-field"><span>Base Attack Bonus</span><span className="companion-roll-control"><input value={companion.attackBonus} onChange={event => patchCompanion(companion.id, "attackBonus", event.target.value)} /><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy || companionAttackBonus === null} aria-busy={virtualDiceBusy || undefined} onClick={() => companionAttackBonus !== null && rollWeaponAttack(companionAttackName, companionAttackBonus)}>Roll Attack</button></span></label>
                  <label className="field"><span>Effective Hit Bonus</span><input readOnly value={formatBeastmasterHitBonus(companionRules.effectiveHitBonus)} /></label>
                  <label className="field companion-roll-field"><span>Damage / Attack</span><span className="companion-roll-control"><input value={companion.damage} onChange={event => patchCompanion(companion.id, "damage", event.target.value)} /><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy || !companionDamageExpression} aria-busy={virtualDiceBusy || undefined} onClick={() => companionDamageExpression && rollWeaponDamage(companionAttackName, companionDamageExpression, companion.damage)}>Roll Damage</button></span></label>
                  <Field label="Skill Bonus" value={companion.skillBonus} onChange={value => patchCompanion(companion.id, "skillBonus", value)} />
                  <Field label="Morale" value={companion.morale} onChange={value => patchCompanion(companion.id, "morale", value)} />
                  <Field label="Instinct" value={companion.instinct} onChange={value => patchCompanion(companion.id, "instinct", value)} />
                  <label className="field"><span>Save</span><input type="number" min={1} value={companion.physicalSave || ""} onChange={e => patchCompanion(companion.id, "physicalSave", Math.max(1, Number(e.target.value) || 1))} /></label>
                  <label className="field"><span>Strength score</span><input type="number" min={0} max={30} value={companion.strength || ""} onChange={e => patchCompanion(companion.id, "strength", Math.max(0, Number(e.target.value) || 0))} /></label>
                </div>
                {chosenFriendCompanion && companion.hpCurrent <= 0 && companion.hpMax > 0 && <button type="button" className="text-button" onClick={() => patchCompanion(companion.id, "hpCurrent", companion.hpMax)}>Restore at next dawn</button>}
              </Section>
              <Section title="Companion Notes" className="companion-notes"><textarea className="tall" value={companion.notes} onChange={e => patchCompanion(companion.id, "notes", e.target.value)} /></Section>
            </div>;
          }
          const familiar = companion.kind === "familiar";
          const familiarFocus = familiar ? spiritFamiliars[0]?.pick : undefined;
          const focusLevel = familiar ? (familiarFocus?.level || 1) : (henchkeeper?.level || 1);
          const archetype = npcArchetypes.find(item => item.name === companion.archetype) || npcArchetypes[0];
          const archetypeAttrs = companionAttributes(archetype);
          const henchmanProfile = focusLevel >= 2
            ? {
                name: "2 HD combatant",
                hitDice: "2 HD",
                ac: "13 (armored)",
                attack: "+2",
                damage: "Weapon +1",
                shock: "Weapon +1",
                move: "30′",
                morale: "8",
                instinct: "3",
                skill: "+1",
                save: "15+",
              }
            : {
                name: "Peaceful Human",
                hitDice: "1 HD",
                ac: "10",
                attack: "+0",
                damage: "Weapon",
                shock: "Weapon",
                move: "30′",
                morale: "7",
                instinct: "5",
                skill: "+1",
                save: "15+",
              };
          const companionStrength = familiar ? companion.strength : archetypeAttrs.STR;
          const readiedCapacity = Math.max(0, Math.floor((companionStrength || 0) / 2));
          const stowedCapacity = Math.max(0, companionStrength || 0);
          const companionReadied = inventorySlots(companion.readied, readiedCapacity);
          const companionStowed = inventorySlots(companion.stowed, stowedCapacity);
          const companionReadiedWeapons = companionReadied
            .map((name, inventoryIndex) => ({
              inventoryIndex,
              weapon: inventoryWeapons.find(weapon => weapon.name === name),
            }))
            .filter((item): item is { inventoryIndex: number; weapon: typeof inventoryWeapons[number] } => Boolean(item.weapon));
          const equippedArmor = armors.find(armor => companionReadied.includes(armor.name));
          const equippedShield = companionReadied.includes("Large Shield") ? "Large Shield" : companionReadied.includes("Small Shield") ? "Small Shield" : "";
          const shieldAc = equippedShield === "Large Shield" ? 14 : equippedShield === "Small Shield" ? 13 : 0;
          const armorAc = equippedArmor?.ac || 10;
          const equippedAc = shieldAc ? (armorAc >= shieldAc ? armorAc + 1 : shieldAc) : armorAc;
          const companionAc = familiar ? companion.ac : Math.max(Number(henchmanProfile.ac.match(/\d+/)?.[0] || 10), equippedAc);
          const familiarBenefits = companion.familiarBenefits || [];
          const activeFamiliarBenefits = familiarBenefits.slice(0, spiritFamiliarBenefitCap);
          const familiarMaxHp = spiritFamiliarMaximumHitPoints(
            effectiveLevel,
            activeFamiliarBenefits.includes(spiritFamiliarTripleHpBenefit),
          );
          const familiarAttack = activeFamiliarBenefits.includes(spiritFamiliarAttackBenefit)
            ? signed(Math.ceil(effectiveLevel / 2))
            : "No effective attack";
          const familiarDamage = activeFamiliarBenefits.includes(spiritFamiliarAttackBenefit) ? "1d8" : "—";
          const familiarSkill = activeFamiliarBenefits.includes(spiritFamiliarSkillBenefit) ? "+1" : "+0";
          const familiarMovement = activeFamiliarBenefits.includes(spiritFamiliarFlightBenefit)
            ? "30′ · hover/fly"
            : "30′";
          const henchmanHpDice = focusLevel >= 2 ? 2 : 1;
          // Preserve the recorded higher-level roll when toggling the Focus,
          // but never display a 2d8 total as a legal 1d8 total at level 1.
          const henchmanRolledHp = companion.hpRolled
            ? Math.max(henchmanHpDice, Math.min(henchmanHpDice * 8, companion.hpRolled))
            : 0;
          const displayedCompanionHp = familiar
            ? Math.min(familiarMaxHp, Math.max(0, companion.hpCurrent))
            : henchmanRolledHp ? Math.min(henchmanRolledHp, Math.max(0, companion.hpCurrent)) : 0;
          const companionWeaponProfile = (weapon: typeof inventoryWeapons[number] | null) => {
            const isUnarmed = weapon === null;
            if (isUnarmed) {
              const ability = archetypeAttrs.STR >= archetypeAttrs.DEX ? "STR" : "DEX";
              const abilityModifier = familiar ? 0 : companionAttributeModifier(archetype, ability);
              const attack = familiar
                ? familiarAttack
                : signed((focusLevel >= 2 ? 2 : 0) + abilityModifier);
              const damage = familiar
                ? familiarDamage
                : `1d2${abilityModifier ? signed(abilityModifier) : ""}`;
              return {
                ability,
                skill: "Punch",
                attack,
                damage,
                shock: "None",
                note: familiar && !activeFamiliarBenefits.includes(spiritFamiliarAttackBenefit)
                  ? "No effective attack unless the level 2 attack benefit is selected"
                  : "Permanent unarmed attack",
              };
            }
            const isMelee = weapon.range === "-";
            const isThrown = weapon.traits.split(",").map(trait => trait.trim()).includes("T");
            const ability = weapon.attribute === "Dex" ? "DEX" : weapon.attribute === "Str" ? "STR" : (archetypeAttrs.STR >= archetypeAttrs.DEX ? "STR" : "DEX");
            const abilityModifier = familiar ? 0 : companionAttributeModifier(archetype, ability);
            const skill = isMelee || isThrown ? "Stab" : "Shoot";
            // Henchkeeper gives a normal NPC combat profile; archetypes do not grant
            // combat-skill ranks. Ability still matters to the wielded weapon.
            const attack = familiar ? familiarAttack : signed((focusLevel >= 2 ? 2 : 0) + abilityModifier);
            const damageBonus = familiar ? 0 : abilityModifier + (focusLevel >= 2 ? 1 : 0);
            const damage = familiar ? familiarDamage : `${weapon.damage}${damageBonus ? signed(damageBonus) : ""}`;
            const shock = (() => {
              if (familiar || weapon.shock === "None") return weapon.shock;
              const match = weapon.shock.match(/^(\d+)\/AC\s*(\d+)$/i);
              return match ? `${Number(match[1]) + abilityModifier + (focusLevel >= 2 ? 1 : 0)}/AC ${match[2]}` : weapon.shock;
            })();
            return { ability, skill, attack, damage, shock };
          };
          const setCompanionStowedItem = (index: number, value: string) => {
            patchCompanion(companion.id, "stowed", companionStowed.map((item, itemIndex) => itemIndex === index ? value : item));
          };
          const swapCompanionItem = (readiedIndex: number, stowedIndex: number) => {
            setCompanionOtherStowed(current => ({ ...current, [companion.id]: null }));
            setCompanionOtherStowedDrafts(current => ({ ...current, [companion.id]: "" }));
            setSheet(current => ({
              ...current,
              companions: current.companions.map(item => {
                if (item.id !== companion.id) return item;
                const nextReadied = inventorySlots(item.readied, readiedCapacity);
                const nextStowed = inventorySlots(item.stowed, stowedCapacity);
                const oldReadied = nextReadied[readiedIndex] || "";
                nextReadied[readiedIndex] = nextStowed[stowedIndex] || "";
                nextStowed[stowedIndex] = oldReadied;
                return { ...item, readied: nextReadied, stowed: nextStowed };
              }),
            }));
          };
          const dropCompanionItem = (location: "readied" | "stowed", index: number, item: string) => {
            if (!window.confirm(`Drop ${inventoryItemDisplayName(item)}?\n\nThis removes it from ${companion.name || "the companion"}’s inventory.`)) return;
            const capacity = location === "readied" ? readiedCapacity : stowedCapacity;
            patchCompanion(
              companion.id,
              location,
              compactInventory(
                inventorySlots(companion[location], capacity).filter((_, itemIndex) => itemIndex !== index),
                capacity,
              ),
            );
          };
          return <div className="companion-grid">
            <Section title={familiar ? "Spirit Familiar" : "Henchkeeper Companion"} aside={<span className="caption">{familiar ? `${companion.summoned === false ? "Dismissed" : "Summoned"} · summon or dismiss as a Main Action` : `${henchmanProfile.name} profile`}</span>}>
              <div className="two-col">
                <Field label="Name" value={companion.name} onChange={value => patchCompanion(companion.id, "name", value)} />
                {familiar
                  ? <Field label="Form / Appearance" value={companion.description} onChange={value => patchCompanion(companion.id, "description", value)} />
                  : <label className="field"><span>NPC archetype</span><select value={archetype.name} onChange={e => {
                    const nextArchetype = npcArchetypes.find(option => option.name === e.target.value) || npcArchetypes[0];
                    setSheet(current => ({
                      ...current,
                      companions: current.companions.map(item => item.id === companion.id
                        ? { ...item, archetype: nextArchetype.name }
                        : item),
                    }));
                  }}>{npcArchetypes.map(option => <option key={option.name}>{option.name}</option>)}</select></label>}
              </div>
              {familiar && <>
                <div className="familiar-status">
                  <label><input type="checkbox" checked={companion.summoned !== false} onChange={e => patchCompanion(companion.id, "summoned", e.target.checked)} />Currently summoned</label>
                  <label><input type="checkbox" checked={Boolean(companion.effortRefreshUsed)} onChange={e => patchCompanion(companion.id, "effortRefreshUsed", e.target.checked)} />Daily Effort refresh used</label>
                </div>
                <p className="section-intro familiar-rules">Absolutely loyal and telepathically linked; needs no food, water, or sleep and can act as a competent human servant. It carries nothing when dismissed. If killed, it cannot be summoned again for 24 hours. Once per day it refreshes one point of your Committed Effort.</p>
              </>}
              {!familiar && <>
                <Field label="Culture / Role details" value={companion.description} onChange={value => patchCompanion(companion.id, "description", value)} />
                <div className="archetype-summary">
                  <div><strong>Strengths</strong><p>{archetype.strengths}</p></div>
                  <div><strong>Weaknesses</strong><p>{archetype.weaknesses}</p></div>
                  <div><strong>Competent skills</strong><p>{archetype.skills}</p></div>
                </div>
                <div className="companion-attributes">{attributes.map(attribute => <div key={attribute}><span>{attribute}</span><b>{archetypeAttrs[attribute]}</b><small>{signed(companionAttributeModifier(archetype, attribute))}</small></div>)}</div>
              </>}
              <div className="companion-stats">
                <label className="field"><span>Hit Dice</span><input readOnly value={familiar ? "Not specified" : henchmanProfile.hitDice} /></label>
                {!familiar && <label className="field"><span>Rolled HP ({henchmanHpDice}d8 total)</span><input type="number" min={henchmanHpDice} max={henchmanHpDice * 8} value={companion.hpRolled || ""} placeholder={`Roll ${henchmanHpDice}d8`} onChange={e => {
                  const rolled = Math.max(0, Math.min(henchmanHpDice * 8, Number(e.target.value)));
                  const maximum = rolled ? Math.max(henchmanHpDice, rolled) : 0;
                  setSheet(current => ({
                    ...current,
                    companions: current.companions.map(item => item.id === companion.id
                      ? { ...item, hpRolled: rolled, hpMax: maximum, hpCurrent: maximum }
                      : item),
                  }));
                }} /></label>}
                <label className="field"><span>Hit Points</span><span className="companion-hp"><input type="number" value={displayedCompanionHp || ""} onChange={e => patchCompanion(companion.id, "hpCurrent", Math.max(0, Math.min(familiar ? familiarMaxHp : henchmanRolledHp, Number(e.target.value))))} aria-label="Current hit points" /><i>/</i><input type="number" value={familiar ? familiarMaxHp : (companion.hpRolled ? henchmanRolledHp : "")} readOnly aria-label="Maximum hit points" /></span></label>
                <label className="field"><span>Armor Class</span><input readOnly value={companionAc} /></label>
                <label className="field"><span>Movement</span><input readOnly value={familiar ? familiarMovement : henchmanProfile.move} /></label>
                <label className="field"><span>Attack Bonus</span><input readOnly value={familiar ? familiarAttack : henchmanProfile.attack} /></label>
                <label className="field"><span>Damage</span><input readOnly value={familiar ? familiarDamage : "By readied weapon"} /></label>
                {!familiar && <label className="field"><span>Shock</span><input readOnly value="By readied weapon" /></label>}
                <label className="field"><span>Skill Bonus</span><input readOnly value={familiar ? familiarSkill : henchmanProfile.skill} /></label>
                <label className="field"><span>Morale</span><input readOnly value={familiar ? companion.morale : henchmanProfile.morale} /></label>
                {!familiar && <label className="field"><span>Instinct</span><input readOnly value={henchmanProfile.instinct} /></label>}
              </div>
              {familiar
                ? <div className="companion-saves"><span>Saves match {sheet.name || "the owner"}:</span>{Object.entries(saves).map(([name, value]) => <b key={name}>{name} {value}</b>)}</div>
                : <div className="companion-saves"><span>NPC save:</span><b>{henchmanProfile.save}</b><span>The archetype describes ordinary aptitudes; Henchkeeper level controls combat competence and loyalty. Level 1 fights only in self-defense. Level 2 fights unless the odds are clearly overwhelming.</span></div>}
              <div className="companion-weapons">
                <h3>Readied weapons</h3>
                <div className="weapon-list">
                  {(() => {
                    const profile = companionWeaponProfile(null);
                    return <div className="weapon-row" key="companion-unarmed-attack">
                      <strong className="weapon-name">Unarmed Attack</strong>
                      <div><span>Hit Bonus</span><b>{profile.attack}</b></div>
                      <div><span>Damage</span><b>{profile.damage}</b></div>
                      <div><span>Range</span><b>-</b></div>
                      <div className="weapon-details"><span>{profile.ability} · {profile.skill}</span><b>{profile.shock}</b><span>{profile.note}</span></div>
                    </div>;
                  })()}
                  {companionReadiedWeapons.map(({ weapon, inventoryIndex }) => {
                    const profile = companionWeaponProfile(weapon);
                    return (
                    <div className="weapon-row" key={`${inventoryIndex}-${weapon.name}`}>
                      <strong className="weapon-name" title={`${weapon.name}: ${weapon.damage} damage, ${weapon.shock} Shock, range ${weapon.range}, traits ${weapon.traits || "none"}.`}>{weapon.name}</strong>
                      <div><span>Hit Bonus</span><b>{profile.attack}</b></div>
                      <div><span>Damage</span><b>{profile.damage}</b></div>
                      <div><span>Range</span><b><WeaponRangeValue range={weapon.range} /></b></div>
                      {!familiar && <div className="weapon-details"><span>{profile.ability} · {profile.skill} · Shock Damage / AC</span><b>{profile.shock}</b><span>Weapon Trait Codes</span><WeaponTraitCodes traits={weapon.traits} /></div>}
                    </div>
                  );})}
                  {!companionReadiedWeapons.length && <p className="empty-slots">Your Unarmed Attack is always available. Ready a weapon below to add it here.</p>}
                </div>
              </div>
              {familiar && spiritFamiliarBenefitCap > 0 && <div className="familiar-benefits">
                <strong>Level 2 benefits <small>Choose {spiritFamiliarBenefitCap}</small></strong>
                {spiritFamiliarBenefits.map(benefit => {
                  const chosen = activeFamiliarBenefits.includes(benefit);
                  const atLimit = !chosen && activeFamiliarBenefits.length >= spiritFamiliarBenefitCap;
                  return <label key={benefit}><input type="checkbox" checked={chosen} disabled={atLimit || !canEdit} onChange={e => {
                    if (!canEdit) return;
                    const nextBenefits = e.target.checked
                      ? [...familiarBenefits.filter(item => item !== benefit), benefit]
                      : familiarBenefits.filter(item => item !== benefit);
                    const nextActiveBenefits = nextBenefits.slice(0, spiritFamiliarBenefitCap);
                    const nextMaximum = spiritFamiliarMaximumHitPoints(
                      effectiveLevel,
                      nextActiveBenefits.includes(spiritFamiliarTripleHpBenefit),
                    );
                    const hitPoints = reconcileSpiritFamiliarHitPoints(
                      companion.hpCurrent,
                      companion.hpMax,
                      nextMaximum,
                    );
                    setSheet(current => ({
                      ...current,
                      companions: current.companions.map(item => item.id === companion.id
                        ? {
                            ...item,
                            familiarBenefits: nextBenefits,
                            hpCurrent: hitPoints.current,
                            hpMax: hitPoints.maximum,
                          }
                        : item),
                    }));
                  }} />{benefit}</label>;
                })}
                {activeFamiliarBenefits.includes(spiritFamiliarSkillBenefit) && <label className="field familiar-background">
                  <span>Skilled background</span>
                  <select value={companion.familiarBackground || ""} onChange={e => patchCompanion(companion.id, "familiarBackground", e.target.value)}>
                    <option value="">Choose background…</option>
                    {backgroundNames.map(background => <option key={background}>{background}</option>)}
                  </select>
                </label>}
                {activeFamiliarBenefits.includes(spiritFamiliarShapeBenefit) && <Field
                  label="Additional shape"
                  value={companion.familiarAdditionalShape || ""}
                  onChange={value => patchCompanion(companion.id, "familiarAdditionalShape", value)}
                />}
              </div>}
            </Section>
            <Section title="Inventory" aside={<span className="caption">Readied {readiedCapacity} · Stowed {stowedCapacity} from Strength</span>}>
              <label className="field companion-strength"><span>Strength score</span><input type="number" min="0" max="30" value={companionStrength || ""} readOnly={!familiar} onChange={e => familiar && patchCompanion(companion.id, "strength", Number(e.target.value))} /></label>
              {familiar && <p className="section-intro">A dismissed familiar cannot take carried objects with it.</p>}
              <h3 className="companion-inventory-title">Readied items</h3>
              {companionReadied.map((item, index) => <div className={`inventory-item-row ${index >= readiedCapacity ? "inventory-overflow" : ""}`} key={`r-${index}`}>
                <label className="field"><span>{index + 1}{index >= readiedCapacity ? " · Over capacity" : ""}</span><select value="" aria-label={`Companion readied item slot ${index + 1}`} onChange={e => { if (e.target.value !== "") swapCompanionItem(index, Number(e.target.value)); }}>
                  <option value="">{item ? inventoryItemDisplayName(item) : "Choose a stowed item…"}</option>
                  {companionStowed.map((stowedItem, stowedIndex) => stowedItem && <option value={stowedIndex} key={`${stowedIndex}-${stowedItem}`}>{inventoryItemDisplayName(stowedItem)}</option>)}
                </select></label>
                {item && <button type="button" className="drop-item" onClick={() => dropCompanionItem("readied", index, item)}>Drop</button>}
              </div>)}
              {!companionReadied.length && <p className="empty-slots">No Readied slots until a Strength score is selected.</p>}
              <h3 className="companion-inventory-title">Stowed items</h3>
              {companionStowed.map((item, index) => {
                const editingOther = companionOtherStowed[companion.id] === index;
                const draftName = companionOtherStowedDrafts[companion.id] || "";
                return <div className={`inventory-item-row inventory-stowed-row ${index >= stowedCapacity ? "inventory-overflow" : ""}`} key={`s-${index}`}>
                  <div className="inventory-stowed-controls">
                    <label className="field"><span>{index + 1}{index >= stowedCapacity ? " · Over capacity" : ""}</span>
                    <select value={editingOther ? "__other__" : item} aria-label={`Companion stowed item slot ${index + 1}`} onChange={e => {
                      const transfer = decodeInventoryTransfer(e.target.value);
                      if (transfer) {
                        swapStowedBetweenOwners({ kind: "companion", id: companion.id }, index, transfer, transfer.index);
                        return;
                      }
                      if (e.target.value === "__other__") {
                        setCompanionOtherStowed(current => ({ ...current, [companion.id]: index }));
                        setCompanionOtherStowedDrafts(current => ({ ...current, [companion.id]: "" }));
                      } else {
                        setCompanionOtherStowed(current => ({ ...current, [companion.id]: null }));
                        setCompanionOtherStowedDrafts(current => ({ ...current, [companion.id]: "" }));
                        setCompanionStowedItem(index, e.target.value);
                      }
                    }}>
                      <option value="">Choose an owned item…</option>
                    {item && <option value={item}>{inventoryItemDisplayName(item)}</option>}
                      {(() => {
                        const pcName = sheet.name || "PC";
                        const available = stowedSlots.map((name, itemIndex) => ({ name, itemIndex })).filter(entry => entry.name);
                        return available.length ? <optgroup label={`${pcName}’s Stowed Items`}>
                          {available.map(entry => <option key={`pc-${entry.itemIndex}-${entry.name}`} value={encodeInventoryTransfer({ kind: "pc" }, entry.itemIndex)}>{inventoryItemDisplayName(entry.name)}</option>)}
                        </optgroup> : null;
                      })()}
                      {sheet.companions.map((otherCompanion, otherIndex) => {
                        if (otherCompanion.id === companion.id) return null;
                        const items = inventorySlots(otherCompanion.stowed, Math.max(0, otherCompanion.strength || 0));
                        const available = items.map((name, itemIndex) => ({ name, itemIndex })).filter(entry => entry.name);
                        if (!available.length) return null;
                        return <optgroup key={otherCompanion.id} label={`${companionInventoryLabel(otherCompanion, otherIndex)}’s Stowed Items`}>
                          {available.map(entry => <option key={`${otherCompanion.id}-${entry.itemIndex}-${entry.name}`} value={encodeInventoryTransfer({ kind: "companion", id: otherCompanion.id }, entry.itemIndex)}>{inventoryItemDisplayName(entry.name)}</option>)}
                        </optgroup>;
                      })}
                    </select>
                  </label>
                  {editingOther && <div className="custom-item-entry">
                    <input autoFocus aria-label={`Other companion stowed item ${index + 1}`} placeholder="Type item name…" value={draftName} onChange={e => setCompanionOtherStowedDrafts(current => ({ ...current, [companion.id]: e.target.value }))} />
                    <button type="button" className="custom-item-save" disabled={!draftName.trim()} onClick={() => {
                      const name = draftName.trim();
                      if (!name) return;
                      setCompanionStowedItem(index, name);
                      setCompanionOtherStowed(current => ({ ...current, [companion.id]: null }));
                      setCompanionOtherStowedDrafts(current => ({ ...current, [companion.id]: "" }));
                    }}>Save</button>
                  </div>}
                  {item && !editingOther && <button type="button" className="drop-item" onClick={() => dropCompanionItem("stowed", index, item)}>Drop</button>}
                </div>
                  {!editingOther && campaignInventorySnapshot(item) && <small className="campaign-item-description"><strong>{campaignInventoryKindLabel(campaignInventorySnapshot(item)?.kind ?? "mundane")}</strong>{inventoryItemDescription(item) ? ` · ${inventoryItemDescription(item)}` : ""}</small>}
                </div>;
              })}
              {!companionStowed.length && <p className="empty-slots">No Stowed slots until a Strength score is selected.</p>}
            </Section>
            <Section title="Companion Notes" className="companion-notes"><textarea className="tall" value={companion.notes} onChange={e => patchCompanion(companion.id, "notes", e.target.value)} /></Section>
          </div>;
        })()}

        {cloudId && canEdit && cloudArchivedAt && <section className="character-lifecycle-status" data-readonly-interactive="true" aria-label="Archived character status">
          <div><strong>Archived Character</strong><small>This folio remains intact and existing campaign links still work.</small></div>
          <button type="button" onClick={() => void restoreArchivedCharacter()}>Restore to My Characters</button>
        </section>}
        {cloudId && canEdit && <section className="character-bottom-utilities" data-readonly-interactive="true" aria-label="Character utilities">
          <div className="character-edit-utility">
            <span className="character-utility-label">Character</span>
            {characterEditMode ? <div className="character-edit-actions">
              <button type="button" className="character-utility-primary" onClick={() => void saveCharacterEdits()}>Save Character</button>
              <button type="button" onClick={cancelCharacterEdits}>Cancel</button>
            </div> : <button type="button" onClick={beginCharacterEdit} disabled={Boolean(cloudArchivedAt)}>Edit Character</button>}
          </div>
          {campaignLinks.length > 0 && <details className="character-campaign-utility">
            <summary>Campaigns ({campaignLinks.length})</summary>
            <nav aria-label="Campaigns linked to this character">
              {campaignLinks.map(campaign => <a key={campaign.id} href={`/campaigns/${campaign.id}`}>{campaign.name}<span aria-hidden="true">→</span></a>)}
            </nav>
          </details>}
          <label className="character-visibility-utility"><span>Visibility</span><select value={cloudVisibility} onChange={event => void changeVisibility(event.target.value as CharacterVisibility)}>
            <option value="private">Private · only you</option>
            <option value="unlisted">Unlisted · anyone with link</option>
            <option value="public">Public · discoverable</option>
          </select></label>
          {cloudVisibility !== "private" && <button type="button" className="character-share-utility" onClick={() => void copyShareLink()}>Copy Share Link</button>}
          <small className="character-utility-status">{characterEditMode ? "Foundational fields unlocked until saved or cancelled." : "Foundational fields locked. Play-state fields remain editable."}</small>
        </section>}
        </>}
      </div>
    </main>
  );
}
