import type { CampaignNpcAttack, CampaignNpcDraft } from "./npcs.ts";
import type { CampaignEncounterNpc, CampaignNpcCombatStats } from "./live-session.ts";
import { npcWeaponStarters } from "./npc-weapons.ts";
import { calculateWwnThreatEstimate, type WwnThreatBand } from "./wwn-threat.ts";
import { thoseOutsideTheWallsPreviewCreatures } from "./bestiary-those-outside-the-walls.ts";

/**
 * Immutable creature definitions derived exclusively from the CC0 Worlds
 * Without Number SRD corpus already imported by this project. See
 * scripts/import-srd-search.mjs and the "Monster & NPC Statistics" SRD entry.
 *
 * The SRD gives creatures hit dice rather than fixed hit points. hpMax is a
 * rounded-up average of 1d8 per hit die, so it is a useful default for the
 * existing campaign NPC and encounter models.
 */
export interface BuiltInBestiaryCreature {
  readonly id: string;
  readonly name: string;
  readonly hpMax: number;
  readonly armorClass: number;
  readonly physicalSave: number;
  readonly evasionSave: number;
  readonly mentalSave: number;
  /** The playable, TWE-curated physical attacks copied into templates and encounters. */
  readonly attacks: readonly Readonly<CampaignNpcAttack>[];
  /** Source-facing attack entries retained alongside the playable attack list. */
  readonly sourceAttacks: readonly Readonly<CampaignNpcAttack>[];
  readonly notes: string;
  /** Source notation such as a (armor), s (shield), or gp (grand plate). */
  readonly armorAnnotation?: string;
  readonly spellcasting?: BuiltInBestiarySpellcasting;
  /** Rules-facing source abilities that do not fit the ordinary attack fields. */
  readonly abilities?: readonly Readonly<BuiltInBestiaryAbility>[];
  readonly description: string;
  readonly sourceStats: BuiltInBestiarySourceStats;
  readonly source: BuiltInBestiarySource;
}

export interface BuiltInBestiarySource { readonly name: string; readonly license: string; readonly creator?: string; readonly url?: string }
export interface BuiltInBestiaryMagicReference { readonly name: string; readonly level?: number; readonly summary: string }
export interface BuiltInBestiaryAbility { readonly name: string; readonly summary: string }
export interface BuiltInBestiarySpellcasting {
  readonly level: number;
  readonly effort: number;
  /** A TWE-curated or source-statblock loadout. */
  readonly tradition: string;
  readonly sourceLoadout?: boolean;
  readonly spellsPerDay?: number;
  readonly spells: readonly Readonly<BuiltInBestiaryMagicReference>[];
  readonly arts: readonly Readonly<BuiltInBestiaryMagicReference>[];
}
export interface BestiaryNpcMagicOption {
  readonly key: string;
  readonly name: string;
  readonly level?: number;
  readonly summary: string;
}
export interface BestiaryNpcAttackOption extends Readonly<CampaignNpcAttack> {
  readonly key: string;
}
export interface BuiltInBestiarySourceStats {
  readonly hitDice: number;
  readonly hitDiceDisplay?: string;
  readonly attacksPerMainAction: number;
  readonly attacksPerMainActionDisplay?: string;
  readonly shock: string;
  readonly move: string;
  readonly morale: number;
  readonly instinct: number;
  readonly skill: number;
}
export const worldsWithoutNumberSrdSource: BuiltInBestiarySource = Object.freeze({
  name: "Worlds Without Number SRD",
  license: "CC0",
});

type CreatureDefinition = Omit<BuiltInBestiaryCreature, "attacks" | "sourceAttacks" | "description" | "source" | "sourceStats" | "spellcasting"> & {
  attacks: CampaignNpcAttack[];
  spellcasting?: { readonly level: number; readonly effort: number };
};

interface CuratedPhysicalAttack { readonly name: string; readonly weapon?: string }

const curatedPhysicalAttacks: Readonly<Record<string, CuratedPhysicalAttack>> = Object.freeze({
  "small-pack-predator": { name: "Bite" },
  "large-solitary-predator": { name: "Bite" },
  "apex-predator": { name: "Rending Bite" },
  "herd-beast": { name: "Horns" },
  "vicious-large-herbivore": { name: "Goring Horns" },
  "elephantine-grazer": { name: "Tusks" },
  "automaton-humanlike": { name: "Sword, Long", weapon: "Sword, Long" },
  "automaton-laborer": { name: "Piston Fists" },
  "automaton-military": { name: "Halberd", weapon: "Halberd" },
  "slime-or-ooze": { name: "Acidic Pseudopod" },
  "small-vicious-predator": { name: "Fangs" },
  "large-vicious-predator": { name: "Rending Bite" },
  "hulking-predator": { name: "Rending Claws" },
  "unnatural-swarm": { name: "Swarm of Bites" },
  "terrible-warbeast": { name: "Goring Horns" },
  "legendary-god-titan": { name: "Titanic Fist" },
  "peaceful-human": { name: "Club", weapon: "Club" },
  "thug-or-militia": { name: "Spear, Light", weapon: "Spear, Light" },
  "barbarian-fighter": { name: "Axe, War", weapon: "Axe, War" },
  "veteran-soldier": { name: "Sword, Long", weapon: "Sword, Long" },
  "skilled-veteran": { name: "Mace", weapon: "Mace" },
  "elites-or-special-guards": { name: "Halberd", weapon: "Halberd" },
  "knight-or-minor-hero": { name: "Sword, Long", weapon: "Sword, Long" },
  "warrior-baron": { name: "Sword, Long", weapon: "Sword, Long" },
  "barbarian-warlord": { name: "Axe, War", weapon: "Axe, War" },
  "mighty-general": { name: "Sword, Long", weapon: "Sword, Long" },
  "major-hero": { name: "Sword, Great", weapon: "Sword, Great" },
  "great-warrior-king": { name: "Hammer, Great", weapon: "Hammer, Great" },
  "petty-mage": { name: "Dagger", weapon: "Dagger" },
  "tribal-shaman": { name: "Staff", weapon: "Staff" },
  "skilled-sorcerer": { name: "Dagger", weapon: "Dagger" },
  "master-wizard": { name: "Dagger", weapon: "Dagger" },
  "famous-arch-mage": { name: "Dagger", weapon: "Dagger" },
  "automaton-warbot": { name: "Warbot Crusher" },
  "predator-hellbeast": { name: "Hellfire Claws" },
});

