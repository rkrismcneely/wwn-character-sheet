import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { levelOneCreationStatus } from "../app/character-creation.ts";
import {
  applyShieldToArmorBase,
  beastmasterCatalogCreature,
  beastmasterAttackName,
  beastmasterCatalogCreatures,
  beastmasterCompanionRules,
  extractBeastmasterDamageExpression,
  feralToughnessBaseArmorClass,
  parseBeastmasterHitDice,
} from "../app/beastmaster-companion.ts";

const skills = [
  "Administer", "Connect", "Convince", "Craft", "Exert", "Heal", "Know",
  "Lead", "Magic", "Notice", "Perform", "Pray", "Punch", "Ride", "Sail",
  "Shoot", "Sneak", "Stab", "Survive", "Trade", "Work",
];

const beastmasterCharacter = (beastmasterBond) => {
  const skillPurchases = Object.fromEntries(skills.map((skill) => [skill, -1]));
  skillPurchases.Know = 0;
  return {
    name: "Beastmaster test",
    player: "",
    species: "Human",
    homeland: "",
    profession: "",
    description: "",
    portrait: "",
    level: 1,
    attributeMethod: "array",
    attributeRolls: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    attributeSubstitution: "",
    attributeBoosts: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    attrs: { STR: 14, DEX: 12, CON: 11, INT: 10, WIS: 9, CHA: 7 },
    background: "Soldier",
    backgroundDevelopmentMethod: "quick",
    backgroundCombatSkill: "Stab",
    backgroundQuickSkillReplacements: ["", ""],
    backgroundLearningPicks: [
      { result: "", choice: "", replacement: "" },
      { result: "", choice: "", replacement: "" },
    ],
    backgroundDevelopmentRolls: [],
    classMode: "adventurer",
    classOne: "Warrior",
    classTwo: "Beastmaster",
    vowedEffortSkill: "Exert",
    wiseConceptSkill: "",
    beastmasterBond,
    focusPicks: [
      { name: "Alert", level: 1 },
      { name: "Die Hard", level: 1 },
    ],
    artPicks: ["Bind Companion", "Eyes of the Beast"],
    artChoices: {},
    spellPicks: [],
    skillPurchases,
    hpRolls: [4],
    hpCurrent: 0,
    hpMax: 0,
    armor: "",
    shield: "",
    readied: ["Spear"],
    stowed: [],
    gp: 0,
    sp: 120,
    cp: 0,
    creationEquipmentMethod: "buy",
    creationEquipmentPackage: "",
    creationStartingSilver: 120,
    creationEquipmentPurchases: [],
    creationEquipmentBase: null,
  };
};

test("Beastmaster defaults to standard Bind Companion without an extra creation choice", () => {
  const standard = levelOneCreationStatus(beastmasterCharacter(""));
  assert.equal(standard.stepStatus.magic.complete, true);
});

test("Chosen Friend remains a distinct campaign option while Bind Companion uses normal Art choices", () => {
  const normal = levelOneCreationStatus(beastmasterCharacter("bind-companion"));
  assert.equal(normal.artAllowance, 2);
  assert.deepEqual(normal.forcedArts, ["Bind Companion"]);
  assert.equal(normal.availableArts.some((art) => art.name === "Mind Call"), true);
  assert.equal(normal.availableArts.some((art) => art.name === "Shared Vitality"), true);
  assert.equal(normal.stepStatus.magic.complete, true);

  const chosen = levelOneCreationStatus(beastmasterCharacter("chosen-friend"));
  assert.equal(chosen.artAllowance, 2);
  assert.deepEqual(chosen.forcedArts, ["Bind Companion"]);
  assert.equal(chosen.availableArts.some((art) => art.name === "Mind Call"), false);
  assert.equal(chosen.availableArts.some((art) => art.name === "Shared Vitality"), false);
  assert.equal(chosen.stepStatus.magic.complete, true);
});

