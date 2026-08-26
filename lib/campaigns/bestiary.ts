import type { CampaignNpcAttack, CampaignNpcDraft } from "./npcs.ts";
import type { CampaignNpcCombatStats } from "./live-session.ts";

/**
 * Immutable creature definitions derived exclusively from the CC0 Worlds
 * Without Number SRD corpus already imported by this project. See
 * scripts/import-srd-search.mjs and the "Monster & NPC Statistics" SRD entry.
 *
 * The SRD gives creatures hit dice rather than fixed hit points. hpMax is a
 * rounded-up average of 1d8 per hit die, so it is a useful default for the
 * existing campaign NPC and encounter models; the original hit-die notation is
 * retained in notes.
 */
export interface BuiltInBestiaryCreature {
  readonly id: string;
  readonly name: string;
  readonly hpMax: number;
  readonly armorClass: number;
  readonly physicalSave: number;
  readonly evasionSave: number;
  readonly mentalSave: number;
  readonly attacks: readonly Readonly<CampaignNpcAttack>[];
  readonly notes: string;
  readonly description: string;
  readonly sourceStats: BuiltInBestiarySourceStats;
}

export interface BuiltInBestiarySourceStats { hitDice: number; shock: string; move: string; morale: number; instinct: number; skill: number }
type CreatureDefinition = Omit<BuiltInBestiaryCreature, "attacks" | "description" | "sourceStats"> & { attacks: CampaignNpcAttack[] };

function defineCreature(creature: CreatureDefinition): BuiltInBestiaryCreature {
  const context = creatureContext[creature.id];
  return Object.freeze({
    ...creature,
    description: context.description,
    sourceStats: context.sourceStats,
    attacks: Object.freeze(creature.attacks.map(attack => Object.freeze({ ...attack }))),
  });
}

function attack(attackBonus: number, damage: string, description = ""): CampaignNpcAttack {
  return { name: "Attack", attackBonus, damage, description };
}

function statNotes(hitDice: number, shock: string, move: string, morale: number, instinct: number, skill: number, extra = ""): string {
  const averageHp = Math.ceil(hitDice * 4.5);
  return `CC0 WWN SRD stat line: ${hitDice} HD (default HP ${averageHp}, rounded-up average of ${hitDice}d8); Shock ${shock}; Move ${move}; Morale ${morale}; Instinct ${instinct}; Skill +${skill}.${extra ? ` ${extra}` : ""}`;
}