type CuratedMagicLoadout = Omit<BuiltInBestiarySpellcasting, "level" | "effort">;

const curatedMagicLoadouts: Readonly<Record<string, CuratedMagicLoadout>> = Object.freeze({
  "petty-mage": {
    tradition: "High Magic",
    spells: [
      { name: "The Coruscating Coffin", level: 1, summary: "Single-target arcane damage; Physical save halves it." },
      { name: "The Wind of the Final Repose", level: 1, summary: "Puts living creatures of 4 HD or fewer to sleep in a small area." },
    ],
    arts: [
      { name: "Sense Magic", summary: "Commit Effort to perceive active magic and inspect magical effects." },
      { name: "Counter Magic", summary: "Commit Effort for the day to contest a visible enemy spell." },
    ],
  },
  "tribal-shaman": {
    tradition: "High Magic",
    spells: [
      { name: "Apprehending the Arcane Form", level: 1, summary: "Detects active magic and can identify magical items." },
      { name: "The Coruscating Coffin", level: 1, summary: "Single-target arcane damage; Physical save halves it." },
      { name: "Resounding Temporal Echo", level: 2, summary: "Grants allies a short burst of extra Main Actions." },
    ],
    arts: [
      { name: "Sense Magic", summary: "Commit Effort to perceive active magic and inspect magical effects." },
      { name: "Ward Allies", summary: "Commit Effort for the day to exclude allies from an area spell." },
    ],
  },
  "skilled-sorcerer": {
    tradition: "High Magic",
    spells: [
      { name: "The Coruscating Coffin", level: 1, summary: "Single-target arcane damage; Physical save halves it." },
      { name: "Extirpate Arcana", level: 2, summary: "Dispels or suppresses unwanted magical effects." },
      { name: "The Howl of Light", level: 3, summary: "Area flame, concussion, and sonic damage; Evasion save halves it." },
    ],
    arts: [
      { name: "Counter Magic", summary: "Commit Effort for the day to contest a visible enemy spell." },
      { name: "Hang Sorcery", summary: "Commit Effort to hold a cast spell for release as an On Turn action." },
    ],
  },
  "master-wizard": {
    tradition: "High Magic",
    spells: [
      { name: "Extirpate Arcana", level: 2, summary: "Dispels or suppresses unwanted magical effects." },
      { name: "The Grinding Geas", level: 4, summary: "Binds a target to a specific command or inflicts a wasting curse." },
      { name: "The Dazzling Prismatic Hemicycle", level: 5, summary: "A broad cone with a dangerous spectrum of effects." },
    ],
    arts: [
      { name: "Inexorable Effect", summary: "Commit Effort for the day to force a successful enemy save to be rerolled." },
      { name: "Swift Casting", summary: "Once per scene, Commit Effort to cast a Main Action spell as On Turn." },
    ],
  },
  "famous-arch-mage": {
    tradition: "High Magic",
    spells: [
      { name: "Banishment to the Black Glass Labyrinth", level: 5, summary: "Banishes creatures in a small area to an extradimensional maze." },
      { name: "Deluge of Hell", level: 5, summary: "Devastating outdoor area attack; Physical save halves the damage." },
      { name: "Invocation of the Invincible Citadel", level: 5, summary: "Creates a temporary, nearly impenetrable protective shelter." },
    ],
    arts: [
      { name: "Retain Sorcery", summary: "Commit Effort for the day to preserve a cast spell slot once per day." },
      { name: "Ward Allies", summary: "Commit Effort for the day to exclude allies from an area spell." },
    ],
  },
});

type CanonicalSpell = { readonly name: string; readonly level: number; readonly summary: string };

/**
 * The preview statblocks use a few shortened spell names and terse summaries.
 * These are the corresponding canonical SRD entries already imported by the
 * character creator, kept here as a small catalogue so Bestiary copies use
 * one name, one level, and one useful GM-facing summary.
 */
const canonicalSpells: Readonly<Record<string, CanonicalSpell>> = Object.freeze({
  "apprehending the arcane form": { name: "Apprehending the Arcane Form", level: 1, summary: "Detects active magic and can identify magical items." },
  "banishment to the black glass labyrinth": { name: "Banishment to the Black Glass Labyrinth", level: 5, summary: "Banishes creatures in a small area to an extradimensional maze." },
  "decree of lithic dissolution": { name: "Decree of Lithic Dissolution", level: 2, summary: "Destroys a large amount of ordinary earth or stone." },
  "deluge of hell": { name: "Deluge of Hell", level: 5, summary: "Devastating outdoor area attack; Physical save halves the damage." },
  "excellent transpicuous transformation": { name: "The Excellent Transpicuous Transformation", level: 1, summary: "Makes willing creatures invisible until one of them acts violently." },
  "extirpate arcana": { name: "Extirpate Arcana", level: 2, summary: "Dispels or suppresses unwanted magical effects." },
  "foresightful apprehension": { name: "Foresightful Apprehension", level: 3, summary: "Reveals the most likely immediate result of a planned action." },
  "howl of light": { name: "The Howl of Light", level: 3, summary: "Area flame, concussion, and sonic damage; Evasion save halves it." },
  "ineluctable shackles of volition": { name: "Ineluctable Shackles of Volition", level: 1, summary: "Enthralls a creature and makes it obey your physical commands." },
  "inexorable imputation": { name: "The Inexorable Imputation", level: 2, summary: "Makes listeners believe one plausible statement for a limited time." },
  "invocation of the invincible citadel": { name: "Invocation of the Invincible Citadel", level: 5, summary: "Creates a temporary, nearly impenetrable protective shelter." },
  "resounding temporal echo": { name: "Resounding Temporal Echo", level: 2, summary: "Gives allies an extra Main Action for several rounds." },
  "coruscating coffin": { name: "The Coruscating Coffin", level: 1, summary: "Single-target arcane damage; Physical save halves it." },
  "dazzling prismatic hemicycle": { name: "The Dazzling Prismatic Hemicycle", level: 5, summary: "A broad cone with a dangerous spectrum of effects." },
  "grinding geas": { name: "The Grinding Geas", level: 4, summary: "Binds a target to a specific command or inflicts a wasting curse." },
  "torment of tumefaction": { name: "The Torment of Tumefaction", level: 3, summary: "Curses a creature so strenuous actions cause it damage." },
  "wind of the final repose": { name: "The Wind of the Final Repose", level: 1, summary: "Puts a group of weaker living creatures to sleep." },
});

