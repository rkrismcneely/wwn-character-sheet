import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { levelOneCreationStatus } from "../app/character-creation.ts";

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

test("Beastmaster keeps Bind Companion required while Chosen Friend preserves the extra Art pick", () => {
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

test("Beastmaster UI exposes the bond choice and a dedicated companion tab model", async () => {
  const [wizard, sheet] = await Promise.all([
    readFile(new URL("../app/character-creation-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(wizard, /Companion bond/u);
  assert.match(wizard, /Chosen Friend · lifelong bond/u);
  assert.match(wizard, /does not spend your additional Art pick/u);
  assert.match(sheet, /type CompanionKind = "henchman" \| "familiar" \| "beastmaster"/u);
  assert.match(sheet, /newCompanion\("beastmaster", 0, sheet\.level\)/u);
  assert.match(sheet, /title=\{chosenFriendCompanion \? "Chosen Friend" : "Beastmaster Companion"\}/u);
  assert.match(sheet, /Lifelong bond · Shared Vitality \+ Mind Call/u);
  assert.match(sheet, /returns beside you at the next dawn with full hit points/u);
});