const creatureContext: Record<string, { description: string; sourceStats: BuiltInBestiarySourceStats }> = {
  "small-pack-predator": { description: "A small, fast pack hunter that overwhelms isolated prey with numbers.", sourceStats: { hitDice: 1, shock: "1/13", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "large-solitary-predator": { description: "A powerful lone hunter suited to dangerous wilderness territory.", sourceStats: { hitDice: 5, shock: "2/13", move: "30'", morale: 8, instinct: 6, skill: 1 } },
  "apex-predator": { description: "A huge and exceptionally dangerous hunting beast, suitable for dire predators and other apex carnivores.", sourceStats: { hitDice: 6, shock: "2/13", move: "40'", morale: 8, instinct: 6, skill: 2 } },
  "herd-beast": { description: "A common grazing animal that can become dangerous when startled or defending its young.", sourceStats: { hitDice: 2, shock: "None", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "vicious-large-herbivore": { description: "A large territorial herbivore with enough mass and aggression to threaten a party.", sourceStats: { hitDice: 4, shock: "1/13", move: "40'", morale: 9, instinct: 6, skill: 1 } },
  "elephantine-grazer": { description: "An enormous grazer whose bulk and crushing attacks make it a formidable obstacle.", sourceStats: { hitDice: 6, shock: "None", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "automaton-humanlike": { description: "A human-shaped artificial servant or guardian carrying an ordinary weapon.", sourceStats: { hitDice: 2, shock: "Weapon", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "automaton-laborer": { description: "A durable industrial construct designed for repetitive physical work.", sourceStats: { hitDice: 2, shock: "1/13", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "automaton-military": { description: "A reinforced combat automaton built for disciplined military service.", sourceStats: { hitDice: 4, shock: "4/15", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "slime-or-ooze": { description: "A mindless amorphous predator that attacks with engulfing pseudopods.", sourceStats: { hitDice: 6, shock: "1/-", move: "20'", morale: 12, instinct: 5, skill: 1 } },
  "small-vicious-predator": { description: "A compact, aggressive predator that attacks quickly and without hesitation.", sourceStats: { hitDice: 1, shock: "1/13", move: "30'", morale: 7, instinct: 5, skill: 1 } },
  "large-vicious-predator": { description: "A large and ferocious predator capable of multiple savage attacks.", sourceStats: { hitDice: 6, shock: "2/15", move: "40'", morale: 9, instinct: 5, skill: 2 } },
  "hulking-predator": { description: "A massive predator with terrifying strength and a thick defensive hide.", sourceStats: { hitDice: 10, shock: "6/15", move: "30'", morale: 10, instinct: 4, skill: 1 } },
  "unnatural-swarm": { description: "A supernatural swarm that assails foes with a mass of unnatural attackers.", sourceStats: { hitDice: 4, shock: "1/-", move: "30'", morale: 10, instinct: 5, skill: 1 } },
  "terrible-warbeast": { description: "A monstrous war-trained beast bred or bound for brutal battlefield assaults.", sourceStats: { hitDice: 8, shock: "7/15", move: "40'", morale: 9, instinct: 4, skill: 2 } },
  "legendary-god-titan": { description: "A legendary colossal being of near-divine power, appropriate only for mythic confrontations.", sourceStats: { hitDice: 20, shock: "10/-", move: "40'", morale: 10, instinct: 3, skill: 3 } },
};

export const builtInBestiaryCreatures: readonly BuiltInBestiaryCreature[] = Object.freeze([
  defineCreature({ id: "small-pack-predator", name: "Small Pack Predator", hpMax: 5, armorClass: 12, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(2, "1d4")], notes: statNotes(1, "1/13", "40'", 7, 6, 1) }),
  defineCreature({ id: "large-solitary-predator", name: "Large Solitary Predator", hpMax: 23, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(6, "1d8")], notes: statNotes(5, "2/13", "30'", 8, 6, 1) }),
  defineCreature({ id: "apex-predator", name: "Apex Predator", hpMax: 27, armorClass: 13, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(6, "1d8", "Two attacks per Main Action.")], notes: statNotes(6, "2/13", "40'", 8, 6, 2) }),
  defineCreature({ id: "herd-beast", name: "Herd Beast", hpMax: 9, armorClass: 11, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "1d4")], notes: statNotes(2, "None", "40'", 7, 6, 1) }),
  defineCreature({ id: "vicious-large-herbivore", name: "Vicious Large Herbivore", hpMax: 18, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(5, "1d10")], notes: statNotes(4, "1/13", "40'", 9, 6, 1) }),
  defineCreature({ id: "elephantine-grazer", name: "Elephantine Grazer", hpMax: 27, armorClass: 13, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(5, "2d8")], notes: statNotes(6, "None", "40'", 7, 6, 1) }),
  defineCreature({ id: "automaton-humanlike", name: "Automaton, Humanlike", hpMax: 9, armorClass: 13, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "Weapon")], notes: statNotes(2, "Weapon", "30'", 12, 3, 1) }),
  defineCreature({ id: "automaton-laborer", name: "Automaton, Laborer", hpMax: 9, armorClass: 15, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "1d6")], notes: statNotes(2, "1/13", "30'", 12, 3, 1) }),
  defineCreature({ id: "automaton-military", name: "Automaton, Military", hpMax: 18, armorClass: 18, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(5, "1d10+2")], notes: statNotes(4, "4/15", "30'", 12, 3, 1) }),
  defineCreature({ id: "slime-or-ooze", name: "Slime or Ooze", hpMax: 27, armorClass: 10, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(6, "1d8", "Two attacks per Main Action.")], notes: statNotes(6, "1/-", "20'", 12, 5, 1) }),
  defineCreature({ id: "small-vicious-predator", name: "Predator, Small Vicious", hpMax: 5, armorClass: 14, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(1, "1d4")], notes: statNotes(1, "1/13", "30'", 7, 5, 1) }),
  defineCreature({ id: "large-vicious-predator", name: "Predator, Large Vicious", hpMax: 27, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(7, "2d6", "Two attacks per Main Action.")], notes: statNotes(6, "2/15", "40'", 9, 5, 2) }),
  defineCreature({ id: "hulking-predator", name: "Predator, Hulking", hpMax: 45, armorClass: 15, physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(12, "2d6+3", "Two attacks per Main Action.")], notes: statNotes(10, "6/15", "30'", 10, 4, 1) }),
  defineCreature({ id: "unnatural-swarm", name: "Unnatural Swarm", hpMax: 18, armorClass: 10, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(6, "1d6", "Three attacks per Main Action.")], notes: statNotes(4, "1/-", "30'", 10, 5, 1) }),
  defineCreature({ id: "terrible-warbeast", name: "Terrible Warbeast", hpMax: 36, armorClass: 15, physicalSave: 11, evasionSave: 11, mentalSave: 11, attacks: [attack(10, "2d6+4", "Two attacks per Main Action.")], notes: statNotes(8, "7/15", "40'", 9, 4, 2) }),
  defineCreature({ id: "legendary-god-titan", name: "Legendary God-Titan", hpMax: 90, armorClass: 22, physicalSave: 2, evasionSave: 2, mentalSave: 2, attacks: [attack(20, "2d10+5", "Three attacks per Main Action.")], notes: statNotes(20, "10/-", "40'", 10, 3, 3) }),
]);

export function getBuiltInBestiaryCreature(id: string): BuiltInBestiaryCreature | null {
  return builtInBestiaryCreatures.find(creature => creature.id === id) ?? null;
}

export function searchBuiltInBestiaryCreatures(query: string): BuiltInBestiaryCreature[] {
  const normalized = query.trim().toLocaleLowerCase();
  return builtInBestiaryCreatures.filter(creature => !normalized || creature.name.toLocaleLowerCase().includes(normalized));
}

export function builtInBestiaryCreatureDraft(id: string): CampaignNpcDraft | null {
  const creature = getBuiltInBestiaryCreature(id);
  if (!creature) return null;
  return {
    name: creature.name,
    hpMax: creature.hpMax,
    armorClass: creature.armorClass,
    physicalSave: creature.physicalSave,
    evasionSave: creature.evasionSave,
    mentalSave: creature.mentalSave,
    attacks: creature.attacks.map(attack => ({ ...attack })),
    notes: creature.notes,
  };
}

export function builtInBestiaryEncounterSeed(id: string): { name: string; initiative: number; hpCurrent: number; hpMax: number; armorClass: number; notes: string; combatStats: CampaignNpcCombatStats } | null {
  const creature = getBuiltInBestiaryCreature(id);
  if (!creature) return null;
  return {
    name: creature.name,
    initiative: 0,
    hpCurrent: creature.hpMax,
    hpMax: creature.hpMax,
    armorClass: creature.armorClass,
    notes: creature.notes,
    combatStats: { saves: { physical: creature.physicalSave, evasion: creature.evasionSave, mental: creature.mentalSave }, attacks: creature.attacks.map(attack => ({ ...attack })), notes: creature.notes, sourceStats: { ...creature.sourceStats } },
  };
}