const canonicalSpellAliases: Readonly<Record<string, string>> = Object.freeze({
  "torment tumefacation": "torment of tumefaction",
});

const canonicalArtSummaries: Readonly<Record<string, string>> = Object.freeze({
  "counter magic": "Instant; Commit Effort for the day to contest a visible enemy spell with an opposed Intelligence/Magic or Charisma/Magic check.",
  "inexorable effort": "Once per scene, force a target spell saving throw to be rerolled.",
  "sense magic": "Commit Effort as an Instant action to perceive magical energy and inspect magical effects.",
  "swift casting": "Once per scene, Commit Effort for the day to cast a Main Action spell as an On Turn action.",
  "ward allies": "Commit Effort for the day as an Instant action to omit up to six allies from an area-effect spell.",
});

function magicNameKey(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/^the\s+/u, "").replace(/\s+/gu, " ");
}

function canonicalSpellReference(reference: BuiltInBestiaryMagicReference): BuiltInBestiaryMagicReference {
  const baseKey = magicNameKey(reference.name);
  const canonical = canonicalSpells[canonicalSpellAliases[baseKey] ?? baseKey];
  return canonical ? Object.freeze({ ...canonical }) : Object.freeze({ ...reference });
}

function canonicalArtReference(reference: BuiltInBestiaryMagicReference): BuiltInBestiaryMagicReference {
  const summary = canonicalArtSummaries[magicNameKey(reference.name)];
  return Object.freeze({ ...reference, ...(summary ? { summary } : {}) });
}

function weaponDamageWithSourceBonus(damage: string, sourceDamage: string): string {
  const match = /^Weapon(?: \+(\d+))?$/u.exec(sourceDamage);
  if (!match) return sourceDamage;
  const bonus = Number(match[1] ?? 0);
  return bonus ? `${damage}+${bonus}` : damage;
}

function weaponShockWithSourceBonus(shock: string, sourceDamage: string, sourceShock: string): string | undefined {
  if (!shock) return undefined;
  const match = /^(\d+)\/AC (\d+)$/u.exec(shock);
  if (!match) throw new Error(`Expected a rollable SRD weapon Shock value, received ${shock}.`);
  const sourceMatch = /^Weapon(?: \+(\d+))?$/u.exec(sourceDamage);
  if (!sourceMatch) {
    const sourceShockMatch = /^(\d+)\/(\d+|-)$/u.exec(sourceShock);
    if (!sourceShockMatch) throw new Error(`Expected a concrete source Shock value, received ${sourceShock}.`);
    return `${sourceShockMatch[1]}/${sourceShockMatch[2] === "-" ? "-" : `AC ${sourceShockMatch[2]}`}`;
  }
  const amount = Number(match[1]) + Number(sourceMatch[1] ?? 0);
  const target = sourceShock.endsWith("/-") ? "-" : `AC ${match[2]}`;
  return `${amount}/${target}`;
}

function curatedAttack(creature: CreatureDefinition, sourceAttack: CampaignNpcAttack): CampaignNpcAttack {
  const selection = curatedPhysicalAttacks[creature.id];
  if (!selection) throw new Error(`Missing curated physical attack for ${creature.id}.`);
  if (!selection.weapon) {
    return { ...sourceAttack, name: selection.name, ...(creatureContext[creature.id].sourceStats.shock !== "None" ? { shock: creatureContext[creature.id].sourceStats.shock } : {}) };
  }
  const weapon = npcWeaponStarters.find(candidate => candidate.name === selection.weapon);
  if (!weapon) throw new Error(`Missing SRD weapon ${selection.weapon}.`);
  const sourceStats = creatureContext[creature.id].sourceStats;
  const shock = weaponShockWithSourceBonus(weapon.shock, sourceAttack.damage, sourceStats.shock);
  return {
    name: selection.name,
    attackBonus: sourceAttack.attackBonus,
    damage: weaponDamageWithSourceBonus(weapon.damage, sourceAttack.damage),
    ...(shock ? { shock } : {}),
    description: weapon.note,
  };
}

function curatedSpellcasting(id: string, spellcasting: CreatureDefinition["spellcasting"]): BuiltInBestiarySpellcasting | undefined {
  if (!spellcasting) return undefined;
  const loadout = curatedMagicLoadouts[id];
  if (!loadout) throw new Error(`Missing curated magic loadout for ${id}.`);
  if (loadout.spells.some(spell => (spell.level ?? 0) > spellcasting.level)) throw new Error(`Curated spell exceeds ${id}'s mage level.`);
  return Object.freeze({
    ...spellcasting,
    tradition: loadout.tradition,
    spells: Object.freeze(loadout.spells.map(spell => Object.freeze({ ...spell }))),
    arts: Object.freeze(loadout.arts.map(art => Object.freeze({ ...art }))),
  });
}

function spellcastingNote(spellcasting: BuiltInBestiarySpellcasting): string {
  const spells = spellcasting.spells.map(spell => `${spell.name} (L${spell.level}) — ${spell.summary}`).join("; ");
  const arts = spellcasting.arts.map(art => `${art.name} — ${art.summary}`).join("; ");
  return `TWE representative ${spellcasting.tradition} loadout — Mage level ${spellcasting.level}; Effort ${spellcasting.effort}. Spells: ${spells}. Arts: ${arts}.`;
}