test("Chosen Friend and Shared Vitality derive the companion's effective HD and hit bonus", () => {
  const chosen = beastmasterCompanionRules({
    level: 7,
    bond: "chosen-friend",
    hasSharedVitalityArt: false,
    hasMindCallArt: false,
    mindCallCommitted: false,
    hitDice: "2 HD",
    attackBonus: "+1",
  });
  assert.equal(chosen.eligibleHitDice, true);
  assert.equal(chosen.sharedVitality, true);
  assert.equal(chosen.mindCall, true);
  assert.equal(chosen.effectiveHitDice, 7);
  assert.equal(chosen.minimumHitBonus, 4);
  assert.equal(chosen.effectiveHitBonus, 4);

  const ordinaryWithArt = beastmasterCompanionRules({
    level: 7,
    bond: "bind-companion",
    hasSharedVitalityArt: true,
    hasMindCallArt: true,
    mindCallCommitted: true,
    hitDice: "2 HD",
    attackBonus: "+5",
  });
  assert.equal(ordinaryWithArt.effectiveHitDice, 7);
  assert.equal(ordinaryWithArt.effectiveHitBonus, 5);
  assert.equal(ordinaryWithArt.mindCall, true);

  const ordinary = beastmasterCompanionRules({
    level: 7,
    bond: "bind-companion",
    hasSharedVitalityArt: false,
    hasMindCallArt: false,
    mindCallCommitted: false,
    hitDice: "2 HD",
    attackBonus: "+1",
  });
  assert.equal(ordinary.effectiveHitDice, 2);
  assert.equal(ordinary.minimumHitBonus, null);
  assert.equal(ordinary.effectiveHitBonus, 1);
});


test("Mind Call requires committed Effort in standard Beastmaster mode", () => {
  const inactive = beastmasterCompanionRules({
    level: 3,
    bond: "bind-companion",
    hasSharedVitalityArt: false,
    hasMindCallArt: true,
    mindCallCommitted: false,
    hitDice: "2 HD",
    attackBonus: "+1",
  });
  const active = beastmasterCompanionRules({
    level: 3,
    bond: "bind-companion",
    hasSharedVitalityArt: false,
    hasMindCallArt: true,
    mindCallCommitted: true,
    hitDice: "2 HD",
    attackBonus: "+1",
  });
  assert.equal(inactive.mindCall, false);
  assert.equal(active.mindCall, true);
});

test("Feral Toughness calculates its base AC with correct rounding and shield interaction", () => {
  assert.equal(feralToughnessBaseArmorClass(1), 14);
  assert.equal(feralToughnessBaseArmorClass(2), 14);
  assert.equal(feralToughnessBaseArmorClass(3), 15);
  assert.equal(feralToughnessBaseArmorClass(4), 15);
  assert.equal(feralToughnessBaseArmorClass(5), 16);
  assert.equal(feralToughnessBaseArmorClass(10), 18);

  assert.equal(applyShieldToArmorBase(14, 0), 14);
  assert.equal(applyShieldToArmorBase(14, 13), 15);
  assert.equal(applyShieldToArmorBase(14, 14), 15);
  assert.equal(applyShieldToArmorBase(14, 16), 16);
});

test("Beastmaster companion handling accepts zero and fractional HD without inventing an HD cap", () => {
  assert.equal(parseBeastmasterHitDice("0 HD"), 0);
  assert.equal(parseBeastmasterHitDice("½ HD"), 0.5);
  assert.equal(parseBeastmasterHitDice("1/2"), 0.5);
  assert.equal(parseBeastmasterHitDice("0.5 HD"), 0.5);

  const suitableBeast = beastmasterCompanionRules({
    level: 1,
    bond: "bind-companion",
    hasSharedVitalityArt: false,
    hasMindCallArt: false,
    mindCallCommitted: false,
    hitDice: "10 HD",
    attackBonus: "+1",
  });
  assert.equal(suitableBeast.eligibleHitDice, true);
});

