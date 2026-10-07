import assert from "node:assert/strict";
import test from "node:test";
import { searchRules } from "../app/rules-search.ts";

const benchmark = [
  {
    "category": "combat",
    "question": "Can I shoot somebody if an enemy is standing right beside me?",
    "expectedTitle": "Ranged Attacks in Melee"
  },
  {
    "category": "combat",
    "question": "Can I reload a bow or crossbow and still attack on the same turn?",
    "expectedTitle": "Reloading Weapons"
  },
  {
    "category": "combat",
    "question": "Does going prone make me harder to hit with a ranged attack?",
    "expectedTitle": "Prone in Combat"
  },
  {
    "category": "combat",
    "question": "Does carrying a shield stop Shock damage?",
    "expectedTitle": "Shock Damage"
  },
  {
    "category": "magic",
    "question": "How many spells can a mage prepare and cast?",
    "expectedTitle": "Preparing & Casting Spells"
  },
  {
    "category": "character",
    "question": "How are my six attributes generated?",
    "expectedTitle": "Generating Attributes"
  },
  {
    "category": "character",
    "question": "What bonus do I get from an attribute score?",
    "expectedTitle": "Attribute Modifiers"
  },
  {
    "category": "character",
    "question": "What do skill levels 0, 1, and 2 mean?",
    "expectedTitle": "Skill Levels"
  },
  {
    "category": "character",
    "question": "Can I start character creation with a skill above level 1?",
    "expectedTitle": "Gaining Skills in Character Creation"
  },
  {
    "category": "character",
    "question": "What does Any Combat on my background let me choose?",
    "expectedTitle": "Background Skills"
  },
  {
    "category": "character",
    "question": "Can I be two partial classes instead of one full class?",
    "expectedTitle": "The Adventurer Class"
  },
  {
    "category": "character",
    "question": "How does the Adventurer combine two partial classes?",
    "expectedTitle": "The Adventurer Class"
  },
  {
    "category": "character",
    "question": "What is the difference between a full class and a partial class?",
    "expectedTitle": "Full and Partial Classes"
  },
  {
    "category": "character",
    "question": "How much Effort does a partial class get?",
    "expectedTitle": "Classes and Effort"
  },
  {
    "category": "character",
    "question": "When does Effort committed for the scene come back?",
    "expectedTitle": "Committing Effort"
  },
  {
    "category": "character",
    "question": "How do I determine my starting maximum HP?",
    "expectedTitle": "Record Maximum Hit Points"
  },
  {
    "category": "character",
    "question": "How do I calculate my class attack bonus at character creation?",
    "expectedTitle": "Record Attack Bonus"
  },
  {
    "category": "character",
    "question": "How do I work out my starting saving throws?",
    "expectedTitle": "Record Saving Throws"
  },
  {
    "category": "time",
    "question": "What exactly counts as a scene?",
    "expectedTitle": "Scenes"
  },
  {
    "category": "time",
    "question": "How long is a combat round?",
    "expectedTitle": "Rounds"
  },
  {
    "category": "time",
    "question": "How long is a dungeon turn?",
    "expectedTitle": "Turns"
  },
  {
    "category": "exploration",
    "question": "How fast can a ship travel by sea?",
    "expectedTitle": "Sea Travel"
  },
  {
    "category": "exploration",
    "question": "What happens when the party explores a new hex?",
    "expectedTitle": "Exploring a Hex"
  },
  {
    "category": "exploration",
    "question": "How many supplies do we need for an expedition?",
    "expectedTitle": "Supplies for an Expedition"
  },
  {
    "category": "exploration",
    "question": "How do pack animals and porters carry expedition gear?",
    "expectedTitle": "Pack Animals and Porters"
  },
  {
    "category": "exploration",
    "question": "What happens if the party has no food water or warmth?",
    "expectedTitle": "Starving, Thirsting, and Freezing"
  },
  {
    "category": "exploration",
    "question": "How do I forage for food in the wilderness?",
    "expectedTitle": "Foraging"
  },
  {
    "category": "exploration",
    "question": "When do wandering encounters happen in wilderness travel?",
    "expectedTitle": "Wandering Encounters"
  },
  {
    "category": "dungeon",
    "question": "What order do we follow while exploring a dungeon?",
    "expectedTitle": "The Order of Play"
  },
  {
    "category": "dungeon",
    "question": "How should the GM track time in a dungeon?",
    "expectedTitle": "Timekeeping in the Dungeon"
  },
  {
    "category": "dungeon",
    "question": "How does fleeing work during dungeon exploration?",
    "expectedTitle": "Movement and Fleeing"
  },
  {
    "category": "dungeon",
    "question": "How are surprise and encounters handled in a dungeon?",
    "expectedTitle": "Encounters and Surprise"
  },
  {
    "category": "combat",
    "question": "What are the steps in a normal combat?",
    "expectedTitle": "The Combat Sequence"
  },
  {
    "category": "combat",
    "question": "Who acts first when combat starts?",
    "expectedTitle": "Initiative"
  },
  {
    "category": "combat",
    "question": "How does individual initiative work instead of side initiative?",
    "expectedTitle": "Individual Initiative"
  },
  {
    "category": "combat",
    "question": "What happens when one side is surprised?",
    "expectedTitle": "Surprise"
  },
  {
    "category": "combat",
    "question": "What kinds of actions can I take on my turn?",
    "expectedTitle": "Actions in Combat"
  },
  {
    "category": "combat",
    "question": "Can I move after I attack?",
    "expectedTitle": "Combat Action Types"
  },
  {
    "category": "combat",
    "question": "How is a normal attack roll resolved?",
    "expectedTitle": "Combat Attack Rolls"
  },
  {
    "category": "combat",
    "question": "How do NPC attack rolls work?",
    "expectedTitle": "NPC Attack Rolls"
  },
  {
    "category": "combat",
    "question": "What modifiers can change an attack roll?",
    "expectedTitle": "Attack Roll Modifiers"
  },
  {
    "category": "combat",
    "question": "How are damage and Shock handled after an attack?",
    "expectedTitle": "Damage and Shock"
  },
  {
    "category": "combat",
    "question": "Can I knock somebody out instead of killing them?",
    "expectedTitle": "Non-Lethal Damage"
  },
  {
    "category": "combat",
    "question": "How much damage does an ordinary punch do?",
    "expectedTitle": "Punch Weapon Damage"
  },
  {
    "category": "combat",
    "question": "How do traumatic hits work?",
    "expectedTitle": "Trauma"
  },
  {
    "category": "combat",
    "question": "Do melee weapons deal damage even when they miss?",
    "expectedTitle": "Shock Damage"
  },
  {
    "category": "combat",
    "question": "What special combat maneuvers can I attempt?",
    "expectedTitle": "Special Combat Maneuvers"
  },
  {
    "category": "combat",
    "question": "How do I shove or grapple somebody?",
    "expectedTitle": "Shoving and Grappling"
  },
  {
    "category": "combat",
    "question": "What happens if I fight with a weapon in each hand?",
    "expectedTitle": "Dual-Wielding Weapons"
  },
  {
    "category": "combat",
    "question": "How do execution attacks work against an unaware target?",
    "expectedTitle": "Execution Attacks"
  },
  {
    "category": "combat",
    "question": "How do I leave melee without giving the enemy a free attack?",
    "expectedTitle": "Fighting Withdrawal"
  },
  {
    "category": "injury",
    "question": "What happens when a PC reaches zero hit points?",
    "expectedTitle": "Dropping to 0 Hit Points"
  },
  {
    "category": "injury",
    "question": "How do I stabilize somebody who is dying?",
    "expectedTitle": "Stabilizing a Mortally Wounded Character"
  },
  {
    "category": "injury",
    "question": "Do ordinary unnamed NPCs get mortal injury rules at zero HP?",
    "expectedTitle": "NPCs and Mortal Injury"
  },
  {
    "category": "injury",
    "question": "Can overwhelming catastrophic damage kill instantly?",
    "expectedTitle": "Catastrophic Damage"
  },
  {
    "category": "injury",
    "question": "What happens when non-lethal damage takes someone to zero?",
    "expectedTitle": "Non-Lethal Incapacitation"
  },
  {
    "category": "injury",
    "question": "How much System Strain can a character have?",
    "expectedTitle": "System Strain"
  },
  {
    "category": "injury",
    "question": "How much HP comes back after a good night's sleep?",
    "expectedTitle": "Natural Healing"
  },
  {
    "category": "injury",
    "question": "How much does first aid heal and how long does it take?",
    "expectedTitle": "First Aid"
  },
  {
    "category": "injury",
    "question": "How do poison and disease saves work?",
    "expectedTitle": "Poisons"
  },
  {
    "category": "chase",
    "question": "How does a foot chase work?",
    "expectedTitle": "Foot Chases"
  },
  {
    "category": "chase",
    "question": "How does a mounted chase work?",
    "expectedTitle": "Mounted Chases"
  },
  {
    "category": "advancement",
    "question": "What do I gain when my character advances a level?",
    "expectedTitle": "Advancement Benefits"
  },
  {
    "category": "advancement",
    "question": "How do my maximum hit points improve when I level?",
    "expectedTitle": "Additional Hit Points"
  },
  {
    "category": "advancement",
    "question": "How do saving throws improve with advancement?",
    "expectedTitle": "Improved Saving Throw"
  },
  {
    "category": "advancement",
    "question": "When does my attack bonus improve?",
    "expectedTitle": "Improved Attack Bonus"
  },
  {
    "category": "advancement",
    "question": "How do I gain and spend skill points?",
    "expectedTitle": "Gaining and Spending Skill Points"
  },
  {
    "category": "advancement",
    "question": "Can I improve my attributes when I level?",
    "expectedTitle": "Improving Attributes"
  },
  {
    "category": "advancement",
    "question": "When do I get to choose another Focus?",
    "expectedTitle": "Choosing a new Foci"
  },
  {
    "category": "gear",
    "question": "How do I craft ordinary gear?",
    "expectedTitle": "Crafting Gear"
  },
  {
    "category": "gear",
    "question": "How do I add a modification to equipment?",
    "expectedTitle": "Modifying Gear"
  },
  {
    "category": "gear",
    "question": "What maintenance do equipment mods require?",
    "expectedTitle": "Maintaining Mods"
  },
  {
    "category": "gear",
    "question": "How do bundled encumbrance items work?",
    "expectedTitle": "Bundled Gear"
  },
  {
    "category": "gear",
    "question": "What counts as one unit of bulk weight?",
    "expectedTitle": "Bulk Weights"
  },
  {
    "category": "gear",
    "question": "How do gear bundles work when buying starting equipment?",
    "expectedTitle": "Gear Bundles"
  },
  {
    "category": "gear",
    "question": "What do hirelings and ordinary living expenses cost?",
    "expectedTitle": "Services and Living Expenses"
  },
  {
    "category": "gear",
    "question": "What is the difference between light medium and heavy armor?",
    "expectedTitle": "Light, Medium, and Heavy Armor"
  },
  {
    "category": "gear",
    "question": "What benefit does carrying a shield provide?",
    "expectedTitle": "Shields"
  },
  {
    "category": "gear",
    "question": "What do the different weapon traits mean?",
    "expectedTitle": "Weapon Traits"
  },
  {
    "category": "magic",
    "question": "How does a mage learn a new spell?",
    "expectedTitle": "Learning a Spell"
  },
  {
    "category": "magic",
    "question": "How do I prepare a spell for the day?",
    "expectedTitle": "Preparing a Spell"
  },
  {
    "category": "magic",
    "question": "Can I cast the same prepared spell more than once?",
    "expectedTitle": "Casting Prepared Spells"
  },
  {
    "category": "magic",
    "question": "Do I need to see a creature to target it with a spell?",
    "expectedTitle": "Creatures, Targets, and Visibility"
  },
  {
    "category": "magic",
    "question": "Can a mage cast while wearing armor or carrying a shield?",
    "expectedTitle": "Spellcasting and Armor"
  },
  {
    "category": "magic",
    "question": "How do I begin developing a brand new spell?",
    "expectedTitle": "Preparing To Develop a Spell"
  },
  {
    "category": "magic",
    "question": "What roll is used to finish developing a new spell?",
    "expectedTitle": "The Development Skill Check"
  },
  {
    "category": "gm",
    "question": "When should a monster make an Instinct check?",
    "expectedTitle": "When to Make an Instinct Check"
  },
  {
    "category": "gm",
    "question": "How is an Instinct check rolled?",
    "expectedTitle": "Making an Instinct Check"
  },
  {
    "category": "gm",
    "question": "How do I decide an NPC's Instinct score?",
    "expectedTitle": "Assigning Instinct Scores"
  },
  {
    "category": "gm",
    "question": "When should enemies make a morale check?",
    "expectedTitle": "Making a Morale Check"
  },
  {
    "category": "gm",
    "question": "What happens when NPCs flee after failing morale?",
    "expectedTitle": "Fleeing and Escape"
  },
  {
    "category": "gm",
    "question": "How do I roll a monster's reaction to the party?",
    "expectedTitle": "Making a Reaction Roll"
  },
  {
    "category": "gm",
    "question": "What do peaceful reaction roll results mean?",
    "expectedTitle": "Peaceful Encounter Reactions"
  },
  {
    "category": "faction",
    "question": "How does a faction turn work?",
    "expectedTitle": "The Faction Turn"
  },
  {
    "category": "faction",
    "question": "What statistics does a faction have?",
    "expectedTitle": "Faction Statistics"
  },
  {
    "category": "faction",
    "question": "What can a faction do on its turn?",
    "expectedTitle": "Faction Turn Actions"
  },
  {
    "category": "project",
    "question": "How do major projects work?",
    "expectedTitle": "Major Projects"
  },
  {
    "category": "project",
    "question": "How is a project's scope determined?",
    "expectedTitle": "Determining the Project Scope"
  },
  {
    "category": "project",
    "question": "How do I set the difficulty of a major project?",
    "expectedTitle": "Determining the Project Difficulty"
  }
];