function defineCreature(creature: CreatureDefinition): BuiltInBestiaryCreature {
  const context = creatureContext[creature.id];
  const { attacks: definitionAttacks, spellcasting: definitionSpellcasting, ...definition } = creature;
  const sourceAttacks = Object.freeze(definitionAttacks.map(attack => Object.freeze({ ...attack })));
  const spellcasting = curatedSpellcasting(creature.id, definitionSpellcasting);
  return Object.freeze({
    ...definition,
    description: context.description,
    source: worldsWithoutNumberSrdSource,
    sourceStats: Object.freeze({ ...context.sourceStats }),
    ...(spellcasting ? { spellcasting, notes: spellcastingNote(spellcasting) } : {}),
    sourceAttacks,
    attacks: Object.freeze(sourceAttacks.map(attack => Object.freeze(curatedAttack(creature, attack)))),
  });
}

function attack(attackBonus: number, damage: string, description = ""): CampaignNpcAttack {
  return { name: "Attack", attackBonus, damage, description };
}

/**
 * Before structured encounter combat data was introduced, Built-In Bestiary
 * encounter copies carried this complete, generated stat line in notes. It is
 * a versioned TWE signature, not a general-purpose note parser.
 */
function legacyGeneratedBestiaryNotes(creature: BuiltInBestiaryCreature): string {
  const { hitDice, shock, move, morale, instinct, skill } = creature.sourceStats;
  const base = `CC0 WWN SRD stat line: ${hitDice} HD (default HP ${creature.hpMax}, rounded-up average of ${hitDice}d8); Shock ${shock}; Move ${move}; Morale ${morale}; Instinct ${instinct}; Skill +${skill}.`;
  if (creature.armorAnnotation) return `${base} The SRD's ${creature.armorClass}a AC is the creature's usual armor.`;
  if (creature.spellcasting) return `${base} Use the spellcasting and Arts of an appropriate mage tradition at level ${creature.spellcasting.level}, with Effort ${creature.spellcasting.effort}. No specific tradition, spells, or Arts are assigned by this stat line.`;
  return base;
}

function legacyGeneratedBestiaryAttacks(creature: BuiltInBestiaryCreature): CampaignNpcAttack[] {
  const descriptions: Record<number, string> = {
    2: "Two attacks per Main Action.",
    3: "Three attacks per Main Action.",
    4: "Four attacks per Main Action.",
  };
  const description = descriptions[creature.sourceStats.attacksPerMainAction] ?? "";
  return creature.sourceAttacks.map(attack => ({ ...attack, description }));
}

function exactLegacySourceStats(value: unknown, creature: BuiltInBestiaryCreature): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = ["hitDice", "shock", "move", "morale", "instinct", "skill"];
  return Object.keys(candidate).length === keys.length
    && keys.every(key => key in candidate)
    && candidate.hitDice === creature.sourceStats.hitDice
    && candidate.shock === creature.sourceStats.shock
    && candidate.move === creature.sourceStats.move
    && candidate.morale === creature.sourceStats.morale
    && candidate.instinct === creature.sourceStats.instinct
    && candidate.skill === creature.sourceStats.skill;
}

function exactLegacyCombatSnapshot(stats: CampaignNpcCombatStats, creature: BuiltInBestiaryCreature, legacyNotes: string): boolean {
  return !stats.threatStats
    && stats.notes === legacyNotes
    && exactLegacySourceStats(stats.sourceStats, creature);
}

function matchesBestiarySourceStats(value: unknown, creature: BuiltInBestiaryCreature): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.hitDice === creature.sourceStats.hitDice
    && candidate.shock === creature.sourceStats.shock
    && candidate.move === creature.sourceStats.move
    && candidate.morale === creature.sourceStats.morale
    && candidate.instinct === creature.sourceStats.instinct
    && candidate.skill === creature.sourceStats.skill;
}

