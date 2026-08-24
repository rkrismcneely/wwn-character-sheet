"use client";

/* eslint-disable @next/next/no-img-element -- portraits can be local blobs or user-uploaded URLs */

import { useEffect, useMemo, useRef, useState } from "react";
import { foci, highMageArts, highMagic, weapons } from "./wwn-data";
import { artSlots, casterLimits, classRules, dualCasterLimits, fullClasses, invokerLimits, knownSpellSlots, partialClasses, traditionInfo, traditionKinds, traditionSpells, vowedProgression, type TraditionName } from "./class-data";
import { backgroundNames, backgrounds } from "./background-data";
import {
  activeBackgroundDevelopmentEntries,
  backgroundAttributeBonuses,
  backgroundAttributeChoices,
  backgroundAttributePointCount,
  blankBackgroundDevelopmentRoll,
  blankBackgroundDevelopmentRolls,
  blankBackgroundLearningPicks,
  normalizeBackgroundDevelopment,
  resolveBackgroundSkillGrants,
  resolvedBackgroundRollResult,
  rollBackgroundTable,
  type BackgroundDevelopmentLegacy,
  type BackgroundDevelopmentMethod,
  type BackgroundDevelopmentRoll,
  type BackgroundLearningPick,
  type BackgroundSkillGrant,
} from "./background-development";
import { searchRules, type RuleEntry } from "./rules-search";
import { clearRollHistory, persistRollHistory, prependRollHistory, readRollHistory } from "./roll-history";
import { RollHistoryPanel, RollResultTray } from "./roll-presentation";
import { parseDamageExpression, resolveRoll, type RollRequest, type RollResult } from "./rolls";
import { rollDice, type DiceRoll } from "./dice";
import { useDisplayTheme } from "./theme-provider";
import { useDiceStylePreference, useVirtualDicePreference } from "./virtual-dice-preference";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "./virtual-dice-overlay";
import { armorRestrictsMagic, deriveSkillProfile, deriveUnarmedAttack, explicitFocusSkillChoices, focusIsRepeatable, focusTargetAvailable, reconcileFamiliarSlots, storedRankForDisplayedSkillRank } from "./phase2-rules";
import { authClient } from "@/lib/auth-client";
import { TalesBrandLink } from "./app-header";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";
import type { CharacterVisibility } from "@/lib/characters/authorization";

type Tab = "core" | "magic" | "inventory" | "notes" | `companion:${string}`;
type AttributeMethod = "rolled" | "array";
type AttributeName = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
type FocusPick = { name: string; level: number; choice?: string };
type WeaponPick = { name: string; skill: number };
type SpellPick = { name: string; prepared: boolean; cast: boolean; casts?: number };
type CompanionKind = "henchman" | "familiar";
type InventoryOwner = { kind: "pc" } | { kind: "companion"; id: string };
type Companion = {
  id: string;
  kind: CompanionKind;
  name: string;
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
  skillBonus: string;
  strength: number;
  readied: string[];
  stowed: string[];
  familiarBenefits: string[];
  familiarBackground?: string;
  /** The Focus row that created this companion. Keeps repeatable familiars distinct. */
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
const armors = [
  { name: "No Armor", ac: 10, enc: 0 }, { name: "War Shirt", ac: 11, enc: 0 }, { name: "Buff Coat", ac: 12, enc: 0 },
  { name: "Linothorax", ac: 13, enc: 1 }, { name: "War Robe", ac: 14, enc: 3 }, { name: "Pieced Armor", ac: 14, enc: 2 },
  { name: "Mail Shirt", ac: 14, enc: 1 }, { name: "Cuirass and Greaves", ac: 15, enc: 2 }, { name: "Scaled Armor", ac: 16, enc: 3 },
  { name: "Mail Hauberk", ac: 16, enc: 2 }, { name: "Plate Armor", ac: 17, enc: 2 }, { name: "Great Armor", ac: 19, enc: 3 },
  { name: "Grand Plate", ac: 16, enc: 3 },
] as const;
const shields = ["", "Small Shield", "Large Shield"] as const;
const adventuringGear = [
  "Arrows, 20", "Backpack", "Boots", "Candle", "Cart, one-horse", "Clothes, common",
  "Clothes, fine", "Clothes, noble", "Cooking utensils", "Crowbar", "Firewood, one night's fire",
  "Flask, metal, one pint", "Grappling hook", "Hammer or small tool", "Healer's pouch",
  "Hurlant bolts, 20", "Iron spikes, 10", "Lantern", "Mirror, hand", "Oil, one pint",
  "Paper, 10 sheets", "Rations, one week", "Rope, 50'", "Sack", "Shovel, pick, or similar tool",
  "Tinder box", "Torch", "Waterskin, one gallon", "Writing kit",
] as const;
const gearBundles = [
  "Artisan’s Equipment", "Criminal Tools", "Dungeoneering Kit", "Noble Courtier Outfit",
  "Performer’s Implements", "Wilderness Travel Gear",
] as const;
const inventoryWeapons = weapons.filter(weapon => !["Unarmed Attack", "Shield Bash, Large", "Shield Bash, Small"].includes(weapon.name));
const inventoryArmors = armors.filter(armor => armor.name !== "No Armor").map(armor => armor.name);
const officialInventoryItems = [
  ...inventoryWeapons.map(weapon => weapon.name), ...inventoryArmors, "Small Shield", "Large Shield",
  ...adventuringGear, ...gearBundles,
];
const officialInventorySet = new Set<string>(officialInventoryItems);
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
const skillClassBonuses: Record<string, string> = {
  "High Mage": "Magic", Elementalist: "Magic", Necromancer: "Magic", Invoker: "Magic",
  Healer: "Heal", Accursed: "Magic", Bard: "Perform",
  Beastmaster: "Survive", "Blood Priest": "Pray", Duelist: "Stab",
  Mageslayer: "Magic", Skinshifter: "Survive", "Thought Noble": "Notice",
};
const skillRankCost = (rank: number) => rank < 0 ? 0 : [1, 3, 6, 10, 15][Math.min(4, rank)];
const skillRankCap = (level: number) => level >= 9 ? 4 : level >= 6 ? 3 : level >= 3 ? 2 : 1;
const officialLanguages = [
  "Abased", "Amikwag", "Anak Speech", "Ancient Khalan", "Ancient Lin", "Ancient Olok",
  "Ancient Osrin", "Ancient Vothian", "Brass Speech", "Common", "Deep Speech", "Emedian",
  "Llaigisan", "Modern Vothian", "Old Vothian", "Predecessant", "Recurrent", "Thurian",
  "Trade Cant",
];
const initial = {
  name: "Cecil the Amber",
  player: "Kris",
  className: "High Mage",
  classMode: "full" as "full" | "adventurer",
  classOne: "High Mage",
  classTwo: "Expert",
  vowedEffortSkill: "Exert",
  wiseConceptSkill: "",
  autoClassRules: true,
  level: 4,
  xp: 12,
  homeland: "Midland Deep",
  employer: "",
  profession: "",
  species: "Human",
  description: "Experience everything I’ve taught about.",
  portrait: "",
  background: "Scholar",
  backgroundDevelopmentMethod: "quick" as BackgroundDevelopmentMethod,
  backgroundCombatSkill: "",
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
  strainMax: 12,
  ac: 10,
  baseAttack: 0,
  initiative: 0,
  armor: "",
  shield: "",
  armorBonus: 0,
  focusPicks: [{ name: "Henchkeeper", level: 2 }] as FocusPick[],
  artPicks: ["Arcane Lexicon", "Sense Magic", "Retain Sorcery", "Wizard’s Grandeur"] as string[],
  artEffort: [false, false, false, false] as boolean[],
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
  goals: "",
  notes: "",
  allies: "",
  languages: ["Common", "Trade Cant", "Amikwag"] as string[],
  companions: [] as Companion[],
  archivedCompanions: [] as Companion[],
  gp: 0, sp: 0, cp: 0,
};

type Sheet = typeof initial;

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
  artEffort: [],
  spellPicks: [],
  effortUsed: 0,
  weapons: Array.from({ length: 3 }, () => ({ name: "", skill: -1 })),
  readied: Array(6).fill(""),
  stowed: Array(8).fill(""),
  goals: "",
  notes: "",
  allies: "",
  languages: [],
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
const focusPickCost = (pick: FocusPick) => pick.name ? Math.max(1, Math.min(2, pick.level || 1)) : 0;
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
const normalizeLanguages = (value: unknown): string[] => {
  if (Array.isArray(value)) return [...new Set(value.filter((language): language is string => typeof language === "string" && Boolean(language.trim())).map(language => language.trim()))];
  if (typeof value === "string") return [...new Set(value.split(/[,;\n]/).map(language => language.trim()).filter(Boolean))];
  return [];
};

const backgroundChoiceOptions = (result: string) => {
  if (result === "Any Combat") return [...combatSkills];
  if (result === "Any Skill") return [...skills];
  return [];
};

const normalizedBackgroundRules = (stored: Partial<Sheet>) => {
  return {
    ...normalizeBackgroundDevelopment(stored, typeof stored.background === "string" ? stored.background : ""),
    vowedEffortSkill: noncombatSkills.includes(stored.vowedEffortSkill || "") ? stored.vowedEffortSkill! : "Exert",
    wiseConceptSkill: noncombatSkills.includes(stored.wiseConceptSkill || "") ? stored.wiseConceptSkill! : "",
  };
};

const backgroundAttributeGrowth = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundDevelopmentRolls" | "attrs">) =>
  backgroundAttributeBonuses(state.background, state.backgroundDevelopmentMethod, state.backgroundDevelopmentRolls, state.attrs);

const focusBonusSkill = (pick: FocusPick) => {
  const choices = bonusSkillChoices(pick.name);
  return choices.length === 1 ? choices[0] : choices.includes(pick.choice || "") ? pick.choice! : "";
};

const backgroundSkillGrants = (
  state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">,
  developmentEntries = activeBackgroundDevelopmentEntries(state.background, state),
) => {
  const grants: BackgroundSkillGrant[] = [];
  const background = backgrounds[state.background];
  if (background) grants.push({
    id: "background-free",
    result: background.freeSkill,
    source: `${state.background} Background: free skill`,
    combatChoice: state.backgroundCombatSkill,
  });
  const classes = (state.classMode === "adventurer" ? [state.classOne, state.classTwo] : [state.classOne]).filter(Boolean);
  classes.forEach((className, index) => {
    const result = className === "Vowed" ? state.vowedEffortSkill
      : className === "Wise" ? state.wiseConceptSkill
        : skillClassBonuses[className];
    grants.push({ id: `class-${index}`, result: result || "", source: className === "Vowed" ? "Vowed Order: bonus skill" : className === "Wise" ? "Wise Concept: bonus skill" : `${className} Class: bonus skill` });
  });
  state.focusPicks.filter(pick => pick.name).forEach((pick, index) => {
    grants.push({ id: `focus-${index}`, result: focusBonusSkill(pick), source: `${pick.name} Focus: bonus skill` });
  });
  developmentEntries.forEach(entry => {
    grants.push({ ...entry, combatChoice: entry.id.startsWith("quick-") ? state.backgroundCombatSkill : "" });
  });
  return grants;
};

const backgroundSkillGrantResolutions = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) =>
  resolveBackgroundSkillGrants(backgroundSkillGrants(state), skills, combatSkills);