test("Rules Search Phase 4 broad benchmark meets Top-1 and Top-3 accuracy targets", async () => {
  const missesTop1 = [];
  const missesTop3 = [];

  for (const entry of benchmark) {
    const results = await searchRules(entry.question, 5);
    const titles = results.map(result => result.title);
    if (titles[0] !== entry.expectedTitle) {
      missesTop1.push(`${entry.category}: "${entry.question}" -> ${titles[0] ?? "no result"} (expected ${entry.expectedTitle})`);
    }
    if (!titles.slice(0, 3).includes(entry.expectedTitle)) {
      missesTop3.push(`${entry.category}: "${entry.question}" -> [${titles.slice(0, 3).join(" | ")}] (expected ${entry.expectedTitle})`);
    }
  }

  const top1 = (benchmark.length - missesTop1.length) / benchmark.length;
  const top3 = (benchmark.length - missesTop3.length) / benchmark.length;
  const report = [
    `Top-1: ${(top1 * 100).toFixed(1)}% (${benchmark.length - missesTop1.length}/${benchmark.length})`,
    `Top-3: ${(top3 * 100).toFixed(1)}% (${benchmark.length - missesTop3.length}/${benchmark.length})`,
    missesTop1.length ? `Top-1 misses:\n- ${missesTop1.join("\n- ")}` : "Top-1 misses: none",
    missesTop3.length ? `Top-3 misses:\n- ${missesTop3.join("\n- ")}` : "Top-3 misses: none",
  ].join("\n");

  console.info(report);
  assert.ok(top1 >= 0.90 && top3 >= 0.98, report);
});

test("benchmark covers the major WWN rules domains instead of clustering around combat", () => {
  const categories = new Set(benchmark.map(entry => entry.category));
  for (const category of ["character", "exploration", "dungeon", "combat", "injury", "advancement", "gear", "magic", "gm", "faction", "project"]) {
    assert.ok(categories.has(category), category);
  }
  assert.ok(benchmark.length >= 90);
});