const creatureContext: Record<string, { description: string; sourceStats: BuiltInBestiarySourceStats }> = {
  "small-pack-predator": { description: "A small, fast pack hunter that overwhelms isolated prey with numbers.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "1/13", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "large-solitary-predator": { description: "A powerful lone hunter suited to dangerous wilderness territory.", sourceStats: { hitDice: 5, attacksPerMainAction: 1, shock: "2/13", move: "30'", morale: 8, instinct: 6, skill: 1 } },
  "apex-predator": { description: "A huge and exceptionally dangerous hunting beast, suitable for dire predators and other apex carnivores.", sourceStats: { hitDice: 6, attacksPerMainAction: 2, shock: "2/13", move: "40'", morale: 8, instinct: 6, skill: 2 } },
  "herd-beast": { description: "A common grazing animal that can become dangerous when startled or defending its young.", sourceStats: { hitDice: 2, attacksPerMainAction: 1, shock: "None", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "vicious-large-herbivore": { description: "A large territorial herbivore with enough mass and aggression to threaten a party.", sourceStats: { hitDice: 4, attacksPerMainAction: 1, shock: "1/13", move: "40'", morale: 9, instinct: 6, skill: 1 } },
  "elephantine-grazer": { description: "An enormous grazer whose bulk and crushing attacks make it a formidable obstacle.", sourceStats: { hitDice: 6, attacksPerMainAction: 1, shock: "None", move: "40'", morale: 7, instinct: 6, skill: 1 } },
  "automaton-humanlike": { description: "A human-shaped artificial servant or guardian carrying an ordinary weapon.", sourceStats: { hitDice: 2, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "automaton-laborer": { description: "A durable industrial construct designed for repetitive physical work.", sourceStats: { hitDice: 2, attacksPerMainAction: 1, shock: "1/13", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "automaton-military": { description: "A reinforced combat automaton built for disciplined military service.", sourceStats: { hitDice: 4, attacksPerMainAction: 1, shock: "4/15", move: "30'", morale: 12, instinct: 3, skill: 1 } },
  "slime-or-ooze": { description: "A mindless amorphous predator that attacks with engulfing pseudopods.", sourceStats: { hitDice: 6, attacksPerMainAction: 2, shock: "1/-", move: "20'", morale: 12, instinct: 5, skill: 1 } },
  "small-vicious-predator": { description: "A compact, aggressive predator that attacks quickly and without hesitation.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "1/13", move: "30'", morale: 7, instinct: 5, skill: 1 } },
  "large-vicious-predator": { description: "A large and ferocious predator capable of multiple savage attacks.", sourceStats: { hitDice: 6, attacksPerMainAction: 2, shock: "2/15", move: "40'", morale: 9, instinct: 5, skill: 2 } },
  "hulking-predator": { description: "A massive predator with terrifying strength and a thick defensive hide.", sourceStats: { hitDice: 10, attacksPerMainAction: 2, shock: "6/15", move: "30'", morale: 10, instinct: 4, skill: 1 } },
  "unnatural-swarm": { description: "A supernatural swarm that assails foes with a mass of unnatural attackers.", sourceStats: { hitDice: 4, attacksPerMainAction: 3, shock: "1/-", move: "30'", morale: 10, instinct: 5, skill: 1 } },
  "terrible-warbeast": { description: "A monstrous war-trained beast bred or bound for brutal battlefield assaults.", sourceStats: { hitDice: 8, attacksPerMainAction: 2, shock: "7/15", move: "40'", morale: 9, instinct: 4, skill: 2 } },
  "legendary-god-titan": { description: "A legendary colossal being of near-divine power, appropriate only for mythic confrontations.", sourceStats: { hitDice: 20, attacksPerMainAction: 3, shock: "10/-", move: "40'", morale: 10, instinct: 3, skill: 3 } },
  "peaceful-human": { description: "An ordinary civilian or commoner, useful for noncombatant townsfolk, retainers, and vulnerable bystanders.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 7, instinct: 5, skill: 1 } },
  "thug-or-militia": { description: "An ordinary armed combatant for rough bandits, local militia, inexperienced guards, or similar foes.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 8, instinct: 4, skill: 1 } },
  "barbarian-fighter": { description: "A hard-fighting barbarian raider who trades disciplined restraint for a more aggressive weapon attack.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "Weapon +1", move: "30'", morale: 8, instinct: 5, skill: 1 } },
  "veteran-soldier": { description: "A seasoned soldier or mercenary with the same combat training as a barbarian fighter but more disciplined instincts.", sourceStats: { hitDice: 1, attacksPerMainAction: 1, shock: "Weapon +1", move: "30'", morale: 8, instinct: 3, skill: 1 } },
  "skilled-veteran": { description: "A capable professional soldier, veteran guard, or trusted mercenary who can withstand a tougher fight.", sourceStats: { hitDice: 2, attacksPerMainAction: 1, shock: "Weapon +1", move: "30'", morale: 9, instinct: 2, skill: 1 } },
  "elites-or-special-guards": { description: "An elite guard or special-operations warrior equipped and trained to protect an important person or place.", sourceStats: { hitDice: 3, attacksPerMainAction: 1, shock: "Weapon +2", move: "30'", morale: 10, instinct: 2, skill: 2 } },
  "knight-or-minor-hero": { description: "A knight, champion, or minor hero whose armor and personal prowess make them a serious frontline opponent.", sourceStats: { hitDice: 4, attacksPerMainAction: 1, shock: "Weapon +2", move: "30'", morale: 10, instinct: 1, skill: 2 } },
  "warrior-baron": { description: "A formidable warrior noble or battle leader suited to command guards, soldiers, and lesser champions.", sourceStats: { hitDice: 6, attacksPerMainAction: 1, shock: "Weapon +3", move: "30'", morale: 9, instinct: 1, skill: 2 } },
  "barbarian-warlord": { description: "A brutal barbarian warlord who leads raiders with relentless aggression and two punishing weapon attacks.", sourceStats: { hitDice: 8, attacksPerMainAction: 2, shock: "Weapon +4/-", move: "30'", morale: 10, instinct: 3, skill: 2 } },
  "mighty-general": { description: "A mighty general or supreme professional commander, equally at home directing soldiers and fighting beside them.", sourceStats: { hitDice: 8, attacksPerMainAction: 1, shock: "Weapon +4/-", move: "30'", morale: 10, instinct: 1, skill: 3 } },
  "major-hero": { description: "A major hero or renowned champion able to dominate a battle through exceptional martial ability.", sourceStats: { hitDice: 10, attacksPerMainAction: 2, shock: "Weapon +5/-", move: "30'", morale: 10, instinct: 2, skill: 3 } },
  "great-warrior-king": { description: "A great warrior king, legendary ruler, or supreme martial champion intended for climactic confrontations.", sourceStats: { hitDice: 12, attacksPerMainAction: 2, shock: "Weapon +5/-", move: "30'", morale: 10, instinct: 1, skill: 3 } },
  "petty-mage": { description: "A minor mage or hedge wizard with modest spellcasting appropriate to a low-level magical adversary or ally.", sourceStats: { hitDice: 2, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 8, instinct: 4, skill: 1 } },
  "tribal-shaman": { description: "A tribal shaman or ritual leader whose substantial experience supports capable tradition-appropriate magic.", sourceStats: { hitDice: 4, attacksPerMainAction: 1, shock: "Weapon +1", move: "30'", morale: 9, instinct: 4, skill: 1 } },
  "skilled-sorcerer": { description: "A skilled sorcerer or practiced wizard who relies on established magical tradition rather than a fixed spell list.", sourceStats: { hitDice: 5, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 9, instinct: 4, skill: 2 } },
  "master-wizard": { description: "A master wizard with formidable tradition-appropriate spellcasting, suitable for a powerful court or faction mage.", sourceStats: { hitDice: 8, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 9, instinct: 3, skill: 2 } },
  "famous-arch-mage": { description: "A famous arch-mage whose high-level tradition-appropriate magic can shape a major conflict.", sourceStats: { hitDice: 10, attacksPerMainAction: 1, shock: "Weapon", move: "30'", morale: 9, instinct: 2, skill: 3 } },
  "automaton-warbot": { description: "A towering combat automaton or ancient war machine built to endure heavy fire and devastate nearby foes.", sourceStats: { hitDice: 10, attacksPerMainAction: 3, shock: "7/-", move: "40'", morale: 12, instinct: 2, skill: 2 } },
  "predator-hellbeast": { description: "A hellbeast or other supernatural apex predator with extreme speed and a barrage of savage attacks.", sourceStats: { hitDice: 10, attacksPerMainAction: 4, shock: "6/-", move: "60'", morale: 11, instinct: 4, skill: 3 } },
};

const rawBuiltInBestiaryCreatures: readonly BuiltInBestiaryCreature[] = Object.freeze([
  defineCreature({ id: "small-pack-predator", name: "Small Pack Predator", hpMax: 5, armorClass: 12, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(2, "1d4")], notes: "" }),
  defineCreature({ id: "large-solitary-predator", name: "Large Solitary Predator", hpMax: 23, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(6, "1d8")], notes: "" }),
  defineCreature({ id: "apex-predator", name: "Apex Predator", hpMax: 27, armorClass: 13, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(6, "1d8")], notes: "" }),
  defineCreature({ id: "herd-beast", name: "Herd Beast", hpMax: 9, armorClass: 11, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "1d4")], notes: "" }),
  defineCreature({ id: "vicious-large-herbivore", name: "Vicious Large Herbivore", hpMax: 18, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(5, "1d10")], notes: "" }),
  defineCreature({ id: "elephantine-grazer", name: "Elephantine Grazer", hpMax: 27, armorClass: 13, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(5, "2d8")], notes: "" }),
  defineCreature({ id: "automaton-humanlike", name: "Automaton, Humanlike", hpMax: 9, armorClass: 13, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "Weapon")], notes: "" }),
  defineCreature({ id: "automaton-laborer", name: "Automaton, Laborer", hpMax: 9, armorClass: 15, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(2, "1d6")], notes: "" }),
  defineCreature({ id: "automaton-military", name: "Automaton, Military", hpMax: 18, armorClass: 18, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(5, "1d10+2")], notes: "" }),
  defineCreature({ id: "slime-or-ooze", name: "Slime or Ooze", hpMax: 27, armorClass: 10, physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(6, "1d8")], notes: "" }),
  defineCreature({ id: "small-vicious-predator", name: "Predator, Small Vicious", hpMax: 5, armorClass: 14, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(1, "1d4")], notes: "" }),
  defineCreature({ id: "large-vicious-predator", name: "Predator, Large Vicious", hpMax: 27, armorClass: 13, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(7, "2d6")], notes: "" }),
  defineCreature({ id: "hulking-predator", name: "Predator, Hulking", hpMax: 45, armorClass: 15, physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(12, "2d6+3")], notes: "" }),
  defineCreature({ id: "unnatural-swarm", name: "Unnatural Swarm", hpMax: 18, armorClass: 10, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(6, "1d6")], notes: "" }),
  defineCreature({ id: "terrible-warbeast", name: "Terrible Warbeast", hpMax: 36, armorClass: 15, physicalSave: 11, evasionSave: 11, mentalSave: 11, attacks: [attack(10, "2d6+4")], notes: "" }),
  defineCreature({ id: "legendary-god-titan", name: "Legendary God-Titan", hpMax: 90, armorClass: 22, physicalSave: 2, evasionSave: 2, mentalSave: 2, attacks: [attack(20, "2d10+5")], notes: "" }),
  defineCreature({ id: "peaceful-human", name: "Peaceful Human", hpMax: 5, armorClass: 10, physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(0, "Weapon")], notes: "" }),
  defineCreature({ id: "thug-or-militia", name: "Thug or Militia", hpMax: 5, armorClass: 13, armorAnnotation: "a", physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(1, "Weapon")], notes: "" }),
  defineCreature({ id: "barbarian-fighter", name: "Barbarian Fighter", hpMax: 5, armorClass: 13, armorAnnotation: "a", physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(2, "Weapon +1")], notes: "" }),
  defineCreature({ id: "veteran-soldier", name: "Veteran Soldier", hpMax: 5, armorClass: 13, armorAnnotation: "a", physicalSave: 15, evasionSave: 15, mentalSave: 15, attacks: [attack(2, "Weapon +1")], notes: "" }),
  defineCreature({ id: "skilled-veteran", name: "Skilled Veteran", hpMax: 9, armorClass: 15, armorAnnotation: "a", physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(3, "Weapon +1")], notes: "" }),
  defineCreature({ id: "elites-or-special-guards", name: "Elites or Special Guards", hpMax: 14, armorClass: 18, armorAnnotation: "a", physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(4, "Weapon +2")], notes: "" }),
  defineCreature({ id: "knight-or-minor-hero", name: "Knight or Minor Hero", hpMax: 18, armorClass: 18, armorAnnotation: "a", physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(6, "Weapon +2")], notes: "" }),
  defineCreature({ id: "warrior-baron", name: "Warrior Baron", hpMax: 27, armorClass: 18, armorAnnotation: "a", physicalSave: 12, evasionSave: 12, mentalSave: 12, attacks: [attack(8, "Weapon +3")], notes: "" }),
  defineCreature({ id: "barbarian-warlord", name: "Barbarian Warlord", hpMax: 36, armorClass: 16, armorAnnotation: "a", physicalSave: 11, evasionSave: 11, mentalSave: 11, attacks: [attack(10, "Weapon +4")], notes: "" }),
  defineCreature({ id: "mighty-general", name: "Mighty General", hpMax: 36, armorClass: 18, armorAnnotation: "a", physicalSave: 11, evasionSave: 11, mentalSave: 11, attacks: [attack(10, "Weapon +4")], notes: "" }),
  defineCreature({ id: "major-hero", name: "Major Hero", hpMax: 45, armorClass: 18, armorAnnotation: "a", physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(12, "Weapon +5")], notes: "" }),
  defineCreature({ id: "great-warrior-king", name: "Great Warrior King", hpMax: 54, armorClass: 18, armorAnnotation: "a", physicalSave: 9, evasionSave: 9, mentalSave: 9, attacks: [attack(14, "Weapon +5")], notes: "" }),
  defineCreature({ id: "petty-mage", name: "Petty Mage", hpMax: 9, armorClass: 10, physicalSave: 14, evasionSave: 14, mentalSave: 14, attacks: [attack(1, "Weapon")], spellcasting: { level: 2, effort: 3 }, notes: "" }),
  defineCreature({ id: "tribal-shaman", name: "Tribal Shaman", hpMax: 18, armorClass: 10, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(3, "Weapon +1")], spellcasting: { level: 4, effort: 3 }, notes: "" }),
  defineCreature({ id: "skilled-sorcerer", name: "Skilled Sorcerer", hpMax: 23, armorClass: 10, physicalSave: 13, evasionSave: 13, mentalSave: 13, attacks: [attack(1, "Weapon")], spellcasting: { level: 5, effort: 4 }, notes: "" }),
  defineCreature({ id: "master-wizard", name: "Master Wizard", hpMax: 36, armorClass: 13, physicalSave: 11, evasionSave: 11, mentalSave: 11, attacks: [attack(1, "Weapon")], spellcasting: { level: 8, effort: 4 }, notes: "" }),
  defineCreature({ id: "famous-arch-mage", name: "Famous Arch-Mage", hpMax: 45, armorClass: 13, physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(2, "Weapon")], spellcasting: { level: 10, effort: 5 }, notes: "" }),
  defineCreature({ id: "automaton-warbot", name: "Automaton, Warbot", hpMax: 45, armorClass: 20, physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(12, "1d12+5")], notes: "" }),
  defineCreature({ id: "predator-hellbeast", name: "Predator, Hellbeast", hpMax: 45, armorClass: 18, physicalSave: 10, evasionSave: 10, mentalSave: 10, attacks: [attack(12, "1d10+5")], notes: "" }),
  ...thoseOutsideTheWallsPreviewCreatures,
]);

