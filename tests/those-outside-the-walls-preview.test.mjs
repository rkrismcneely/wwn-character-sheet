import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInBestiaryCreatureDraft,
  builtInBestiaryCreatures,
  builtInBestiaryEncounterSeed,
  searchBuiltInBestiaryCreatures,
} from "../lib/campaigns/bestiary.ts";

const previewNames = [
  "Aboleth", "Banshee", "Birdman", "Bugbear", "Chimera", "Cockatrice", "Commoner", "Cultist", "Drow Mage", "Duergar Legionary", "Flameskull", "Frogman", "Gargoyle", "Ghoul", "Giant Spider", "Goblin", "Grick", "Hag", "Hydra", "Juvenile Poison Dragon", "Kobold", "Lich (Simple)", "Mimic", "Nothic", "Observer", "Ochre Jelly", "Ogre", "Orc", "Owlbear", "Petty Tyrant", "Scarecrow", "Shadow", "Skeleton", "Stirge", "Troll", "Twig Blight", "Lesser Vampire", "Warrior", "Wraith", "Yeti", "Zombie",
];

test("Those Outside the Walls public preview has a complete 41/41, attributed Bestiary transcription", () => {
  const imported = builtInBestiaryCreatures.filter(creature => creature.source.name === "Those Outside the Walls — Free Preview");
  assert.equal(imported.length, 41);
  assert.deepEqual(imported.map(creature => creature.name).sort((a, b) => a.localeCompare(b)), [...previewNames].sort((a, b) => a.localeCompare(b)));
  assert.ok(imported.every(creature => creature.source.license === "CC BY-SA 4.0 (statblocks)" && creature.source.creator === "Alex Dworman" && creature.source.url?.endsWith("422650-sample.pdf")));
  assert.ok(imported.every(creature => Object.isFrozen(creature) && Object.isFrozen(creature.sourceStats) && creature.attacks.length));
});

test("preview edge notation, multiattack, spellcasting, and source abilities survive the narrow model", () => {
  const byName = name => builtInBestiaryCreatures.find(creature => creature.name === name);
  assert.deepEqual({ hd: byName("Kobold")?.sourceStats.hitDice, hdDisplay: byName("Kobold")?.sourceStats.hitDiceDisplay, hp: byName("Kobold")?.hpMax }, { hd: 0.5, hdDisplay: "½", hp: 3 });
  assert.deepEqual({ hd: byName("Stirge")?.sourceStats.hitDice, hdDisplay: byName("Stirge")?.sourceStats.hitDiceDisplay, hp: byName("Stirge")?.hpMax }, { hd: 0, hdDisplay: "0", hp: 1 });
  assert.equal(byName("Juvenile Poison Dragon")?.hpMax, 80);
  assert.equal(byName("Hydra")?.sourceStats.attacksPerMainAction, 12);
  assert.equal(byName("Hydra")?.sourceStats.attacksPerMainActionDisplay, "x*");
  assert.match(byName("Hydra")?.notes ?? "", /Many Heads/u);
  assert.equal(byName("Drow Mage")?.spellcasting?.sourceLoadout, true);
  assert.equal(byName("Drow Mage")?.spellcasting?.spellsPerDay, 2);
  assert.match(byName("Petty Tyrant")?.notes ?? "", /Howl of Light/u);
  assert.match(byName("Lich (Simple)")?.notes ?? "", /Counter Spell/u);
});

test("preview search and copies remain independent while retaining source abilities", () => {
  assert.deepEqual(searchBuiltInBestiaryCreatures("aboleth").map(creature => creature.name), ["Aboleth"]);
  assert.ok(searchBuiltInBestiaryCreatures("undead").some(creature => creature.name === "Banshee"));
  const draft = builtInBestiaryCreatureDraft("totw-giant-spider");
  const first = builtInBestiaryEncounterSeed("totw-giant-spider");
  const second = builtInBestiaryEncounterSeed("totw-giant-spider");
  assert.ok(draft && first && second);
  assert.match(draft.notes, /Webbing/u);
  assert.match(first.combatStats.notes, /Webbing/u);
  first.hpCurrent = 1;
  first.combatStats.attacks[0].damage = "1";
  assert.equal(second.hpCurrent, 14);
  assert.equal(second.combatStats.attacks[0].damage, "1d8");
});