const legacyReviewSkillSourcesFor = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "backgroundDevelopmentLegacy" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) => {
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
const skillSourcesFor = (state: Pick<Sheet, "background" | "backgroundDevelopmentMethod" | "backgroundCombatSkill" | "backgroundLearningPicks" | "backgroundDevelopmentRolls" | "classMode" | "classOne" | "classTwo" | "focusPicks" | "vowedEffortSkill" | "wiseConceptSkill">) => {
  const sources = Object.fromEntries(skills.map(skill => [skill, [] as string[]])) as Record<string, string[]>;
  backgroundSkillGrantResolutions(state).forEach(grant => {
    if (grant.resolvedSkill) sources[grant.resolvedSkill].push(grant.source);
  });
  return sources;
};

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
  return {
    id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    name: "",
    archetype: familiar ? "" : "Student",
    description: "",
    hitDice: familiar ? `${Math.max(1, level)} HD` : "1 HD",
    hpRolled: 0,
    hpCurrent: familiar ? Math.max(1, level) : 0,
    hpMax: familiar ? Math.max(1, level) : 0,
    ac: familiar ? 14 : 10,
    move: familiar ? "30′" : "30′",
    attackBonus: familiar ? "No effective attack" : "+0",
    damage: familiar ? "—" : "By weapon",
    physicalSave: 15,
    evasionSave: 15,
    mentalSave: 15,
    luckSave: 15,
    morale: familiar ? "Unwavering" : "7",
    skillBonus: familiar ? "+0" : "+1",
    strength: familiar ? 10 : 8,
    readied: [],
    stowed: [],
    familiarBenefits: [],
    familiarBackground: "",
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
    ...migratedAttributeState(incoming),
    ...rulesState,
    profession: incoming.profession || incoming.employer || "",
    skills: { ...initial.skills, ...(incoming.skills || {}) },
    skillPurchases: migratedSkillPurchases(incoming),
    hpRolls: Array.isArray(incoming.hpRolls) ? incoming.hpRolls.map(Number) : [],
    spellPicks: Array.isArray(incoming.spellPicks)
      ? incoming.spellPicks.map((pick) => ({
          name: pick.name || "",
          prepared: Boolean(pick.prepared),
          cast: Boolean(pick.cast),
          casts: Math.max(0, Number(pick.casts) || 0),
        }))
      : initial.spellPicks,
    artEffort: Array.isArray(incoming.artEffort)
      ? (incoming.artPicks || initial.artPicks).map((_, index) =>
          Boolean(incoming.artEffort?.[index]),
        )
      : (incoming.artPicks || initial.artPicks).map(() => false),
    languages: normalizeLanguages(incoming.languages),
    companions: Array.isArray(incoming.companions)
      ? incoming.companions.map((companion, index) => ({
          ...newCompanion(
            companion.kind === "familiar" ? "familiar" : "henchman",
            index,
            incoming.level || 1,
          ),
          ...companion,
          archetype:
            companion.kind === "familiar"
              ? ""
              : npcArchetypeNames.includes(
                    companion.archetype as (typeof npcArchetypeNames)[number],
                  )
                ? companion.archetype
                : "Student",
          readied: Array.isArray(companion.readied) ? companion.readied : [],
          stowed: Array.isArray(companion.stowed) ? companion.stowed : [],
        }))
      : [],
    archivedCompanions: Array.isArray(incoming.archivedCompanions)
      ? incoming.archivedCompanions.map((companion, index) => ({
          ...newCompanion(
            companion.kind === "familiar" ? "familiar" : "henchman",
            index,
            incoming.level || 1,
          ),
          ...companion,
          archetype:
            companion.kind === "familiar"
              ? ""
              : npcArchetypeNames.includes(
                    companion.archetype as (typeof npcArchetypeNames)[number],
                  )
                ? companion.archetype
                : "Student",
          readied: Array.isArray(companion.readied) ? companion.readied : [],
          stowed: Array.isArray(companion.stowed) ? companion.stowed : [],
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
    backgroundLearningPicks: blankCharacter.backgroundLearningPicks.map(pick => ({ ...pick })),
    backgroundDevelopmentRolls: blankCharacter.backgroundDevelopmentRolls.map(roll => ({ ...roll, attributeChoices: [...roll.attributeChoices] })),
    focusPicks: [],
    artPicks: [],
    artEffort: [],
    spellPicks: [],
    weapons: [],
    readied: [...blankCharacter.readied],
    stowed: [...blankCharacter.stowed],
  };
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return <span className="tip" tabIndex={0}>{title}<span className="tipbox">{children}</span></span>;
}

function plainLanguageSummary(name: string, text: string) {
  const namedSummaries: Record<string, string> = {
    "Apprehending the Arcane Form": "Lets you see and identify magic and see in darkness.",
    "Cognitive Supersession of the Inferior Orders": "Lets you control a normal animal and share its senses.",
    "The Coruscating Coffin": "Blasts one visible creature with lethal magical energy.",
    "Damnation of the Sense": "Lets you control or suppress one of a creature’s senses.",
    "Decree of Ligneous Dissolution": "Destroys ordinary wood, cloth, rope, and other plant-based material in an area.",
    "The Excellent Transpicuous Transformation": "Makes willing creatures invisible until one of them acts violently.",
    "Imperceptible Cerebral Divulgence": "Reads a creature’s surface thoughts and can probe its memories.",
    "Ineluctable Shackles of Volition": "Enthralls a creature and makes it obey your physical commands.",
    "The Long Amber Moment": "Freezes a touched creature in protected temporal stasis.",
    "Phantasmal Mimesis": "Creates a convincing multisensory illusion that can also fight.",
    "Velocitous Imbuement": "Lets allies move twice as fast, run on walls, and slip safely through melee.",
    "Wardpact Invocation": "Temporarily protects a creature from weapons or makes one weapon harmless.",
    "The Wind of the Final Repose": "Puts a group of weaker living creatures to sleep.",
    "Calculation of the Evoked Servitor": "Summons a loyal, intelligent familiar until the next dawn.",
    "Casting Forth the Inner Eye": "Lets you remotely see and hear a distant place.",
    "Conjunction of the Inexorable Step": "Teleports a visible creature or object to a nearby visible location.",
    "Decree of Lithic Dissolution": "Destroys a large amount of ordinary earth or stone.",
    "Extirpate Arcana": "Dispels or temporarily suppresses unwanted magic in an area.",
    "The Inexorable Imputation": "Makes listeners believe one plausible statement for a limited time.",
    "The Jade Palanquin of the Faceless God": "Summons a floating platform that can carry people and heavy cargo.",
    "Mantle of Disjecting Dissection": "Surrounds an ally with blades that punish anyone who approaches or attacks them.",
    "Prudentially Transient Abnegation of Life": "Lets someone appear to die at 0 HP and revive a short time later.",
    "Resounding Temporal Echo": "Gives allies an extra Main Action for several rounds.",
    "The Verdant Vallation": "Creates a large, sturdy wall of vines that can be covered in thorns.",
    "Visitation of the Clement Clime": "Protects allies from extreme heat, cold, acid, and electricity.",
    "Adopt the Simulacular Visage": "Disguises willing creatures as other humanoids, including voice and clothing.",
    "Conjunct the Vital Viscera": "Transfers health, afflictions, or body parts between willing or helpless creatures.",
    "Exhalation of Congelating Cold": "Freezes a wide area, damaging and slowing creatures inside it.",
    "Foresightful Apprehension": "Reveals the most likely immediate result of a planned action.",
    "The Glass Chimes of the Bamboo Terrace": "Sends a perfectly understood message over great distance or shatters in a damaging blast.",
    "The Howl of Light": "Creates a powerful explosion of heat, sound, and force.",
    "Phobic Storm": "Terrifies nearby enemies and can force them to flee.",
    "Scorn the Fetters of Earth": "Lets allies walk through the air or forces flying creatures to land.",
    "The Torment of Tumefaction": "Curses a creature so strenuous actions cause it damage.",
    "Touch of Elucidating Intangibility": "Lets you see through a solid barrier or briefly pass through it.",
    "Vallation of Specified Exclusion": "Creates a barrier that a chosen type of creature and its powers cannot cross.",
    "Calculation of the Phantasmal Eidolon": "Summons a loyal semi-real creature that fights without killing.",
    "Contingent Excision of Arcana": "Stores a dispel that you can trigger instantly later.",
    "Disjunctive Temporal Reversion": "Makes a creature redo its current turn.",
    "Evert the Inwardness": "Pulls contents from a container or violently tears into a creature.",
    "The Grinding Geas": "Forces a creature to obey a command or suffer a deadly worsening curse.",
    "Obnubilation of the Will": "Turns a helpless creature into an obedient long-term thrall.",
    "The Ochre Sigil of Juxtaposition": "Swaps everyone and everything near you with those near a prepared sigil.",
    "Pierce the Pallid Gate": "Opens a temporary two-way portal between two nearby places.",
    "Sigil of Aeolian Auctoritas": "Creates a violent blast of wind or changes the local weather.",
    "Abdication of Temporal Presence": "Gives your group several free rounds while the rest of the world is frozen.",
    "Banishment to the Black Glass Labyrinth": "Traps creatures in an extradimensional maze.",
    "The Dazzling Prismatic Hemicycle": "Hits creatures in a huge cone with one of several severe random effects.",
    "Deluge of Hell": "Devastates a huge outdoor area with massively destructive magical damage.",
    "The Earth as Clay": "Reshapes natural earth and stone into terrain, tunnels, or structures.",
    "Invocation of the Invincible Citadel": "Creates an almost impenetrable protective force bubble.",
    "Open the High Road": "Opens a long-distance one-way portal to a prepared destination.",
    "Arcane Lexicon": "Lets you read almost any non-coded writing.",
    "Counter Magic": "Lets you try to cancel an enemy mage’s spell as it is cast.",
    "Empowered Sorcery": "Lets you reroll one of your spell’s variable effects.",
    "Hang Sorcery": "Holds a spell so you can choose its target and release it later.",
    "Inexorable Effect": "Forces an enemy to reroll a successful save against your magic.",
    "Iron Resolution": "Gives you a chance to keep casting after being hurt or disrupted.",
    "Preparatory Countermagic": "Makes you immune to the direct effects of a spell you have prepared.",
    "Psychic Conversion": "Trades one spell casting for healing and reduced System Strain.",
    "Restrained Casting": "Lets you cast a spell silently and without gestures.",
    "Retain Sorcery": "Lets you recover the casting you just spent, effectively giving the spell slot back.",
    "Sense Magic": "Lets you see magical energy, identify active magic, and see in darkness.",
    "Suppress Magic": "Temporarily shuts down a magical effect.",
    "Swift Casting": "Lets you cast a normally slow spell as an On Turn action.",
    "Ward Allies": "Protects chosen allies from the direct effects of your area spell.",
    "Wizard’s Grandeur": "Keeps you clean, comfortable, and able to sleep without shelter.",
  };
  if (namedSummaries[name]) return namedSummaries[name];

  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/\bsoporific influence\b/gi, "sleep-inducing magic")
    .replace(/\bfall unconscious\b/gi, "fall asleep")
    .replace(/\bthaumic discharge\b/gi, "magical blast")
    .replace(/\bper scene\b/gi, "once each scene")
    .replace(/\bper day\b/gi, "once each day")
    .replace(/\bCommit(?: all remaining)? Effort\b/g, "Spend Effort")
    .replace(/\bcommitted Effort\b/g, "spent Effort")
    .replace(/\bthe caster’s\b/gi, "your")
    .replace(/\bthe caster\b/gi, "you")
    .replace(/\bthe mage’s\b/gi, "your")
    .replace(/\bthe mage\b/gi, "you");

  const withoutCostPreamble = normalized
    .replace(/^Spend Effort[^.;]*\bto\s+/i, "")
    .replace(/^Spend Effort (?:for the (?:scene|day)|as an [^.]+?)(?: as an? [^.]+?)?[.;]\s*/i, "")
    .replace(/^Once per (?:day|scene)[^,]*,\s*/i, "")
    .replace(/^As an? (?:Main|On Turn|Instant) action,\s*/i, "");
  const sentences = withoutCostPreamble
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(sentence => sentence.trim()) ?? [withoutCostPreamble.trim()];
  const effectSentence = sentences.find(sentence =>
    !/^Spend Effort\b/i.test(sentence) &&
    /\b(?:allows?|becomes?|causes?|creates?|cures?|detects?|gains?|heals?|ignores?|makes?|prevents?|puts?|removes?|restores?|summons?|teleports?|turns?|can|may)\b/i.test(sentence)
  ) ?? sentences.find(sentence => !/^Spend Effort\b/i.test(sentence)) ?? withoutCostPreamble;
  const selected = effectSentence
    .replace(/^You (?:may |can )?/i, "You ")
    .replace(/^A magical blast is focused on /i, "You hit ")
    .replace(/^You conjures up /i, "You create ")
    .replace(/^You designates /i, "Choose ")
    .replace(/^You targets /i, "You target ")
    .replace(/\s+(?:The|This|Any|Each|Targets?)\b.*$/i, "")
    .trim();
  return selected.length > 180 ? `${selected.slice(0, 177).trimEnd()}…` : selected;
}

function RulesTooltip({ name, text, extra }: { name: string; text: string; extra?: string }) {
  return <div className="rules-tooltip">
    <strong className="tooltip-name">{name}</strong>
    <section className="official-description">
      <b>Official description</b>
      <p>{text}{extra ? ` ${extra}` : ""}</p>
    </section>
    <section className="plain-summary">
      <b>In plain terms</b>
      <p>{plainLanguageSummary(name.split(" · ")[0], text)}</p>
    </section>
  </div>;
}

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

function WeaponTraitCodes({ traits }: { traits: string }) {
  const codes = traits.split(",").map(trait => trait.trim()).filter(Boolean);
  if (!codes.length) return <small>None</small>;
  return <small className="weapon-trait-codes">{codes.map((code, index) => (
    <span className="weapon-trait" tabIndex={0} key={code}>
      {index > 0 && <span className="weapon-trait-separator" aria-hidden="true">, </span>}
      <span className="weapon-trait-code">{code}</span>
      <span className="weapon-trait-popup" role="tooltip">{weaponTraitDescriptions[code] || code}</span>
    </span>
  ))}</small>;
}

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

function Section({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`sheet-section ${className}`}><header><h2>{title}</h2></header>{aside && <div className="section-aside">{aside}</div>}<div className="section-body">{children}</div></section>;
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
    <span className="dice-control-expression" aria-hidden="true">{expression}</span>
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
  const {
    data: session,
    isPending: sessionPending,
    refetch: refetchSession,
  } = authClient.useSession();
  const [locallySignedOut, setLocallySignedOut] = useState(false);
  const signedIn = Boolean(session?.user?.id) && !locallySignedOut;
  const isAdmin = signedIn && session?.user?.role === "admin";
  const [tab, setTab] = useState<Tab>("core");
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
  const [campaignLinks, setCampaignLinks] = useState<CharacterCampaignLink[]>(
    initialCharacter?.campaigns ?? [],
  );
  const [claimToken, setClaimToken] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [otherStowedIndex, setOtherStowedIndex] = useState<number | null>(null);
  const [companionOtherStowed, setCompanionOtherStowed] = useState<Record<string, number | null>>({});
  const [rulesQuestion, setRulesQuestion] = useState("");
  const [rulesResults, setRulesResults] = useState<RuleEntry[]>([]);
  const [rulesSearched, setRulesSearched] = useState(false);
  const [latestRoll, setLatestRoll] = useState<RollResult | null>(null);
  const [rollHistory, setRollHistory] = useState<RollResult[]>([]);
  const [rollHistoryOpen, setRollHistoryOpen] = useState(false);
  const [skillRollChooser, setSkillRollChooser] = useState<string | null>(null);
  const [diceAnnouncement, setDiceAnnouncement] = useState("");
  const [diceAnnouncementKey, setDiceAnnouncementKey] = useState(0);
  const [diceError, setDiceError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [virtualDiceBusy, setVirtualDiceBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const portraitInput = useRef<HTMLInputElement>(null);
  const rulesAssistant = useRef<HTMLFormElement>(null);
  const characterNameInput = useRef<HTMLTextAreaElement>(null);
  const editableSurface = useRef<HTMLDivElement>(null);
  const virtualDiceOverlay = useRef<VirtualDiceOverlayHandle>(null);
  const virtualDiceBusyRef = useRef(false);
  const authIntentHandled = useRef(false);
  const startNewHandled = useRef(false);
  const lastCloudData = useRef(
    initialCharacter ? JSON.stringify(normalizeIncomingSheet(initialCharacter.character)) : "",
  );
  const canEdit = signedIn && (!cloudId || cloudCanEdit);

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

  function askRules(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = rulesQuestion.trim();
    if (!question) return;
    setRulesResults(searchRules(question));
    setRulesSearched(true);
  }

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
    return `${result.label}: ${result.dice.results.join(" plus ")}${result.modifiers.length ? ` with ${result.modifiers.map(modifier => `${modifier.label} ${signed(modifier.value)}`).join(" and ")}` : ""}, total ${result.total}.${target}${outcome}`;
  }

  async function completeRoll(request: RollRequest) {
    const shouldAnimate = virtualDiceEnabled && !reducedMotion && Boolean(virtualDiceOverlay.current);
    if (shouldAnimate && virtualDiceBusyRef.current) return;

    let rawRoll: DiceRoll;
    try {
      rawRoll = rollDice(request.dice.count, request.dice.sides);
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
      const result = await resolveRoll(request, { roll: () => rawRoll });
      setLatestRoll(result);
      setRollHistory(current => {
        const next = prependRollHistory(current, result);
        persistRollHistory(next);
        return next;
      });
      setDiceAnnouncement(announceRoll(result));
      setDiceAnnouncementKey(current => current + 1);
      setDiceError(animationFailed ? "Animated dice were unavailable; the roll was completed normally." : "");
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

  function rollSkillCheck(skill: string, attribute: AttributeName) {
    const profile = skillProfile(skill);
    setSkillRollChooser(null);
    void completeRoll({
      category: "skill",
      character: rollCharacter(),
      label: `${skill} (${attribute}) Check`,
      dice: { count: 2, sides: 6 },
      modifiers: [
        { label: `${skill} skill`, value: profile.effective },
        { label: attribute, value: attributeMod(attribute) },
      ],
    });
  }

  function rollWeaponAttack(name: string, hit: number) {
    void completeRoll({
      category: "attack",
      character: rollCharacter(),
      label: `${name} Attack`,
      dice: { count: 1, sides: 20 },
      modifiers: [{ label: "Attack bonus", value: hit }],
    });
  }

  function rollWeaponDamage(name: string, expression: string) {
    try {
      const damage = parseDamageExpression(expression);
      void completeRoll({
        category: "damage",
        character: rollCharacter(),
        label: `${name} Damage`,
        dice: damage.dice,
        modifiers: damage.modifier ? [{ label: "Damage modifier", value: damage.modifier }] : [],
      });
    } catch {
      setDiceError(`The displayed ${name} damage expression could not be rolled.`);
    }
  }

  function rollSave(name: keyof typeof saves) {
    void completeRoll({
      category: "save",
      character: rollCharacter(),
      label: `${name} Saving Throw`,
      dice: { count: 1, sides: 20 },
      target: saves[name],
      targetKind: "saving-throw",
    });
  }

  function clearLocalRollHistory() {
    clearRollHistory();
    setRollHistory([]);
  }

  useEffect(() => {
    if (!rulesSearched) return;

    function dismissRulesResults(event: PointerEvent) {
      if (!rulesAssistant.current?.contains(event.target as Node)) {
        setRulesSearched(false);
      }
    }

    document.addEventListener("pointerdown", dismissRulesResults);
    return () => document.removeEventListener("pointerdown", dismissRulesResults);
  }, [rulesSearched]);

  function formattedRuleText(text: string) {
    const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
    const paragraphNodes = (block: string, keyPrefix: string) => {
      const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z“])/).map(sentence => sentence.trim()).filter(Boolean);
      const paragraphs = [];
      for (let index = 0; index < sentences.length; index += 3) {
        paragraphs.push(<p key={`${keyPrefix}-${index}`}>{sentences.slice(index, index + 3).join(" ")}</p>);
      }
      return paragraphs;
    };

    return blocks.flatMap((block, blockIndex) => {
      const bulletParts = block.split(/\s+·\s+/).map(part => part.trim()).filter(Boolean);
      if (bulletParts.length > 1) {
        const [introduction, ...rawItems] = bulletParts;
        const continuationIndex = rawItems.findIndex(item => item.startsWith(". "));
        const items = rawItems
          .slice(0, continuationIndex >= 0 ? continuationIndex : undefined)
          .filter(item => item !== ".");
        const continuation = continuationIndex >= 0
          ? rawItems.slice(continuationIndex).join(" ").replace(/^\.\s*/, "")
          : "";
        const isTwoColumnTable = items.length >= 4 && items.length % 2 === 0;
        return [
          introduction ? <p key={`${blockIndex}-intro`}>{introduction}</p> : null,
          items.length ? <ul className={isTwoColumnTable ? "rule-pairs" : undefined} key={`${blockIndex}-list`}>
            {isTwoColumnTable
              ? items.reduce<React.ReactNode[]>((rows, item, itemIndex) => {
                  if (itemIndex % 2 === 0) rows.push(<li key={itemIndex}><strong>{item}</strong><span>{items[itemIndex + 1]}</span></li>);
                  return rows;
                }, [])
              : items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
          </ul> : null,
          ...paragraphNodes(continuation, `${blockIndex}-continuation`),
        ].filter(Boolean);
      }

      return paragraphNodes(block, `${blockIndex}-paragraph`);
    });
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
    if (!startNew || !hydrated || sessionPending || !signedIn || startNewHandled.current) return;
    startNewHandled.current = true;
    void addCurrentToLibrary(createBlankSheet());
  // The dashboard's create action intentionally creates one fresh, blank record.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNew, hydrated, sessionPending, signedIn]);

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
    if (!hydrated || !canEdit || !cloudId || cloudVersion === null) return;
    const serialized = JSON.stringify(sheet);
    if (serialized === lastCloudData.current) return;
    setSaved("Unsaved changes");
    const t = setTimeout(() => { void saveToCloud(); }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, hydrated, cloudId, canEdit]);

  useEffect(() => {
    const surface = editableSurface.current;
    if (!surface) return;
    const controls = Array.from(
      surface.querySelectorAll("input, select, textarea, button"),
    ) as unknown as Array<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
    >;
    controls.forEach(control => {
      const staysInteractive = Boolean(
        control.closest('[data-readonly-interactive="true"]'),
      );
      if (!canEdit && !staysInteractive && !control.disabled) {
        control.dataset.phase4bDisabled = "true";
        control.disabled = true;
      } else if (canEdit && control.dataset.phase4bDisabled === "true") {
        control.disabled = false;
        delete control.dataset.phase4bDisabled;
      }
    });
  }, [canEdit, sheet, tab]);

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
    if (!canEdit) return;
    setSheet(s => ({ ...s, [key]: value }));
  };
  const patchCompanion = <K extends keyof Companion>(id: string, key: K, value: Companion[K]) =>
    canEdit && setSheet(current => ({
        ...current,
        companions: current.companions.map(companion => companion.id === id ? { ...companion, [key]: value } : companion),
      }));

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
    const healing = Math.max(0, Math.min(sheet.level || 0, calculatedHpMax - sheet.hpCurrent));
    const strainRecovery = sheet.strainCurrent > 0 ? 1 : 0;
    const castings = isInvoker
      ? sheet.spellPicks.reduce((total, pick) => total + (pick.casts || 0), 0)
      : sheet.spellPicks.filter(pick => pick.cast).length;
    const effort = sheet.artEffort.filter(Boolean).length;
    const details = [
      healing ? `heal ${healing} HP` : "restore no HP",
      strainRecovery ? "remove 1 System Strain" : "remove no System Strain",
      castings ? `restore ${castings} spell casting${castings === 1 ? "" : "s"}` : "restore no spent spell castings",
      effort ? `clear ${effort} committed Effort` : "clear no committed Effort",
    ].join(", ");
    if (!window.confirm(`Take a good night's rest?\n\nThis will ${details}. Prepared spells and other character details will not change.`)) return;
    setSheet(current => ({
      ...current,
      hpCurrent: Math.min(calculatedHpMax, current.hpCurrent + Math.max(0, current.level || 0)),
      strainCurrent: Math.max(0, current.strainCurrent - 1),
      spellPicks: current.spellPicks.map(pick => ({ ...pick, cast: false, casts: 0 })),
      artEffort: current.artPicks.map(() => false),
      effortUsed: 0,
    }));
    setTransferMessage("Rest complete: nightly healing, System Strain, spell castings, and committed Effort have been updated.");
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

  async function addCurrentToLibrary(character = sheet) {
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
      setSaved("Saved online");
      window.history.pushState({ characterId: payload.id }, "", `/character/${payload.id}`);
      setLibraryScope("mine");
      await refreshLibrary("mine");
      setLibraryOpen(false);
    } catch (error) {
      setSaved("Not saved online");
      setLibraryError(error instanceof Error ? error.message : "The character could not be added.");
    }
  }

  async function saveToCloud() {
    if (!signedIn || !canEdit || !cloudId || cloudVersion === null) return;
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
        return;
      }
      if (!response.ok) throw new Error(payload.error);
      lastCloudData.current = savingData;
      setCloudVersion(Number(payload.version));
      setSaved(`Saved online at ${new Date(String(payload.updatedAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      void refreshLibrary("mine");
    } catch (error) {
      setSaved("Not saved online");
      setTransferMessage(error instanceof Error ? error.message : "The character could not be saved.");
    }
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

  async function claimLegacyCharacters() {
    if (!signedIn) {
      requireSignIn("claim a legacy character");
      return;
    }
    const token = claimToken.trim();
    if (!token) {
      setLibraryError("Enter the one-time claim token you received.");
      return;
    }
    setClaimBusy(true);
    setLibraryError("");
    try {
      const response = await fetch("/api/legacy-claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json() as { claimed?: number; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setClaimToken("");
      setTransferMessage(`${payload.claimed || 0} legacy character${payload.claimed === 1 ? "" : "s"} added to My Characters.`);
      setLibraryScope("mine");
      await refreshLibrary("mine");
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "The character claim could not be completed.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function newOnlineCharacter() {
    if (!signedIn) {
      requireSignIn("create a character");
      return;
    }
    const fresh = createBlankSheet();
    setSheet(fresh);
    setCloudId(null);
    setCloudVersion(null);
    setCloudVisibility("private");
    setCloudCanEdit(true);
    setCloudAdminReadOnly(false);
    setCampaignLinks([]);
    lastCloudData.current = "";
    await addCurrentToLibrary(fresh);
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

  async function deleteCharacter(id: string, name: string) {
    if (!signedIn) {
      requireSignIn("delete a character");
      return;
    }
    const characterName = name.trim() || "this unnamed character";
    if (!window.confirm(`Delete ${characterName} from My Characters?\n\nThis cannot be undone.`)) return;
    const response = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setLibraryError(payload.error || "The character could not be deleted.");
      return;
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
  const selectedFocusPicks = sheet.focusPicks.filter(pick => Boolean(pick.name));
  const magicalTraditions = selectedClasses.filter(c => c in traditionInfo) as TraditionName[];
  const armorRestrictedTraditions = magicalTraditions.filter(tradition => armorRestrictsMagic(traditionInfo[tradition].armor));
  const isMageClass = selectedClasses.some(name => traditionKinds[name] === "mage");
  const isExpertClass = selectedClasses.includes("Expert");
  const backgroundGrowth = backgroundAttributeGrowth(sheet);
  const attributeScore = (attribute: AttributeName) => Math.min(18, Math.max(0, sheet.attrs[attribute] + backgroundGrowth[attribute]));
  const hasNegativeAttribute = attributes.some(attribute => attributeScore(attribute) && mod(attributeScore(attribute)) <= -1);
  const focusRepeatAllowed = focusIsRepeatable;
  const focusEligibility = (name: string, slotIndex: number) => {
    if (!name) return { eligible: true, reason: "" };
    const existing = sheet.focusPicks.some((pick, index) => index !== slotIndex && pick.name === name);
    if (existing && !focusRepeatAllowed(name)) return { eligible: false, reason: "This Focus can only be taken once." };
    if (name === "Developed Attribute" && isMageClass) return { eligible: false, reason: "Mages and partial Mages cannot take Developed Attribute." };
    if (name === "Armored Magic" && !armorRestrictedTraditions.length) return { eligible: false, reason: "Armored Magic is only available to Mages whose spells or arts are normally hindered by armor." };
    if (name === "Lucky" && !hasNegativeAttribute) return { eligible: false, reason: "Lucky requires at least one attribute modifier of −1 or less." };
    if (name === "Nullifier" && isMageClass) return { eligible: false, reason: "Mages and partial Mages cannot take Nullifier." };
    if (name === "Polymath" && !isExpertClass) return { eligible: false, reason: "Only Experts or partial Experts can take Polymath." };
    if (name === "Traditional Education" && !selectedClasses.includes("Invoker")) return { eligible: false, reason: "Only an Invoker can take Traditional Education." };
    const currentPick = sheet.focusPicks[slotIndex];
    const nextCost = Math.max(1, Math.min(2, currentPick?.level || 1));
    if (name !== currentPick?.name && focusPicksUsed - focusPickCost(currentPick || { name: "", level: 1 }) + nextCost > rules.focusPicks) {
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
  const artTraditions = [...magicalTraditions, ...(traditionalEducationTradition ? [traditionalEducationTradition] : [])]
    .filter((name, index, all) => all.indexOf(name) === index) as TraditionName[];
  const rules = classRules(sheet.classMode, sheet.classOne, sheet.classTwo, effectiveLevel);
  const henchkeeper = selectedFocusPicks.find(pick => pick.name === "Henchkeeper");
  const spiritFamiliars = useMemo(() => sheet.focusPicks
    .map((pick, index) => ({ pick, index }))
    .filter(({ pick }) => pick.name === "Spirit Familiar"), [sheet.focusPicks]);
  const hasHenchkeeper = Boolean(henchkeeper);
  const hasSpiritFamiliar = spiritFamiliars.length > 0;
  const henchmanCount = henchkeeper ? Math.ceil(Math.max(1, sheet.level) / 3) : 0;
  const companionTabs = sheet.companions.filter(companion =>
    companion.kind === "henchman" ? Boolean(henchkeeper) : hasSpiritFamiliar
  );
  const armoredMagicLevel = selectedFocusPicks.find(pick => pick.name === "Armored Magic")?.level || 0;
  const focusPicksUsed = selectedFocusPicks.reduce((total, pick) => total + focusPickCost(pick), 0);
  const developedAttributes = selectedFocusPicks
    .filter(pick => pick.name === "Developed Attribute" && attributes.includes(pick.choice as typeof attributes[number]))
    .map(pick => pick.choice as typeof attributes[number])
    .filter((attribute, index, all) => all.indexOf(attribute) === index);
  const xenobloodedGravity = selectedFocusPicks.find(pick => pick.name === "Xenoblooded")?.choice || "";
  const attributeMod = (attribute: typeof attributes[number]) => {
    let value = mod(attributeScore(attribute));
    if (developedAttributes.includes(attribute)) value = Math.min(3, value + 1);
    if (xenobloodedGravity === "STR +1 / DEX -1") value += attribute === "STR" ? 1 : attribute === "DEX" ? -1 : 0;
    if (xenobloodedGravity === "DEX +1 / STR -1") value += attribute === "DEX" ? 1 : attribute === "STR" ? -1 : 0;
    return Math.min(3, value);
  };
  const minimumSkillSources = skillSourcesFor(sheet);
  const backgroundGrantResolutions = backgroundSkillGrantResolutions(sheet);
  const backgroundGrantResolution = (id: string, candidate = sheet) =>
    backgroundSkillGrantResolutions(candidate).find(grant => grant.id === id);
  const backgroundGrantCanResolveAs = (id: string, candidate: Sheet, skill: string) => {
    const resolution = backgroundGrantResolution(id, candidate);
    return resolution?.resolvedSkill === skill && !resolution.needsReplacement;
  };
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
    return deriveSkillProfile({ purchased: purchases[skill], sourceCount, polymathFloor });
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
    return { spent: Math.max(0, gross - freePickValue), freePickSkill, effectiveValues };
  };
  const skillSpending = calculateSkillSpending(sheet.skillPurchases);
  const attributeBoostCount = attributes.reduce((total, attribute) => total + sheet.attributeBoosts[attribute], 0);
  const attributeBoostCost = attributeBoostCount * (attributeBoostCount + 1) / 2;
  const attributeBoostLimit = effectiveLevel >= 9 ? 5 : effectiveLevel >= 6 ? 4 : effectiveLevel >= 3 ? 3 : 2;
  const availableSkillPoints = Math.max(0, skillPointAllowance - attributeBoostCost);
  const advancementPointsSpent = skillSpending.spent + attributeBoostCost;
  const advancementPointsRemaining = Math.max(0, skillPointAllowance - advancementPointsSpent);
  const changeAttributeBoost = (attribute: typeof attributes[number], change: -1 | 1) => {
    const currentBoosts = sheet.attributeBoosts[attribute];
    if (change > 0) {
      const nextCost = attributeBoostCount + 1;
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
  const armorBase = armors.find(armor => armor.name === sheet.armor)?.ac ?? 10;
  const wornArmor = armors.find(armor => armor.name === sheet.armor) ?? armors[0];
  const castingBlocked = armorRestrictedTraditions.length > 0 && (
    armoredMagicLevel === 0
      ? wornArmor.name !== "No Armor" || Boolean(sheet.shield)
      : armoredMagicLevel === 1 && wornArmor.enc > 2
  );
  const castingBlockedReason = castingBlocked
    ? armoredMagicLevel === 1
      ? `${wornArmor.name} has Encumbrance ${wornArmor.enc}; Armored Magic level 1 only permits armor of Encumbrance 2 or less.`
      : `${wornArmor.name !== "No Armor" ? wornArmor.name : sheet.shield} prevents spellcasting without Armored Magic.`
    : "";
  const shieldBase = sheet.shield === "Small Shield" ? 13 : sheet.shield === "Large Shield" ? 14 : 0;
  const shieldAdjustedBase = shieldBase ? (armorBase >= shieldBase ? armorBase + 1 : shieldBase) : armorBase;
  const imperviousDefense = selectedFocusPicks.some(pick => pick.name === "Impervious Defense");
  const naturalArmorBase = imperviousDefense ? 15 + Math.ceil(effectiveLevel / 2) : 0;
  const bestArmorBase = Math.max(shieldAdjustedBase, naturalArmorBase + (sheet.shield ? 1 : 0));
  const vowedArmorBase = selectedClasses.includes("Vowed") && wornArmor.name === "No Armor" && !sheet.shield
    ? 13 + Math.floor(effectiveLevel / 2)
    : 0;
  const coldFleshArmorBase = sheet.artPicks.includes("Cold Flesh") ? 12 + Math.floor(effectiveLevel / 2) : 0;
  const pavisIndex = sheet.artPicks.indexOf("Pavis of Elements");
  const pavisActive = pavisIndex >= 0 && Boolean(sheet.artEffort[pavisIndex]);
  const defensiveBase = Math.max(bestArmorBase, vowedArmorBase, coldFleshArmorBase + (sheet.shield ? 1 : 0));
  const calculatedAcBeforePavis = defensiveBase + attributeMod("DEX") + (sheet.armorBonus || 0);
  const calculatedAc = pavisActive ? Math.min(18, calculatedAcBeforePavis + 4) : calculatedAcBeforePavis;
  const calculatedInitiative = attributeMod("DEX");
  const hitPointClassBonus = selectedClasses.includes("Warrior") && !selectedClasses.includes("Duelist") ? 2
    : selectedClasses.includes("Expert") || selectedClasses.includes("Vowed") ? 0 : -1;
  const enteredHpRolls = sheet.hpRolls.slice(0, effectiveLevel);
  let calculatedHp = 0;
  let hpRollsComplete = Boolean(sheet.level) && enteredHpRolls.length >= effectiveLevel;
  const hasDieHard = selectedFocusPicks.some(pick => pick.name === "Die Hard");
  for (let index = 0; index < effectiveLevel; index += 1) {
    const rawRoll = Number(enteredHpRolls[index]);
    if (!rawRoll) { hpRollsComplete = false; break; }
    const dice = index + 1;
    const perDieModifier = attributeMod("CON") + hitPointClassBonus + (hasDieHard ? 2 : 0);
    const rolledTotal = Math.max(dice, rawRoll + perDieModifier * dice);
    calculatedHp = index === 0 ? rolledTotal : Math.max(calculatedHp + 1, rolledTotal);
  }
  const dieHardBonus = hasDieHard ? effectiveLevel * 2 : 0;
  const calculatedHpMax = hpRollsComplete ? calculatedHp : sheet.hpMax;
  const availableArts = artTraditions.flatMap(t => {
    const arts = t === "High Mage" ? highMageArts : traditionInfo[t].arts;
    return arts.map(a => ({...a, minLevel: "minLevel" in a ? a.minLevel : undefined, tradition:t}));
  });
  const repeatableArt = (name: string) => name === "Skilled";
  const artEligibility = (name: string, slotIndex: number) => {
    const art = availableArts.find(candidate => candidate.name === name);
    if (!art) return { eligible: false, reason: "This Art is not available to the character’s traditions." };
    if ((art.minLevel || 1) > effectiveLevel) return { eligible: false, reason: `Requires level ${art.minLevel}.` };
    if (name === "Deep Apprehension" && !sheet.artPicks.includes("Surface Apprehension")) {
      return { eligible: false, reason: "Requires Surface Apprehension." };
    }
    if (!repeatableArt(name) && sheet.artPicks.some((picked, index) => index !== slotIndex && picked === name)) {
      return { eligible: false, reason: "This Art cannot be selected more than once." };
    }
    return { eligible: true, reason: "" };
  };
  const effortPools = artTraditions.filter(t => t !== "Invoker").map(t => {
    const info = traditionInfo[t];
    const skill = t === "Vowed" ? sheet.vowedEffortSkill : info.effortSkill;
    const effortAttributes = info.effortAttributes?.length
      ? info.effortAttributes.filter((attribute): attribute is typeof attributes[number] => attributes.includes(attribute as typeof attributes[number]))
      : t === "Vowed" ? [...attributes] : ["INT", "CHA"] as (typeof attributes[number])[];
    const attribute = effortAttributes.length ? Math.max(...effortAttributes.map(a => attributeMod(a))) : 0;
    const partialPenalty = sheet.classMode === "adventurer" && traditionInfo[t].spells ? 1 : 0;
    const max = traditionalEducationTradition === t
      ? Math.max(1, effectiveSkill("Magic"))
      : info.usesEffort === false ? 0 : Math.max(1, info.effortBase + effectiveSkill(skill) + attribute - partialPenalty);
    const used = sheet.artPicks.filter((name,i) => sheet.artEffort[i] && availableArts.find(a=>a.name===name)?.tradition === t).length;
    return {tradition:t,skill,max,used};
  });
  const availableSpells = [
    ...highMagic.map(s => ({...s, tradition:"High Magic"})),
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
  const languageAllowance = 2
    + (effectiveSkill("Know") >= 1 ? 2 : effectiveSkill("Know") === 0 ? 1 : 0)
    + (effectiveSkill("Connect") >= 1 ? 2 : effectiveSkill("Connect") === 0 ? 1 : 0);
  const allowedFocusPicks = sheet.level && sheet.classOne ? rules.focusPicks : 0;
  const levelTwoFoci = selectedFocusPicks.filter(pick => pick.level === 2).length;
  const focusSlotCount = Math.max(selectedFocusPicks.length, allowedFocusPicks - levelTwoFoci);
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
  const castsUsed = isInvoker
    ? sheet.spellPicks.reduce((total, pick) => total + (pick.name && pick.prepared ? (pick.casts || 0) * (availableSpells.find(spell => spell.name === pick.name)?.level || 0) : 0), 0)
    : sheet.spellPicks.filter(s => s.name && s.cast).length;
  const readiedCapacity = attributeScore("STR") ? Math.floor(attributeScore("STR") / 2) : 0;
  const stowedCapacity = attributeScore("STR") || 0;
  const readiedSlots = inventorySlots(sheet.readied, readiedCapacity);
  const stowedSlots = inventorySlots(sheet.stowed, stowedCapacity);
  const readiedWeapons = readiedSlots
    .map((name, inventoryIndex) => ({ name, inventoryIndex }))
    .filter(item => inventoryWeapons.some(weapon => weapon.name === item.name));
  const unarmedPrimary = selectedClasses.includes("Vowed") || selectedFocusPicks.some(pick => pick.name === "Unarmed Combatant");
  const displayedWeapons = unarmedPrimary
    ? [{ name: "Unarmed Attack", inventoryIndex: -1 }, ...readiedWeapons]
    : [...readiedWeapons, { name: "Unarmed Attack", inventoryIndex: -1 }];

  const setStowedItem = (index: number, value: string) => {
    if (value === "Unarmed Attack") return;
    patch("stowed", stowedSlots.map((item, itemIndex) => itemIndex === index ? value : item));
  };
  const companionInventoryLabel = (companion: Companion, index: number) =>
    companion.name || (companion.kind === "familiar" ? "Familiar" : `Henchman ${index + 1}`);
  const swapStowedBetweenOwners = (
    targetOwner: InventoryOwner,
    targetIndex: number,
    sourceOwner: InventoryOwner,
    sourceIndex: number,
  ) => {
    setOtherStowedIndex(null);
    setCompanionOtherStowed({});
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
    if (!window.confirm(`Drop ${item}?\n\nThis removes it from the character’s inventory.`)) return;
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
    if (sheet.spellPicks.some(p => (availableSpells.find(s => s.name === p.name)?.level ?? 0) > limits.max)) issues.push(`spell above level ${limits.max}`);
    if (sheet.artPicks.some(name => name && !availableArts.some(a => a.name === name))) issues.push("an art belongs to a different tradition");
    if (sheet.classMode === "adventurer" && sheet.classOne === sheet.classTwo) issues.push("choose two different partial classes");
    if (selectedClasses.includes("Mageslayer") && selectedClasses.some(name => traditionKinds[name] === "mage")) issues.push("Mageslayer cannot be combined with a Mage partial class");
    if (sheet.classMode === "adventurer" && isInvoker && castingTraditions.length > 1) issues.push("Partial Invoker cannot be combined with another partial spellcaster");
    if (traditionalEducation && !isInvoker) issues.push("Traditional Education is available only to Invokers");
    if (focusPicksUsed > rules.focusPicks) issues.push(`${focusPicksUsed}/${rules.focusPicks} Focus picks used`);
    if (selectedFocusPicks.some(pick => focusChoiceLabel(pick.name) && !pick.choice)) issues.push("a Focus needs a choice");
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
      let focusBudget = 0;
      const budgetedFoci = legalFoci.map(pick => {
        const cost = focusPickCost(pick);
        if (!pick.name || focusBudget + cost <= allowedFocusPicks) {
          focusBudget += cost;
          return pick;
        }
        return { name: "", level: 1 };
      });
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
      const selectedEffort = current.artPicks.flatMap((name, index) => name ? [Boolean(current.artEffort[index])] : []);
      const nextEffort = nextArts.map((name, index) => name ? Boolean(selectedEffort[index]) : false);
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
  }, [hydrated, focusSlotCount, artAllowance, knownSpellAllowance, limits.prepared, limits.max, selectedClasses.join("|"), sheet.attrs.STR, sheet.attrs.DEX, sheet.attrs.CON, sheet.attrs.INT, sheet.attrs.WIS, sheet.attrs.CHA, sheet.backgroundDevelopmentMethod, JSON.stringify(sheet.backgroundDevelopmentRolls), JSON.stringify(sheet.backgroundLearningPicks)]);

  useEffect(() => {
    if (!hydrated) return;
    // Focus changes activate or archive companions while preserving their entered data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheet(current => {
      const existingHenchmen = current.companions.filter(companion => companion.kind === "henchman");
      const existingFamiliars = current.companions.filter(companion => companion.kind === "familiar");
      const archivedHenchmen = current.archivedCompanions.filter(companion => companion.kind === "henchman");
      const archivedFamiliars = current.archivedCompanions.filter(companion => companion.kind === "familiar");
      const availableHenchmen = [...existingHenchmen, ...archivedHenchmen];
      const nextHenchmen = hasHenchkeeper
        ? [
            ...availableHenchmen.slice(0, henchmanCount),
            ...Array.from({ length: Math.max(0, henchmanCount - availableHenchmen.length) }, (_, index) =>
              newCompanion("henchman", availableHenchmen.length + index, sheet.level)
            ),
          ]
        : [];
      const nextFamiliars = reconcileFamiliarSlots(
        existingFamiliars,
        archivedFamiliars,
        spiritFamiliars.map(({ index }) => index),
        (focusSlot, familiarIndex) => newCompanion("familiar", familiarIndex, sheet.level, focusSlot),
      );
      const next = [...nextHenchmen, ...nextFamiliars];
      const activeIds = new Set(next.map(companion => companion.id));
      const nextArchive = [...current.archivedCompanions, ...current.companions]
        .filter((companion, index, all) => !activeIds.has(companion.id) && all.findIndex(item => item.id === companion.id) === index);
      return JSON.stringify(next) === JSON.stringify(current.companions) &&
        JSON.stringify(nextArchive) === JSON.stringify(current.archivedCompanions)
        ? current
        : { ...current, companions: next, archivedCompanions: nextArchive };
    });
  }, [hydrated, hasHenchkeeper, hasSpiritFamiliar, henchmanCount, sheet.level, spiritFamiliars]);

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
    const w = weapons.find(x => x.name === pick.name);
    if (!w) return null;
    const bestPhysicalModifier = Math.max(attributeMod("STR"), attributeMod("DEX"));
    const attrMod = w.attribute === "Dex" ? attributeMod("DEX") : w.attribute === "Str" ? attributeMod("STR") : bestPhysicalModifier;
    const isUnarmed = w.name === "Unarmed Attack";
    const isThrownWeapon = w.traits.split(",").map(trait => trait.trim()).includes("T");
    // A versatile thrown weapon is shown in the mode that uses the character's
    // best trained combat skill. This keeps Shock tied to melee use only.
    const isMelee = isUnarmed || w.range === "-" || (isThrownWeapon && effectiveSkill("Stab") >= effectiveSkill("Shoot"));
    const isThrown = isThrownWeapon && !isMelee;
    const skillName = isUnarmed ? "Punch" : isMelee ? "Stab" : "Shoot";
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
      const shockThreshold = closeCombatant?.level === 2 || shockingAssault ? 10 : 15;
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
    const hit = baseAttack + attrMod + Math.max(0, skill) + unskilled + focusHitBonus;
    const extraDamage = attrMod + warriorDamage + Math.max(armsmasterDamage, deadeyeDamage);
    const shock = !isMelee || w.shock === "None" ? "None" : (() => {
      const match = w.shock.match(/^(\d+)\/AC\s*(\d+)$/i);
      if (!match) return w.shock;
      const shockDamage = Number(match[1]) + attrMod + warriorDamage
        + (shockingAssault?.level === 2 ? 2 : 0);
      const shockAc = armsmaster?.level === 2 || closeCombatant?.level === 2 || shockingAssault
        ? 10
        : Number(match[2]);
      return `${Math.max(0, shockDamage)}/AC ${shockAc}`;
    })();
    const armsmasterNote = armsmasterDamage && w.shock !== "None"
      ? ` · Armsmaster can apply Stab ${signed(armsmasterDamage)} to Shock instead of damage`
      : "";
    return { w, skillName, hit, damage: `${w.damage}${extraDamage ? signed(extraDamage) : ""}`, shock, range: w.range, virtual: false, note: `${skillName} ${skill >= 0 ? signed(skill) : "untrained"} effective${armsmasterNote}` };
  }

  function downloadCharacterExport(payload: unknown) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(sheet.name || "wwn-character").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "wwn-character"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setTransferMessage("Character exported as a personal JSON backup. Account and ownership data are not included.");
  }

  async function exportCharacter() {
    if (!signedIn) {
      requireSignIn("export a character");
      return;
    }
    if (cloudId) {
      if (!canEdit) {
        setTransferMessage("Only this character’s owner can export it.");
        return;
      }
      const response = await fetch(`/api/characters/${cloudId}/export`, { cache: "no-store" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setTransferMessage(payload.error || "The character could not be exported.");
        return;
      }
      downloadCharacterExport(payload);
      return;
    }

    const character = {
      ...sheet,
      portrait: sheet.portrait.startsWith("/api/portraits/") ? "" : sheet.portrait,
    };
    downloadCharacterExport({
      format: "wwn-character-sheet",
      version: 2,
      exportedAt: new Date().toISOString(),
      character,
    });
  }

  async function importCharacter(file?: File) {
    if (!file) return;
    if (!signedIn) {
      requireSignIn("import a character");
      if (importInput.current) importInput.current.value = "";
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed?.format === "wwn-character-sheet" ? parsed.character : parsed;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("Invalid character data");
      const portrait = typeof incoming.portrait === "string" && (
        incoming.portrait.startsWith("data:image/")
        || incoming.portrait.startsWith("/api/portraits/")
      )
        ? incoming.portrait
        : "";
      const response = await fetch("/api/characters/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed?.format === "wwn-character-sheet"
          ? { ...parsed, character: { ...incoming, portrait: "" } }
          : { ...incoming, portrait: "" }),
      });
      const payload = await response.json() as { id?: string; version?: number; error?: string };
      if (!response.ok || !payload.id || !payload.version) throw new Error(payload.error || "Import failed.");
      let version = payload.version;
      if (portrait) {
        const portraitBlob = await (await fetch(portrait)).blob();
        const uploaded = await uploadPortraitBlob(portraitBlob, payload.id, version);
        version = uploaded.version;
      }
      setCloudVersion(version);
      setLibraryScope("mine");
      await openCloudCharacter(payload.id);
      await refreshLibrary("mine");
      setTransferMessage(`Imported ${String(incoming.name || "character")} as a new private character.`);
    } catch (error) {
      setTransferMessage(error instanceof Error ? error.message : "That file could not be imported. Choose a supported WWN character JSON file.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
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
    choiceAvailable: (skill: string) => boolean;
    replacementAvailable: (skill: string) => boolean;
  };
  const renderBackgroundSkillFollowUp = ({
    result,
    choice,
    replacement,
    needsReplacement,
    onChoice,
    onReplacement,
    choiceAvailable,
    replacementAvailable,
  }: BackgroundSkillFollowupProps) => {
    const choices = backgroundChoiceOptions(result);
    const specialLabel = result === "Any Combat" ? "Choose combat skill" : "Choose skill";
    return <>
      {choices.length > 0 && <label className="field">
        <span>{needsReplacement ? `Choose another eligible ${result === "Any Combat" ? "combat skill" : "skill"}` : specialLabel}</span>
        <select value={choice} onChange={event => onChoice(event.target.value)}>
          <option value="">{specialLabel}…</option>
          {choices.map(skill => {
            const available = choiceAvailable(skill);
            return <option key={skill} value={skill} disabled={!available}>{skill}{available ? "" : " — already level 1"}</option>;
          })}
        </select>
        {needsReplacement && <small className="background-choice-note">This would be a third starting acquisition. Choose a skill that is not already level 1.</small>}
      </label>}
      {needsReplacement && choices.length === 0 && <label className="field">
        <span>Choose another eligible skill</span>
        <select value={replacement} onChange={event => onReplacement(event.target.value)}>
          <option value="">Choose skill…</option>
          {skills.map(skill => {
            const available = replacementAvailable(skill);
            return <option key={skill} value={skill} disabled={!available}>{skill}{available ? "" : " — already level 1"}</option>;
          })}
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
      <div className="topbar">
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
            {signedIn && <a className="quiet account-state" href="/account">Account</a>}
            {signedIn && canEdit && (cloudId
              ? <button onClick={() => void saveToCloud()}>Save Now</button>
              : <button onClick={() => void addCurrentToLibrary()}>Add to My Characters</button>)}
            {signedIn && canEdit && <button onClick={() => void exportCharacter()}>Export Character</button>}
            {signedIn && <button onClick={() => importInput.current?.click()}>Import Character</button>}
            <input ref={importInput} className="file-input" type="file" accept="application/json,.json" onChange={e => importCharacter(e.target.files?.[0])} />
            {signedIn && <button
              type="button"
              className="account-signout"
              onClick={async () => {
                setLibraryError("");
                try {
                  const { error } = await authClient.signOut();
                  if (error) {
                    throw new Error(error.message || "Better Auth rejected sign out.");
                  }
                  setLocallySignedOut(true);
                  setCloudCanEdit(false);
                  setCloudAdminReadOnly(false);
                  setLibraryScope("public");
                  setSaved(cloudId ? "Read-only" : "Sign in to edit");
                  setTransferMessage("Signed out. Owner-only controls have been disabled.");
                  await refetchSession();
                  void refreshLibrary("public");
                } catch (error) {
                  const detail = error instanceof Error
                    ? error.message
                    : "The request could not be completed.";
                  const feedback = `Sign out failed: ${detail}`;
                  setTransferMessage(feedback);
                  setLibraryError(feedback);
                }
              }}
            >Sign Out</button>}
            <button className="print-button" onClick={() => window.print()}>Print / PDF</button>
          </div>
        </div>
      </div>

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
            {signedIn && libraryScope === "mine" && <button className="primary-action" onClick={() => void newOnlineCharacter()}>＋ Create New Character</button>}
            {signedIn && libraryScope === "mine" && !cloudId && <button onClick={() => void addCurrentToLibrary()}>☁ Add Current Browser Character</button>}
            <button onClick={() => void refreshLibrary(libraryScope)}>↻ Refresh</button>
          </div>
          {!signedIn && <div className="library-signin">
            <p>Sign in with Google to create, import, edit, and manage private characters.</p>
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
          {signedIn && libraryScope === "mine" && <form className="legacy-claim" onSubmit={event => { event.preventDefault(); void claimLegacyCharacters(); }}>
            <label htmlFor="legacy-claim-token">Claim a legacy character</label>
            <p>Enter the private, one-time claim token supplied by the administrator.</p>
            <div><input id="legacy-claim-token" value={claimToken} onChange={event => setClaimToken(event.target.value)} autoComplete="off" /><button type="submit" disabled={claimBusy}>{claimBusy ? "Claiming…" : "Claim"}</button></div>
          </form>}
          {libraryError && <div className="library-error" role="alert">{libraryError}</div>}
          <div className="library-list">
            {libraryBusy && library.length === 0 && <div className="library-empty"><span>⌛</span><h2>Opening the archive…</h2></div>}
            {!libraryBusy && library.length === 0 && !libraryError && <div className="library-empty"><span>✦</span><h2>{libraryScope === "mine" ? "No characters in your roster yet" : libraryScope === "all" ? "No characters found" : "No public characters found"}</h2><p>{libraryScope === "mine" ? "Create a character, import a backup, or use a legacy claim token." : "Try a different search or return later."}</p></div>}
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
        {transferMessage && <div className="transfer-message" role="status">{transferMessage}<button data-readonly-interactive="true" aria-label="Dismiss message" onClick={() => setTransferMessage("")}>×</button></div>}
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
              {canEdit && <button type="button" onClick={() => portraitInput.current?.click()}>{sheet.portrait ? "Change" : "Add portrait"}</button>}
              {canEdit && sheet.portrait && <button type="button" className="portrait-remove" onClick={() => void removePortrait()}>Remove</button>}
              <input ref={portraitInput} className="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => void uploadPortrait(e.target.files?.[0])} />
            </div>
            <div className="hero-identity-copy">
              <p className="eyebrow">THE RECORD OF</p>
              <textarea ref={characterNameInput} className="character-name" rows={1} value={sheet.name} onChange={e => patch("name", e.target.value)} aria-label="Character name" />
              <p className="hero-summary">{sheet.level ? `Level ${sheet.level}` : "Level —"} {classLabel || "Class —"}</p>
              <div className="hero-wealth" aria-label="Character wealth">
                <span className="wealth-label">COIN PURSE</span>
                <label><input type="number" value={sheet.gp} onChange={e => patch("gp", Number(e.target.value))} aria-label="Gold pieces" /><b>GP</b></label>
                <i>◆</i>
                <label><input type="number" value={sheet.sp} onChange={e => patch("sp", Number(e.target.value))} aria-label="Silver pieces" /><b>SP</b></label>
                <i>◆</i>
                <label><input type="number" value={sheet.cp} onChange={e => patch("cp", Number(e.target.value))} aria-label="Copper pieces" /><b>CP</b></label>
              </div>
            </div>
          </section>
          <section className="hero-tools hero-play-panel" aria-label="Play utilities">
            <form ref={rulesAssistant} className="rules-assistant" data-readonly-interactive="true" autoComplete="off" onSubmit={askRules}>
              <label htmlFor="rules-question">Ask the WWN Rules Assistant</label>
              <div className="rules-question-row">
                <input
                  id="rules-question"
                  name="wwn-rules-question-no-history"
                  type="search"
                  autoComplete="off"
                  data-lpignore="true"
                  value={rulesQuestion}
                  onChange={event => setRulesQuestion(event.target.value)}
                  placeholder="What happens at 0 HP?"
                />
                <button type="submit">Search</button>
              </div>
              {rulesSearched && <div className="rules-results" aria-live="polite">
                {rulesResults.length ? <>
                  {rulesResults.map(result => <details className="rule-result" key={`${result.source}:${result.title}`}>
                    <summary>
                      <span className="rule-result-heading">
                        <strong>{result.title}</strong>
                        <span className="rule-result-toggle" aria-hidden="true">Show full section</span>
                      </span>
                      <p className="rule-result-preview">{result.text}</p>
                      <small className="rule-result-source">{result.source}</small>
                    </summary>
                    <div className="rule-result-full">
                      {formattedRuleText(result.fullText || result.text)}
                      <span aria-hidden="true">Click the result again to collapse</span>
                    </div>
                  </details>)}
                </> : <p className="rules-no-result">No close SRD match found. Try a rule name such as “System Strain,” “Shock,” or a spell, Art, Focus, or weapon name.</p>}
              </div>}
            </form>
            <div className="hero-stats" aria-label="Dice and combat statistics">
              <DiceControl expression="d20" result={latestRoll?.category === "generic" && latestRoll.dice.count === 1 && latestRoll.dice.sides === 20 ? latestRoll : null} onRoll={() => rollHeaderDice("d20")} disabled={virtualDiceBusy} />
              <DiceControl expression="2d6" result={latestRoll?.category === "generic" && latestRoll.dice.count === 2 && latestRoll.dice.sides === 6 ? latestRoll : null} onRoll={() => rollHeaderDice("2d6")} disabled={virtualDiceBusy} />
              <label className="hero-stat-card hero-ac-card" title="Calculated from armor, shield, Dexterity, and armor bonus"><span className="hero-stat-kicker">AC</span><input type="number" value={calculatedAc} disabled aria-label="Calculated armor class" /><span>ARMOR CLASS</span></label>
              <label className="hero-stat-card hp-stat"><span className="hero-stat-kicker">HP</span><span className="paired"><input type="number" value={sheet.hpCurrent || ""} onChange={e => patch("hpCurrent", Number(e.target.value))} aria-label="Current hit points" /><em>/</em><input type="number" value={calculatedHpMax || ""} disabled={hpRollsComplete} onChange={e => patch("hpMax", Number(e.target.value))} aria-label={hpRollsComplete ? "Calculated maximum hit points" : "Maximum hit points"} /></span><span>HIT POINTS</span></label>
            </div>
            <div className="hero-roll-row" data-readonly-interactive="true">
              <div className="hero-latest-roll"><RollResultTray result={latestRoll} /></div>
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
            const fallback = companion.kind === "familiar" ? "Familiar" : `Henchman ${index + 1}`;
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
            <Section title="Identity">
              <div className="two-col">
                <Field label="Player" value={sheet.player} onChange={v => patch("player", v)} />
                <label className="field">
                  <span>Character Level</span>
                  <select
                    value={sheet.level || ""}
                    onChange={e => patch("level", e.target.value === "" ? 0 : Number(e.target.value))}
                  >
                    <option value="">Choose level…</option>
                    {Array.from({ length: 10 }, (_, index) => index + 1).map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>
                <label className="field"><span>Class structure</span><select value={sheet.classMode} onChange={e => patch("classMode", e.target.value as Sheet["classMode"])}><option value="full">Full class</option><option value="adventurer">Adventurer (two partial classes)</option></select></label>
                <Field label="Race / Species" value={sheet.species} onChange={v => patch("species", v)} />
                <label className="field class-field">
                  <span>Class</span>
                  <select aria-label={sheet.classMode === "full" ? "Class" : "First partial class"} value={sheet.classOne} onChange={e => patch("classOne", e.target.value)}><option value="">{sheet.classMode === "full" ? "Choose a class…" : "Choose first partial class…"}</option>{(sheet.classMode === "full" ? fullClasses : partialClasses).map(c => {
                    const incompatible = sheet.classMode === "adventurer" && Boolean(sheet.classTwo) && (
                      c === sheet.classTwo
                      || (c === "Mageslayer" && traditionKinds[sheet.classTwo] === "mage")
                      || (sheet.classTwo === "Mageslayer" && traditionKinds[c] === "mage")
                      || ((c === "Invoker" || sheet.classTwo === "Invoker") && traditionKinds[c === "Invoker" ? sheet.classTwo : c] === "mage")
                    );
                    return <option key={c} disabled={incompatible}>{c}</option>;
                  })}</select>
                  {sheet.classMode === "adventurer" && <select aria-label="Second partial class" value={sheet.classTwo} onChange={e => patch("classTwo", e.target.value)}><option value="">Choose second partial class…</option>{partialClasses.map(c => {
                    const incompatible = c === sheet.classOne
                      || (c === "Mageslayer" && traditionKinds[sheet.classOne] === "mage")
                      || (sheet.classOne === "Mageslayer" && traditionKinds[c] === "mage")
                      || ((c === "Invoker" || sheet.classOne === "Invoker") && traditionKinds[c === "Invoker" ? sheet.classOne : c] === "mage");
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
            <Section title="Base Attributes" aside={<span className="caption">SRD attribute generation · modifiers calculate automatically</span>} className="attributes-section">
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
                  <span>{attributeBoostCount}/{attributeBoostLimit} · next +1: {attributeBoostCount < 5 ? attributeBoostCount + 1 : "—"} pts · {advancementPointsRemaining}{"\u00a0"}available</span>
                </div>
                <div className="attribute-boost-controls">
                  {attributes.map(attribute => {
                    const nextCost = attributeBoostCount + 1;
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
              <div className="saves">{Object.entries(saves).map(([k,v]) => <div className="save-card" key={k} title={saveDetails[k as keyof typeof saveDetails]}><span>{k}</span><b>{v}+</b><small>{saveDetails[k as keyof typeof saveDetails]}</small><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollSave(k as keyof typeof saves)}>Roll Save</button></div>)}</div>
            </Section>
            <Section title="Background & Class Benefits">
              {classLabel && <div className="class-benefit-card"><strong>{classLabel}</strong><p>{rules.summary}</p><dl><div><dt>Hit dice</dt><dd>{rules.hitDice}</dd></div><div><dt>Base attack</dt><dd>{signed(rules.attack)}</dd></div><div><dt>Focus picks</dt><dd>{rules.focusPicks}</dd></div></dl>{magicalTraditions.map(t=><p key={t}><b>{t}:</b> {traditionInfo[t].armor}</p>)}</div>}
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
                      <select value={sheet.backgroundCombatSkill} onChange={event => patch("backgroundCombatSkill", event.target.value)}>
                        <option value="">Choose Punch, Shoot, or Stab…</option>
                        {combatSkills.map(skill => {
                          const available = backgroundGrantCanResolveAs(backgroundCombatGrantId, { ...sheet, backgroundCombatSkill: skill }, skill);
                          return <option key={skill} value={skill} disabled={!available}>{skill}{available ? "" : " — already level 1"}</option>;
                        })}
                      </select>
                    </label>}
                    {sheet.backgroundDevelopmentMethod === "quick" && <div className="background-development-summary">
                      <strong>Quick Skills Package</strong>
                      <span>Applies {backgrounds[sheet.background].quickSkills.join(" · ")}.</span>
                    </div>}
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
                            choice: pick.choice || "",
                            replacement: pick.replacement || "",
                            needsReplacement: Boolean(resolution?.needsReplacement),
                            onChoice: value => updateBackgroundLearningPick(index, { choice: value, replacement: "" }),
                            onReplacement: value => updateBackgroundLearningPick(index, { replacement: value }),
                            choiceAvailable: skill => backgroundGrantCanResolveAs(grantId, { ...sheet, backgroundLearningPicks: sheet.backgroundLearningPicks.map((value, row) => row === index ? { ...value, choice: skill, replacement: "" } : value) }, skill),
                            replacementAvailable: skill => backgroundGrantCanResolveAs(grantId, { ...sheet, backgroundLearningPicks: sheet.backgroundLearningPicks.map((value, row) => row === index ? { ...value, replacement: skill } : value) }, skill),
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
                          <span className="background-result"><small>{roll.die ? `d${dieSize} → ${roll.die}` : `d${dieSize} not rolled`}</small><b>{result || "Result pending"}</b></span>
                          {renderBackgroundAttributeChoices(roll, index)}
                          {result && renderBackgroundSkillFollowUp({
                            result,
                            choice: roll.choice || "",
                            replacement: roll.replacement || "",
                            needsReplacement: Boolean(resolution?.needsReplacement),
                            onChoice: value => updateBackgroundDevelopmentRoll(index, { choice: value, replacement: "" }),
                            onReplacement: value => updateBackgroundDevelopmentRoll(index, { replacement: value }),
                            choiceAvailable: skill => backgroundGrantCanResolveAs(grantId, { ...sheet, backgroundDevelopmentRolls: sheet.backgroundDevelopmentRolls.map((value, row) => row === index ? { ...value, choice: skill, replacement: "" } : value) }, skill),
                            replacementAvailable: skill => backgroundGrantCanResolveAs(grantId, { ...sheet, backgroundDevelopmentRolls: sheet.backgroundDevelopmentRolls.map((value, row) => row === index ? { ...value, replacement: skill } : value) }, skill),
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
                <label className="field calculated-field"><span>Strain maximum</span><input type="number" value={attributeScore("CON") || ""} disabled title="System Strain maximum equals Constitution" /></label>
                <label className="field"><span>Worn armor</span><select value={armors.some(armor => armor.name === sheet.armor) ? sheet.armor : "No Armor"} onChange={e => patch("armor", e.target.value)}>{armors.map(armor => <option key={armor.name} value={armor.name}>{armor.name} (AC {armor.ac})</option>)}</select></label>
                <label className="field"><span>Shield</span><select value={sheet.shield} onChange={e => patch("shield", e.target.value)}>{shields.map(shield => <option key={shield || "none"} value={shield}>{shield || "No Shield"}</option>)}</select></label>
                <Field label="Magic / custom AC bonus" value={sheet.armorBonus} onChange={v => patch("armorBonus", Number(v))} />
                <label className="field calculated-field"><span>Calculated Armor Class</span><input value={calculatedAc} disabled /></label>
                <label className="field calculated-field"><span>Initiative</span><input value={signed(calculatedInitiative)} disabled /></label>
                <label className="field calculated-field"><span>Base Attack Bonus</span><input value={signed(baseAttack)} disabled title="Calculated from class and character level" /></label>
              </div>
              <div className="hp-builder">
                <div className="hp-builder-heading"><strong>Hit Point Rolls</strong><span>Enter the total shown on all d6 Hit Dice at each level, before modifiers.</span></div>
                <div className="hp-roll-grid">
                  {Array.from({ length: sheet.level || 0 }, (_, index) => {
                    const raw = sheet.hpRolls[index] || "";
                    let previousMaximum = 0;
                    let result = 0;
                    for (let step = 0; step <= index; step += 1) {
                      const roll = Number(sheet.hpRolls[step]);
                      if (!roll) { result = 0; break; }
                      const dice = step + 1;
                      const perDieModifier = attributeMod("CON") + hitPointClassBonus + (hasDieHard ? 2 : 0);
                      const rolled = Math.max(dice, roll + perDieModifier * dice);
                      previousMaximum = step === 0 ? rolled : Math.max(previousMaximum + 1, rolled);
                      result = previousMaximum;
                    }
                    return <label key={index}><span>Level {index + 1}</span><input type="number" min={1} max={(index + 1) * 6} value={raw} placeholder={`${index + 1}d6 total`} onChange={e => {
                      const rolls = [...sheet.hpRolls];
                      rolls[index] = Number(e.target.value);
                      patch("hpRolls", rolls);
                    }} /><small>{result ? `Max HP ${result}` : "Enter roll"}</small></label>;
                  })}
                </div>
                <p className="hp-rule-note">{hpRollsComplete
                  ? `Calculated maximum: ${calculatedHpMax}. Each level keeps the rerolled total only when it beats the prior maximum; otherwise HP rises by 1.${dieHardBonus ? ` Die Hard adds ${dieHardBonus} HP retroactively.` : ""}`
                  : sheet.level ? "Complete every level’s roll to calculate maximum HP automatically. Until then, the existing maximum remains editable." : "Choose a level to enter Hit Point rolls."}</p>
              </div>
            </Section>
            <Section title="Weapons" aside={<span className="caption">Readied items · permanent Unarmed Attack</span>}>
              <div className="weapon-list">
                {displayedWeapons.map(({ name, inventoryIndex }) => {
                  const pick = { name, skill: -1 };
                  const calc = weaponCalc(pick);
                  return <div className="weapon-row" key={`${inventoryIndex}-${name}`}>
                    <strong className="weapon-name" title={`${calc?.w.name}: ${calc?.w.damage} damage, ${calc?.w.shock} Shock, range ${calc?.range || calc?.w.range}, traits ${calc?.w.traits || "none"}.`}>{name}{calc?.virtual && <small> permanent</small>}</strong>
                    {calc && <><div className="weapon-stat-cell weapon-roll-cell"><span>Hit Bonus</span><b>{signed(calc.hit)}</b><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollWeaponAttack(name, calc.hit)}>Roll Attack</button></div><div className="weapon-stat-cell weapon-roll-cell"><span>Damage</span><b>{calc.damage}</b><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} onClick={() => rollWeaponDamage(name, calc.damage)}>Roll Damage</button></div><div className="weapon-stat-cell weapon-range-cell"><span>Range</span><b>{calc.range}</b></div><div className="weapon-details"><span>Shock Damage / AC</span><b>{calc.shock}</b><span>Attack detail</span><small>{calc.note}</small><span>Weapon Trait Codes</span><WeaponTraitCodes traits={calc.w.traits} /></div></>}
                  </div>
                })}
                {!readiedWeapons.length && <p className="empty-slots">Your Unarmed Attack is always available. Ready a weapon on the Inventory tab to add it here.</p>}
              </div>
            </Section>
            <Section title="Foci" aside={<span className="caption">{allowedFocusPicks} picks at level {sheet.level || "—"} · {sheet.focusPicks.length} selection {sheet.focusPicks.length === 1 ? "slot" : "slots"} shown · Level 2 costs two picks</span>}>
              {sheet.focusPicks.map((pick, i) => {
                const focus = foci.find(f => f.name === pick.name);
                return <div className={`choice-row${focusChoiceLabel(pick.name) ? " has-focus-choice" : ""}`} key={i}>
                  <select title={focus ? `${focus.intro}\n\nLevel 1: ${focus.level1}${focus.level2 ? `\n\nLevel 2: ${focus.level2}` : ""}` : "Choose a Focus"} value={pick.name} onChange={e => {
                    const next = e.target.value;
                    const eligibility = focusEligibility(next, i);
                    if (!eligibility.eligible) { setTransferMessage(eligibility.reason); return; }
                    patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,name:next,choice:""}:x));
                  }}><option value="">Choose a Focus…</option>{foci.map(f => {
                    const eligibility = focusEligibility(f.name, i);
                    return <option key={f.name} disabled={!eligibility.eligible} title={eligibility.reason}>{f.name}{eligibility.eligible ? "" : " — unavailable"}</option>;
                  })}</select>
                  <select value={pick.level} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,level:Number(e.target.value)}:x))}><option value={1}>Lvl 1</option><option value={2} disabled={!focus?.level2 || (pick.level !== 2 && focusPicksUsed >= allowedFocusPicks)}>Lvl 2</option></select>
                  {pick.name === "Developed Attribute" && <select aria-label="Developed Attribute choice" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose attribute…</option>{attributes.map(attribute => { const available = focusTargetAvailable(sheet.focusPicks, "Developed Attribute", attribute, i); return <option key={attribute} disabled={!available}>{attribute}{available ? "" : " — already improved"}</option>; })}</select>}
                  {pick.name === "Xenoblooded" && <select aria-label="Xenoblooded gravity adaptation" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose heritage benefit…</option><option>STR +1 / DEX -1</option><option>DEX +1 / STR -1</option><option value="Other">Other non-stat benefit</option></select>}
                  {pick.name === "Traditional Education" && <select aria-label="Traditional Education tradition" value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose tradition…</option><option>High Mage</option><option>Elementalist</option><option>Necromancer</option></select>}
                  {!["Developed Attribute","Xenoblooded"].includes(pick.name) && bonusSkillChoices(pick.name).length > 1 && <select aria-label={`${pick.name} bonus skill`} value={pick.choice || ""} onChange={e => patch("focusPicks", sheet.focusPicks.map((x,j) => j===i ? {...x,choice:e.target.value}:x))}><option value="">Choose bonus skill…</option>{bonusSkillChoices(pick.name).map(skill => { const available = pick.name !== "Specialist" || focusTargetAvailable(sheet.focusPicks, "Specialist", skill, i); return <option key={skill} disabled={!available}>{skill}{available ? "" : " — already specialized"}</option>; })}</select>}
                  {focus ? <Tip title="?"><b>{focus.name}</b><br/>{focus.intro}<br/><br/><b>Level 1:</b> {focus.level1}{pick.level === 2 && <><br/><br/><b>Level 2:</b> {focus.level2}</>}</Tip> :
                    <span className="slot-number" aria-label={`Focus selection ${i + 1}`}>{i + 1}</span>}
                </div>
              })}
              {!sheet.focusPicks.length && <p className="empty-slots">Choose a class and level to receive Focus selection slots.</p>}
            </Section>
          </div>

          <div className="stack skills-column">
            <Section title="Skills" className="skills-section" aside={<span className="caption">Skill ranks · granted sources · effective usable value</span>}>
              <div className={`skill-budget ${advancementPointsSpent > skillPointAllowance ? "over-budget" : ""}`}>
                <strong>Advancement skill points</strong>
                <div className="skill-budget-summary">
                  <span>{skillSpending.spent} skill + {attributeBoostCost} attribute</span>
                  <span>{skillPointAllowance} total · {advancementPointsRemaining}{"\u00a0"}available</span>
                </div>
                <small>
                  <span>Increase a Skill with its dropdown. {selectedClasses.includes("Expert") ? "Quick Learner grants 4 points per level gained." : "You gain 3 points per level gained."}</span>
                  {skillSpending.freePickSkill && <span className="free-creation-pick">Free creation pick: {skillSpending.freePickSkill}.</span>}
                </small>
              </div>
              <div className="skills">
                {skills.map(skill => {
                  const profile = skillProfile(skill);
                  // The stored rank deliberately excludes temporary and granted
                  // sources.  The selector, however, is the player-facing skill
                  // value: a background Free/Quick/Learning result immediately
                  // appears as its minimum (+0 or +1) instead of "Untrained".
                  const minimumSelectable = Math.max(minimumSkillRanks[skill], profile.polymathFloor);
                  const purchasesForDisplayedRank = (rank: number) => storedRankForDisplayedSkillRank(rank, profile.sourceCount);
                  return <div className="skill-row" key={skill}><label><span><span className="skill-name" title={skillOverviews[skill]} tabIndex={0}>{skill}</span>
                    {profile.sourceCount > 0 && <small className="skill-minimum" tabIndex={0}>
                      <span className="skill-minimum-word">Granted</span> {profile.sourceFloor >= 0 ? `+${profile.sourceFloor}` : "untrained"}
                      <span className="skill-minimum-popup" role="tooltip">
                        {minimumSkillSources[skill].map((source, index) => <span key={`${source}-${index}`}>{source}</span>)}
                      </span>
                    </small>}
                    {profile.polymathFloor >= 0 && profile.effective === profile.polymathFloor && profile.granted < profile.polymathFloor && <small className="focus-applied">Polymath floor → +{profile.polymathFloor}</small>}
                    <small className="focus-applied">Effective → {profile.effective < 0 ? "Untrained" : `+${profile.effective}`}</small>
                  </span><select value={profile.effective} aria-label={`${skill} effective skill level`} onChange={e => {
                    const selectedRank = Number(e.target.value);
                    const nextPurchases = {...sheet.skillPurchases, [skill]: purchasesForDisplayedRank(selectedRank)};
                    const plan = calculateSkillSpending(nextPurchases);
                    const nextProfile = skillProfile(skill, nextPurchases);
                    if (nextProfile.effective < minimumSelectable) return;
                    if (plan.spent > availableSkillPoints && nextProfile.granted > skillProfile(skill).granted) return;
                    patch("skillPurchases", nextPurchases);
                  }}>
                    {[-1,0,1,2,3,4].map(n => {
                      const nextPurchases = {...sheet.skillPurchases, [skill]: purchasesForDisplayedRank(n)};
                      const plan = calculateSkillSpending(nextPurchases);
                      const nextProfile = skillProfile(skill, nextPurchases);
                      const legalCap = Math.min(4, maxSkillRank + (profile.sourceCount ? 1 : 0));
                      const disabled = n < minimumSelectable ||
                        nextProfile.effective < minimumSelectable ||
                        nextProfile.granted > legalCap ||
                        (plan.spent > availableSkillPoints && nextProfile.granted > profile.granted);
                      return <option key={n} value={n} disabled={disabled}>{n < 0 ? "Untrained" : `+${n}`}</option>;
                    })}
                  </select></label><button type="button" className="roll-affordance" data-readonly-interactive="true" disabled={virtualDiceBusy} aria-busy={virtualDiceBusy || undefined} aria-expanded={skillRollChooser === skill} onClick={() => setSkillRollChooser(current => current === skill ? null : skill)}>Roll</button>{skillRollChooser === skill && <div className="skill-roll-chooser" data-readonly-interactive="true" role="group" aria-label={`Choose an attribute for ${skill}`}><span>Roll with</span><div className="skill-roll-options">{attributes.map(attribute => <button type="button" key={attribute} disabled={virtualDiceBusy} onClick={() => rollSkillCheck(skill, attribute)}>{attribute} {signed(attributeMod(attribute))}</button>)}</div></div>}</div>;
                })}
              </div>
            </Section>
            <Section title="Languages" aside={<span className="caption">{sheet.languages.length}/{languageAllowance} known · lingua franca + native tongue + Know/Connect bonuses</span>}>
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
          {selectedClasses.includes("Vowed") && <Section title="Vowed Discipline"><div className="vowed-controls"><label className="field"><span>Order skill (Effort + bonus skill)</span><select value={sheet.vowedEffortSkill} onChange={e=>patch("vowedEffortSkill",e.target.value)}>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label><div><span>Punch hit</span><b>{signed(vowedProgression[effectiveLevel-1].hit)}</b></div><div><span>Punch damage</span><b>{vowedProgression[effectiveLevel-1].damage}</b></div><div><span>Punch Shock</span><b>{vowedProgression[effectiveLevel-1].shock.replace("/", "/AC ")}</b></div></div><p className="section-intro">The selected Order skill is the Vowed’s required noncombat bonus skill and is also used to calculate Vowed Effort.</p></Section>}
          {selectedClasses.includes("Wise") && <Section title="Wise Concept"><div className="vowed-controls"><label className="field"><span>Concept bonus skill</span><select value={sheet.wiseConceptSkill} onChange={e=>patch("wiseConceptSkill",e.target.value)}><option value="">Choose a concept-appropriate skill…</option>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the noncombat skill most appropriate to the Wise’s concept. It is granted as the Wise class bonus skill and shown with its source on the Skills panel.</p></Section>}
          {castingTraditions.length > 0 && <Section title="Spellbook" aside={<span className="caption">{knownSpellAllowance} known-spell selections at level {sheet.level} · spell levels 1–{limits.max} · prepare up to {limits.prepared}</span>}>
            <p className="section-intro">{isInvoker ? `Invoker spells spend points equal to spell level. You have ${limits.casts} spell points each day and may cast a prepared spell repeatedly.` : "Choose each known spell from the complete SRD list. Prepared spells are bright; unprepared spells remain in your spellbook but are muted."}</p>
            <div className="spell-list">
              {sheet.spellPicks.map((pick, i) => {
                const spell = availableSpells.find(s => s.name === pick.name);
                const unavailable = spell && spell.level > limits.max;
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
                  {spell ? <Tip title={`Level ${spell.level}`}><RulesTooltip name={`${spell.name} · ${spell.tradition}`} text={spell.text}/></Tip> :
                    <span className="slot-number" aria-label={`Spell selection ${i + 1}`}>{i + 1}</span>}
                  {isInvoker
                    ? <label className={`cast-check ${castingBlocked ? "casting-blocked" : ""}`} title={castingBlockedReason}><input type="number" min={0} max={spell ? Math.floor(limits.casts / spell.level) : 0} value={pick.casts || 0} disabled={castingBlocked || !pick.prepared} aria-label={`${pick.name || "Spell"} casts today`} onChange={e => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: Math.max(0, Number(e.target.value) || 0), cast: false } : x))}/><span>Times cast</span></label>
                    : <label className={`cast-check ${castingBlocked ? "casting-blocked" : ""}`} title={castingBlockedReason}><input type="checkbox" checked={pick.cast} disabled={castingBlocked || (!pick.prepared && !pick.cast) || (!pick.cast && castsUsed >= limits.casts)} onChange={e => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, cast: e.target.checked } : x))}/><span>Cast</span></label>}
                </div>
              })}
            </div>
          </Section>}
          <Section title="Arts" aside={<span className="caption">{artTraditions.join(" + ")} · {sheet.artPicks.filter(Boolean).length}/{artAllowance} available by level {sheet.level}</span>}>
            <div className="arts-grid">{sheet.artPicks.map((name,i)=>{const art=availableArts.find(a=>a.name===name);return <div className={`art-card ${dragging?.kind==="art"&&dragging.index===i ? "dragging":""}`} key={i} data-drag-kind="art" data-drag-index={i}
              onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const from=Number(e.dataTransfer.getData("text/plain"));if(Number.isInteger(from))moveItem("art",from,i);setDragging(null)}}>
              <button className="drag-handle" aria-label={`Reorder ${name || `art row ${i+1}`}`} title="Drag to reorder"
                draggable onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));setDragging({kind:"art",index:i})}} onDragEnd={()=>setDragging(null)}
                onPointerDown={e=>beginPointerDrag("art",i,e)} onPointerMove={e=>continuePointerDrag("art",e)} onPointerUp={()=>setDragging(null)} onPointerCancel={()=>setDragging(null)}>⠿</button>
              <select title={art?.text || "Choose an art"} value={name} onChange={e=>{
                const next = e.target.value;
                if (next && !artEligibility(next, i).eligible) { setTransferMessage(artEligibility(next, i).reason); return; }
                patch("artPicks",sheet.artPicks.map((x,j)=>j===i?next:x));
              }}><option value="">Choose an art…</option>{artTraditions.filter(t=>t!=="Invoker").map(t=><optgroup key={t} label={t}>{availableArts.filter(a=>a.tradition===t).map(a=>{
                const eligibility = artEligibility(a.name, i);
                return <option disabled={!eligibility.eligible} key={`${t}-${a.name}`}>{a.name}{eligibility.eligible ? "" : ` — ${eligibility.reason}`}</option>;
              })}</optgroup>)}</select>{art ? <Tip title="?"><RulesTooltip name={art.name} text={art.text} extra={art.minLevel ? `Minimum level ${art.minLevel}.` : undefined}/></Tip> :
                <span className="slot-number" aria-label={`Art selection ${i + 1}`}>{i + 1}</span>}<label className="check"><input type="checkbox" checked={Boolean(sheet.artEffort[i])} disabled={!name || (Boolean(art && armorRestrictedTraditions.includes(art.tradition)) && castingBlocked) || (!sheet.artEffort[i] && (effortPools.find(p=>p.tradition===art?.tradition)?.used ?? 0) >= (effortPools.find(p=>p.tradition===art?.tradition)?.max ?? 0))} onChange={e=>patch("artEffort",sheet.artPicks.map((_,j)=>j===i?e.target.checked:Boolean(sheet.artEffort[j])))}/><span>Effort</span></label></div>})}</div>
            {!sheet.artPicks.length && <p className="empty-slots">This class has no Art selections at the current level.</p>}
          </Section>
        </div>}

        {tab === "inventory" && <div className="inventory-grid">
          <Section title="Readied Items" aside={<span className="caption">{attributeScore("STR") ? `Standard capacity: ${readiedCapacity} · half STR ${attributeScore("STR")}, rounded down` : "Choose a Strength score to calculate capacity"}</span>}>
            {readiedSlots.map((item, i) => <div className={`inventory-item-row ${i >= readiedCapacity ? "inventory-overflow" : ""}`} key={i}>
              <label className="field">
                <span>{i+1}{i >= readiedCapacity ? " · Over capacity" : ""}</span>
                <select value="" aria-label={`Readied item slot ${i + 1}`} onChange={e => {
                  if (e.target.value !== "") swapReadiedWithStowed(i, Number(e.target.value));
                }}>
                  <option value="">{item || "Choose a stowed item…"}</option>
                  {stowedSlots.map((stowedItem, stowedIndex) => stowedItem && <option value={stowedIndex} key={`${stowedIndex}-${stowedItem}`}>{stowedItem}</option>)}
                </select>
              </label>
              {item && <button type="button" className="drop-item" onClick={() => dropInventoryItem("readied", i, item)}>Drop</button>}
            </div>)}
            {!readiedSlots.length && <p className="empty-slots">No Readied slots until a Strength score is selected.</p>}
          </Section>
          <Section title="Stowed Items" aside={<span className="caption">{attributeScore("STR") ? `Standard capacity: ${stowedCapacity} · equal to STR ${attributeScore("STR")}` : "Choose a Strength score to calculate capacity"}</span>}>
            {stowedSlots.map((item, i) => {
              const isCustom = Boolean(item) && !officialInventorySet.has(item);
              return <div className={`inventory-item-row ${i >= stowedCapacity ? "inventory-overflow" : ""}`} key={i}>
                <label className="field">
                  <span>{i+1}{i >= stowedCapacity ? " · Over capacity" : ""}</span>
                  <select value={isCustom || otherStowedIndex === i ? "__other__" : item} aria-label={`Stowed item slot ${i + 1}`} onChange={e => {
                    const transfer = decodeInventoryTransfer(e.target.value);
                    if (transfer) {
                      swapStowedBetweenOwners({ kind: "pc" }, i, transfer, transfer.index);
                      return;
                    }
                    if (e.target.value === "__other__") {
                      setOtherStowedIndex(i);
                      if (!isCustom) setStowedItem(i, "");
                    } else {
                      setOtherStowedIndex(null);
                      setStowedItem(i, e.target.value);
                    }
                  }}>
                    <option value="">Choose an item…</option>
                    <option value="__other__">Other…</option>
                    {sheet.companions.map((companion, companionIndex) => {
                      const items = inventorySlots(companion.stowed, Math.max(0, companion.strength || 0));
                      const available = items.map((name, index) => ({ name, index })).filter(entry => entry.name);
                      if (!available.length) return null;
                      return <optgroup key={companion.id} label={`${companionInventoryLabel(companion, companionIndex)}’s Stowed Items`}>
                        {available.map(entry => <option key={`${companion.id}-${entry.index}-${entry.name}`} value={encodeInventoryTransfer({ kind: "companion", id: companion.id }, entry.index)}>{entry.name}</option>)}
                      </optgroup>;
                    })}
                    <optgroup label="Weapons">{inventoryWeapons.map(weapon => <option key={weapon.name} value={weapon.name}>{weapon.name}</option>)}</optgroup>
                    <optgroup label="Armor & Shields">{inventoryArmors.map(armor => <option key={armor} value={armor}>{armor}</option>)}<option>Small Shield</option><option>Large Shield</option></optgroup>
                    <optgroup label="Adventuring Gear">{adventuringGear.map(gear => <option key={gear} value={gear}>{gear}</option>)}</optgroup>
                    <optgroup label="Gear Bundles">{gearBundles.map(bundle => <option key={bundle} value={bundle}>{bundle}</option>)}</optgroup>
                  </select>
                  {(isCustom || otherStowedIndex === i) && <input autoFocus={otherStowedIndex === i && !item} aria-label={`Other stowed item ${i + 1}`} placeholder="Type another item…" value={item} onChange={e => setStowedItem(i, e.target.value)} />}
                </label>
                {item && <button type="button" className="drop-item" onClick={() => dropInventoryItem("stowed", i, item)}>Drop</button>}
              </div>;
            })}
            {!stowedSlots.length && <p className="empty-slots">No Stowed slots until a Strength score is selected.</p>}
          </Section>
        </div>}

        {tab === "notes" && <div className="notes-grid">
          <Section title="Goals"><label className="field"><textarea className="tall" value={sheet.goals} onChange={e=>patch("goals",e.target.value)}/></label></Section>
          <Section title="Allies & Enemies"><label className="field"><textarea className="tall" value={sheet.allies} onChange={e=>patch("allies",e.target.value)}/></label></Section>
          <Section title="Notes"><label className="field"><textarea className="very-tall" value={sheet.notes} onChange={e=>patch("notes",e.target.value)}/></label></Section>
        </div>}

        {tab.startsWith("companion:") && (() => {
          const companion = sheet.companions.find(item => `companion:${item.id}` === tab);
          if (!companion) return null;
          const familiar = companion.kind === "familiar";
          const familiarFocus = familiar ? spiritFamiliars.find(({ index }) => index === companion.focusSlot)?.pick : undefined;
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
          const benefits = [
            "Hit points equal three times your level",
            "Attack at half your level for 1d8 damage",
            "+1 skill bonus for one background",
            "One additional shape",
            "Hover or fly at normal speed",
            "Speak any language you know",
          ];
          const familiarBenefits = companion.familiarBenefits || [];
          const familiarMaxHp = familiarBenefits.includes("Hit points equal three times your level")
            ? effectiveLevel * 3
            : effectiveLevel;
          const familiarAttack = familiarBenefits.includes("Attack at half your level for 1d8 damage")
            ? signed(Math.ceil(effectiveLevel / 2))
            : "No effective attack";
          const familiarDamage = familiarBenefits.includes("Attack at half your level for 1d8 damage") ? "1d8" : "—";
          const familiarSkill = familiarBenefits.includes("+1 skill bonus for one background") ? "+1" : "+0";
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
                note: familiar && !familiarBenefits.includes("Attack at half your level for 1d8 damage")
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
            if (!window.confirm(`Drop ${item}?\n\nThis removes it from ${companion.name || "the companion"}’s inventory.`)) return;
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
                <label className="field"><span>Movement</span><input readOnly value={familiar ? companion.move : henchmanProfile.move} /></label>
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
                      <div><span>Range</span><b>{weapon.range}</b></div>
                      {!familiar && <div className="weapon-details"><span>{profile.ability} · {profile.skill} · Shock Damage / AC</span><b>{profile.shock}</b><span>Weapon Trait Codes</span><WeaponTraitCodes traits={weapon.traits} /></div>}
                    </div>
                  );})}
                  {!companionReadiedWeapons.length && <p className="empty-slots">Your Unarmed Attack is always available. Ready a weapon below to add it here.</p>}
                </div>
              </div>
              {familiar && focusLevel >= 2 && <div className="familiar-benefits">
                <strong>Level 2 benefits <small>Choose two</small></strong>
                {benefits.map(benefit => {
                  const chosen = (companion.familiarBenefits || []).includes(benefit);
                  const atLimit = !chosen && (companion.familiarBenefits || []).length >= 2;
                  return <label key={benefit}><input type="checkbox" checked={chosen} disabled={atLimit} onChange={e => patchCompanion(companion.id, "familiarBenefits", e.target.checked ? [...(companion.familiarBenefits || []), benefit] : (companion.familiarBenefits || []).filter(item => item !== benefit))} />{benefit}</label>;
                })}
                {familiarBenefits.includes("+1 skill bonus for one background") && <label className="field familiar-background">
                  <span>Skilled background</span>
                  <select value={companion.familiarBackground || ""} onChange={e => patchCompanion(companion.id, "familiarBackground", e.target.value)}>
                    <option value="">Choose background…</option>
                    {backgroundNames.map(background => <option key={background}>{background}</option>)}
                  </select>
                </label>}
              </div>}
            </Section>
            <Section title="Inventory" aside={<span className="caption">Readied {readiedCapacity} · Stowed {stowedCapacity} from Strength</span>}>
              <label className="field companion-strength"><span>Strength score</span><input type="number" min="0" max="30" value={companionStrength || ""} readOnly={!familiar} onChange={e => familiar && patchCompanion(companion.id, "strength", Number(e.target.value))} /></label>
              {!familiar && <p className="section-intro">Carrying capacity follows this archetype’s Strength score. Changing archetype replaces its complete stat spread while preserving equipment and notes.</p>}
              {familiar && <p className="section-intro">A dismissed familiar cannot take carried objects with it.</p>}
              <h3 className="companion-inventory-title">Readied items</h3>
              {companionReadied.map((item, index) => <div className={`inventory-item-row ${index >= readiedCapacity ? "inventory-overflow" : ""}`} key={`r-${index}`}>
                <label className="field"><span>{index + 1}{index >= readiedCapacity ? " · Over capacity" : ""}</span><select value="" aria-label={`Companion readied item slot ${index + 1}`} onChange={e => { if (e.target.value !== "") swapCompanionItem(index, Number(e.target.value)); }}>
                  <option value="">{item || "Choose a stowed item…"}</option>
                  {companionStowed.map((stowedItem, stowedIndex) => stowedItem && <option value={stowedIndex} key={`${stowedIndex}-${stowedItem}`}>{stowedItem}</option>)}
                </select></label>
                {item && <button type="button" className="drop-item" onClick={() => dropCompanionItem("readied", index, item)}>Drop</button>}
              </div>)}
              {!companionReadied.length && <p className="empty-slots">No Readied slots until a Strength score is selected.</p>}
              <h3 className="companion-inventory-title">Stowed items</h3>
              {companionStowed.map((item, index) => {
                const isCustom = Boolean(item) && !officialInventorySet.has(item);
                const editingOther = companionOtherStowed[companion.id] === index;
                return <div className={`inventory-item-row ${index >= stowedCapacity ? "inventory-overflow" : ""}`} key={`s-${index}`}>
                  <label className="field"><span>{index + 1}{index >= stowedCapacity ? " · Over capacity" : ""}</span>
                    <select value={isCustom || editingOther ? "__other__" : item} aria-label={`Companion stowed item slot ${index + 1}`} onChange={e => {
                      const transfer = decodeInventoryTransfer(e.target.value);
                      if (transfer) {
                        swapStowedBetweenOwners({ kind: "companion", id: companion.id }, index, transfer, transfer.index);
                        return;
                      }
                      if (e.target.value === "__other__") {
                        setCompanionOtherStowed(current => ({ ...current, [companion.id]: index }));
                        if (!isCustom) setCompanionStowedItem(index, "");
                      } else {
                        setCompanionOtherStowed(current => ({ ...current, [companion.id]: null }));
                        setCompanionStowedItem(index, e.target.value);
                      }
                    }}>
                      <option value="">Choose an item…</option>
                      <option value="__other__">Other…</option>
                      {(() => {
                        const pcName = sheet.name || "PC";
                        const available = stowedSlots.map((name, itemIndex) => ({ name, itemIndex })).filter(entry => entry.name);
                        return available.length ? <optgroup label={`${pcName}’s Stowed Items`}>
                          {available.map(entry => <option key={`pc-${entry.itemIndex}-${entry.name}`} value={encodeInventoryTransfer({ kind: "pc" }, entry.itemIndex)}>{entry.name}</option>)}
                        </optgroup> : null;
                      })()}
                      {sheet.companions.map((otherCompanion, otherIndex) => {
                        if (otherCompanion.id === companion.id) return null;
                        const items = inventorySlots(otherCompanion.stowed, Math.max(0, otherCompanion.strength || 0));
                        const available = items.map((name, itemIndex) => ({ name, itemIndex })).filter(entry => entry.name);
                        if (!available.length) return null;
                        return <optgroup key={otherCompanion.id} label={`${companionInventoryLabel(otherCompanion, otherIndex)}’s Stowed Items`}>
                          {available.map(entry => <option key={`${otherCompanion.id}-${entry.itemIndex}-${entry.name}`} value={encodeInventoryTransfer({ kind: "companion", id: otherCompanion.id }, entry.itemIndex)}>{entry.name}</option>)}
                        </optgroup>;
                      })}
                      <optgroup label="Weapons">{inventoryWeapons.map(weapon => <option key={weapon.name} value={weapon.name}>{weapon.name}</option>)}</optgroup>
                      <optgroup label="Armor & Shields">{inventoryArmors.map(armor => <option key={armor} value={armor}>{armor}</option>)}<option>Small Shield</option><option>Large Shield</option></optgroup>
                      <optgroup label="Adventuring Gear">{adventuringGear.map(gear => <option key={gear} value={gear}>{gear}</option>)}</optgroup>
                      <optgroup label="Gear Bundles">{gearBundles.map(bundle => <option key={bundle} value={bundle}>{bundle}</option>)}</optgroup>
                    </select>
                    {(isCustom || editingOther) && <input autoFocus={editingOther && !item} aria-label={`Other companion stowed item ${index + 1}`} placeholder="Type another item…" value={item} onChange={e => setCompanionStowedItem(index, e.target.value)} />}
                  </label>
                  {item && <button type="button" className="drop-item" onClick={() => dropCompanionItem("stowed", index, item)}>Drop</button>}
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
        {cloudId && canEdit && campaignLinks.length > 0 && <section className="character-campaign-links" data-readonly-interactive="true" aria-labelledby="character-campaign-links-title">
          <div>
            <strong id="character-campaign-links-title">Campaigns</strong>
            <small>{campaignLinks.length === 1 ? "This character is linked to one private campaign." : `This character is linked to ${campaignLinks.length} private campaigns.`}</small>
          </div>
          <nav aria-label="Campaigns linked to this character">
            {campaignLinks.map(campaign => <a key={campaign.id} href={`/campaigns/${campaign.id}`}>
              <span>{campaign.name}</span>
              <strong>{campaignLinks.length === 1 ? "Open Campaign" : "Open"}</strong>
            </a>)}
          </nav>
        </section>}
        {cloudId && canEdit && <section className="character-sharing character-sharing-footer" data-readonly-interactive="true" aria-labelledby="character-sharing-title">
          <div className="character-sharing-heading">
            <strong id="character-sharing-title">Privacy & Sharing</strong>
            <small>Choose who can view this character.</small>
          </div>
          <label><span>Visibility</span><select value={cloudVisibility} onChange={event => void changeVisibility(event.target.value as CharacterVisibility)}>
            <option value="private">Private · only you</option>
            <option value="unlisted">Unlisted · anyone with link</option>
            <option value="public">Public · discoverable</option>
          </select></label>
          {cloudVisibility !== "private" && <button type="button" onClick={() => void copyShareLink()}>Copy Share Link</button>}
          <small className="character-sharing-status">{cloudVisibility === "private" ? "Not available to other visitors." : cloudVisibility === "unlisted" ? "Viewable at its stable link, but absent from Public Characters." : "Viewable at its stable link and listed in Public Characters."}</small>
        </section>}
        <footer>Rules authority: Worlds Without Number SRD 1.0 (March 13, 2024, CC0). Fan-made utility; not an official Sine Nomine product.</footer>
      </div>
    </main>
  );
}