function masterMagicReference(kind: "spells" | "arts", reference: BuiltInBestiaryMagicReference): BuiltInBestiaryMagicReference {
  return kind === "spells" ? canonicalSpellReference(reference) : canonicalArtReference(reference);
}

function chooseMagicMaster(current: BuiltInBestiaryMagicReference | undefined, candidate: BuiltInBestiaryMagicReference): BuiltInBestiaryMagicReference {
  if (!current) return candidate;
  if (candidate.level !== undefined && current.level === undefined) return candidate;
  if (candidate.summary.length > current.summary.length) return candidate;
  return current;
}

function magicMasters(kind: "spells" | "arts"): ReadonlyMap<string, BuiltInBestiaryMagicReference> {
  const masters = new Map<string, BuiltInBestiaryMagicReference>();
  for (const creature of rawBuiltInBestiaryCreatures) {
    for (const reference of creature.spellcasting?.[kind] ?? []) {
      const master = masterMagicReference(kind, reference);
      const key = magicNameKey(master.name);
      masters.set(key, chooseMagicMaster(masters.get(key), master));
    }
  }
  return masters;
}

const bestiarySpellMasters = magicMasters("spells");
const bestiaryArtMasters = magicMasters("arts");

function sourceSpellcastingNote(spellcasting: BuiltInBestiarySpellcasting, abilities: readonly Readonly<BuiltInBestiaryAbility>[] = []): string {
  const spells = spellcasting.spells.map(spell => `${spell.name}${spell.level === undefined ? "" : ` (L${spell.level})`}`).join(", ");
  const arts = spellcasting.arts.map(art => art.name).join(", ");
  const abilitiesNote = abilities.map(ability => `${ability.name}: ${ability.summary}`).join(" ");
  return `Source-statblock ${spellcasting.tradition}: Mage level ${spellcasting.level}; Effort ${spellcasting.effort}${spellcasting.spellsPerDay ? `; ${spellcasting.spellsPerDay} spells/day` : ""}. Spells: ${spells}. Arts: ${arts}.${abilitiesNote ? ` ${abilitiesNote}` : ""}`;
}