test("Beastmaster UI exposes the bond choice and a rules-aware dedicated companion tab", async () => {
  const [wizard, sheet] = await Promise.all([
    readFile(new URL("../app/character-creation-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(wizard, /Companion mode/u);
  assert.match(wizard, /Bind Companion · standard rules/u);
  assert.match(wizard, /Chosen Friend · campaign option/u);
  assert.match(sheet, /type CompanionKind = "henchman" \| "familiar" \| "beastmaster"/u);
  assert.match(sheet, /newCompanion\("beastmaster", 0, sheet\.level\)/u);
  assert.match(sheet, /title=\{chosenFriendCompanion \? "Chosen Friend" : "Beastmaster Companion"\}/u);
  assert.match(sheet, /Bestiary profile/u);
  assert.match(sheet, /Custom creature/u);
  assert.match(sheet, /chooseBeastmasterCatalogProfile/u);
  assert.match(sheet, /bestiaryId/u);
  assert.match(sheet, /Bind Companion · standard rules/u);
  assert.match(sheet, /Mind Call ready/u);
  assert.match(sheet, /feralToughnessHitDice/u);
  assert.match(sheet, /companion\.kind === "beastmaster" && companion\.bound/u);
  assert.match(sheet, /No companion currently bound/u);
  assert.match(sheet, /Record a bound companion/u);
  assert.match(sheet, /Release companion/u);
  assert.match(sheet, /releasing the companion as a Main Action/u);
  assert.match(sheet, /Roll Attack/u);
  assert.match(sheet, /Roll Damage/u);
  assert.match(sheet, /companion-roll-control/u);
  assert.match(sheet, /extractBeastmasterDamageExpression/u);
  assert.match(sheet, /Base Hit Dice/u);
  assert.match(sheet, /Effective Hit Dice/u);
  assert.match(sheet, /Effective Hit Bonus/u);
  assert.match(sheet, /Instinct/u);
  assert.match(sheet, /Lifelong bond · Shared Vitality \+ Mind Call/u);
  assert.match(sheet, /Restore at next dawn/u);
  assert.match(sheet, /Give this companion a name so its bonded creature is easy to identify during play/u);
  assert.match(sheet, /artSelectionName\(name\) === "Feral Toughness"/u);
  assert.match(sheet, /feralToughnessBaseArmorClass\(effectiveLevel\)/u);
  assert.match(sheet, /feralToughnessArmorBase/u);
});


test("Loaded Beastmaster attacks expose rollable names and damage expressions", () => {
  assert.equal(beastmasterAttackName("Horns: 1d4"), "Horns");
  assert.equal(beastmasterAttackName("—", "Joey"), "Joey");
  assert.equal(extractBeastmasterDamageExpression("Horns: 1d4"), "1d4");
  assert.equal(extractBeastmasterDamageExpression("Hellfire Claws: 1d10 + 5 · Shock 6/-"), "1d10 + 5");
  assert.equal(extractBeastmasterDamageExpression("Bite: 0"), null);
});

test("Beastmaster catalogue is an animal-minded allow-list grouped by family without an invented HD cap", () => {
  const catalog = beastmasterCatalogCreatures();
  assert.ok(catalog.some(creature => creature.id === "small-bird"));
  assert.ok(catalog.some(creature => creature.id === "giant-mantis"));
  assert.ok(catalog.some(creature => creature.id === "predator-hellbeast"));
  assert.ok(!catalog.some(creature => creature.id === "totw-aboleth"), "unapproved intelligent creatures never enter the catalogue");
  assert.equal(beastmasterCatalogCreature("totw-aboleth"), null);
  assert.equal(beastmasterCatalogCreature("giant-phase-spider")?.source.name, "Tales Without End original content");
  assert.equal(beastmasterCatalogCreature("giant-scorpion")?.sourceStats.attacksPerMainAction, 2);

  const expectedFamilies = new Map([
    ["small-bird", ["Animal", "Omnivore"]],
    ["constrictor", ["Animal", "Predator"]],
    ["totw-giant-spider", ["Animal", "Insect"]],
    ["giant-phase-spider", ["Animal", "Insect"]],
    ["giant-scorpion", ["Animal", "Insect"]],
    ["totw-cockatrice", ["Supernatural Beast", "Supernatural Beast"]],
    ["totw-stirge", ["Supernatural Beast", "Supernatural Beast"]],
    ["totw-grick", ["Unnatural Beast", "Unnatural Beast"]],
    ["unnatural-swarm", ["Unnatural Beast", "Unnatural Beast"]],
    ["small-vicious-predator", ["Unnatural Beast", "Unnatural Beast"]],
    ["large-vicious-predator", ["Unnatural Beast", "Unnatural Beast"]],
    ["hulking-predator", ["Unnatural Beast", "Unnatural Beast"]],
    ["terrible-warbeast", ["Unnatural Beast", "Unnatural Beast"]],
    ["predator-hellbeast", ["Unnatural Beast", "Unnatural Beast"]],
  ]);
  for (const [id, [category, family]] of expectedFamilies) {
    const profile = beastmasterCatalogCreature(id);
    assert.equal(profile?.category, category, `${id} category`);
    assert.equal(profile?.family, family, `${id} family`);
  }

  const animalFamilies = catalog
    .filter(creature => creature.category === "Animal")
    .map(creature => `${creature.family}:${creature.sourceStats.hitDice}`);
  assert.ok(animalFamilies.indexOf("Herbivore:1") < animalFamilies.indexOf("Herbivore:2"));
});