function normalizeBestiaryCreature(creature: BuiltInBestiaryCreature): BuiltInBestiaryCreature {
  if (!creature.spellcasting) return creature;
  const spellcasting = Object.freeze({
    ...creature.spellcasting,
    spells: Object.freeze(creature.spellcasting.spells.map(spell => bestiarySpellMasters.get(magicNameKey(masterMagicReference("spells", spell).name)) ?? masterMagicReference("spells", spell))),
    arts: Object.freeze(creature.spellcasting.arts.map(art => bestiaryArtMasters.get(magicNameKey(masterMagicReference("arts", art).name)) ?? masterMagicReference("arts", art))),
  });
  const notes = spellcasting.sourceLoadout ? sourceSpellcastingNote(spellcasting, creature.abilities ?? []) : spellcastingNote(spellcasting);
  return Object.freeze({ ...creature, spellcasting, notes });
}

export const builtInBestiaryCreatures: readonly BuiltInBestiaryCreature[] = Object.freeze(
  rawBuiltInBestiaryCreatures.map(normalizeBestiaryCreature),
);

const alphabeticalBuiltInBestiaryCreatures = Object.freeze(
  [...builtInBestiaryCreatures].sort((left, right) => left.name.localeCompare(right.name)),
);

/** Derive one stable, deduplicated picker catalog from the imported Bestiary. */
export function bestiaryNpcMagicOptions(kind: "spells" | "arts"): readonly BestiaryNpcMagicOption[] {
  const masters = kind === "spells" ? bestiarySpellMasters : bestiaryArtMasters;
  const options = [...masters.values()].map(reference => ({ key: `${kind}:${magicNameKey(reference.name)}`, name: reference.name, ...(reference.level === undefined ? {} : { level: reference.level }), summary: reference.summary }));
  return Object.freeze(options.sort((left, right) => (kind === "spells" ? (left.level ?? 99) - (right.level ?? 99) : 0) || left.name.localeCompare(right.name) || left.summary.localeCompare(right.summary)));
}

function attackOptionKey(attack: CampaignNpcAttack): string {
  return [attack.name.trim().toLocaleLowerCase(), attack.attackBonus, attack.damage.trim().toLocaleLowerCase(), (attack.shock ?? "").trim().toLocaleLowerCase(), attack.description.trim().toLocaleLowerCase()].join("|");
}

/** Derive one stable catalogue of attack snapshots from all Bestiary entries. */
export function bestiaryNpcAttackOptions(): readonly BestiaryNpcAttackOption[] {
  const options = new Map<string, BestiaryNpcAttackOption>();
  for (const creature of builtInBestiaryCreatures) {
    for (const attack of creature.attacks) {
      const key = attackOptionKey(attack);
      if (!options.has(key)) options.set(key, { key: `monster:${key}`, ...attack });
    }
  }
  return Object.freeze([...options.values()].sort((left, right) => left.name.localeCompare(right.name) || left.attackBonus - right.attackBonus || left.damage.localeCompare(right.damage) || left.description.localeCompare(right.description)));
}

export function getBuiltInBestiaryCreature(id: string): BuiltInBestiaryCreature | null {
  return builtInBestiaryCreatures.find(creature => creature.id === id) ?? null;
}

function creatureMatchesSearch(creature: BuiltInBestiaryCreature, normalizedQuery: string): boolean {
  return !normalizedQuery
    || creature.name.toLocaleLowerCase().includes(normalizedQuery)
    || creature.description.toLocaleLowerCase().includes(normalizedQuery);
}

export function searchBestiaryCreatures(
  creatures: readonly BuiltInBestiaryCreature[],
  query: string,
): BuiltInBestiaryCreature[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...creatures]
    .filter(creature => creatureMatchesSearch(creature, normalized))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface BestiaryBrowseFilters {
  readonly query?: string;
  readonly minHitDice?: number | null;
  readonly maxHitDice?: number | null;
  readonly partyLevels?: readonly unknown[];
  readonly threatBand?: WwnThreatBand | null;
  readonly quantity?: number;
}

/** Local, derived Bestiary filtering. It never writes or augments creature definitions. */
export function filterBestiaryCreatures(
  creatures: readonly BuiltInBestiaryCreature[],
  { query = "", minHitDice = null, maxHitDice = null, partyLevels = [], threatBand = null, quantity = 1 }: BestiaryBrowseFilters = {},
): BuiltInBestiaryCreature[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...creatures]
    .filter(creature => creatureMatchesSearch(creature, normalized))
    .filter(creature => minHitDice === null || creature.sourceStats.hitDice >= minHitDice)
    .filter(creature => maxHitDice === null || creature.sourceStats.hitDice <= maxHitDice)
    .filter(creature => !threatBand || calculateWwnThreatEstimate(partyLevels, [{ hitDice: creature.sourceStats.hitDice, attacksPerMainAction: creature.sourceStats.attacksPerMainAction, quantity }])?.band === threatBand)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function searchBuiltInBestiaryCreatures(query: string): BuiltInBestiaryCreature[] {
  const normalized = query.trim().toLocaleLowerCase();
  return alphabeticalBuiltInBestiaryCreatures.filter(creature => creatureMatchesSearch(creature, normalized));
}

export function selectBestiaryCreature(
  creatures: readonly BuiltInBestiaryCreature[],
  selectedId: string | null,
): BuiltInBestiaryCreature | null {
  return creatures.find(creature => creature.id === selectedId) ?? creatures[0] ?? null;
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
    spells: creature.spellcasting?.spells.map(spell => ({ ...spell })) ?? [],
    arts: creature.spellcasting?.arts.map(art => ({ ...art })) ?? [],
    inventory: [],
    friendly: false,
    notes: creature.notes,
  };
}

export function builtInBestiaryEncounterSeed(id: string): { name: string; initiative: number; hpCurrent: number; hpMax: number; armorClass: number; notes: string; friendly: boolean; combatStats: CampaignNpcCombatStats } | null {
  const creature = getBuiltInBestiaryCreature(id);
  if (!creature) return null;
  const abilities = creature.abilities?.map(ability => ({ ...ability }));
  return {
    name: creature.name,
    initiative: 0,
    hpCurrent: creature.hpMax,
    hpMax: creature.hpMax,
    armorClass: creature.armorClass,
    notes: creature.notes,
    friendly: false,
    combatStats: { saves: { physical: creature.physicalSave, evasion: creature.evasionSave, mental: creature.mentalSave }, attacks: creature.attacks.map(attack => ({ ...attack })), spells: creature.spellcasting?.spells.map(spell => ({ ...spell })) ?? [], arts: creature.spellcasting?.arts.map(art => ({ ...art })) ?? [], ...(abilities?.length ? { abilities } : {}), notes: creature.notes, sourceStats: { ...creature.sourceStats } },
  };
}

/**
 * Backfill structured abilities for modern Bestiary encounter snapshots that
 * were created before abilities were carried separately from copied notes.
 * The exact source signature prevents custom NPCs with the same name from
 * being changed, while encounter-local values remain untouched.
 */
export function restoreBestiaryEncounterAbilities(npc: CampaignEncounterNpc): CampaignEncounterNpc | null {
  const creature = builtInBestiaryCreatures.find(candidate => candidate.name === npc.name);
  const stats = npc.combatStats;
  if (!creature?.abilities?.length || !stats || stats.abilities?.length || npc.notes !== creature.notes || stats.notes !== creature.notes || !matchesBestiarySourceStats(stats.sourceStats, creature)) return null;
  return {
    ...npc,
    combatStats: { ...stats, abilities: creature.abilities.map(ability => ({ ...ability })) },
  };
}

/**
 * Repair only an exact historical TWE Bestiary encounter signature. The
 * legacy form predates sourceStats.attacksPerMainAction (or all combatStats),
 * so the catalog is consulted only after the stored snapshot proves its
 * source. Encounter-local HP, AC, and any existing combat values stay intact.
 */
export function repairLegacyBestiaryEncounterNpc(npc: CampaignEncounterNpc): CampaignEncounterNpc | null {
  const creature = builtInBestiaryCreatures.find(candidate => candidate.name === npc.name);
  if (!creature) return null;
  const legacyNotes = legacyGeneratedBestiaryNotes(creature);
  if (npc.notes !== legacyNotes) return null;

  if (!npc.combatStats) {
    if (npc.hpMax !== creature.hpMax || npc.armorClass !== creature.armorClass) return null;
    return {
      ...npc,
      notes: creature.notes,
      combatStats: {
        saves: { physical: creature.physicalSave, evasion: creature.evasionSave, mental: creature.mentalSave },
        attacks: legacyGeneratedBestiaryAttacks(creature),
        spells: creature.spellcasting?.spells.map(spell => ({ ...spell })) ?? [],
        arts: creature.spellcasting?.arts.map(art => ({ ...art })) ?? [],
        notes: creature.notes,
        sourceStats: { ...creature.sourceStats },
      },
    };
  }

  if (!exactLegacyCombatSnapshot(npc.combatStats, creature, legacyNotes)) return null;
  return {
    ...npc,
    notes: creature.notes,
    combatStats: {
      ...npc.combatStats,
      notes: creature.notes,
      sourceStats: { ...creature.sourceStats },
    },
  };
}
