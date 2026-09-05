import assert from "node:assert/strict";
import test from "node:test";
import {
  creationSkillRankCanBeSelected,
  creationSkills,
  levelOneCreationStatus,
} from "../app/character-creation.ts";

const baseCharacter = () => ({
  name: "Bundle 2 test",
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
  classMode: "full",
  classOne: "Warrior",
  classTwo: "",
  vowedEffortSkill: "Exert",
  wiseConceptSkill: "",
  beastmasterBond: "",
  focusPicks: [
    { name: "Armsmaster", level: 1 },
    { name: "Alert", level: 1 },
  ],
  artPicks: [],
  artChoices: {},
  spellPicks: [],
  skillPurchases: Object.fromEntries(creationSkills.map((skill) => [skill, -1])),
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
});

test("the free creation skill pick is one rank step, not a pool of skill points", () => {
  const character = baseCharacter();
  assert.equal(
    creationSkillRankCanBeSelected(character, "Know", 1),
    false,
    "an untrained skill cannot jump directly from -1 to level 1 with the free pick",
  );
  assert.equal(
    creationSkillRankCanBeSelected(character, "Exert", 1),
    true,
    "a skill already trained to level 0 by a creation source can use the free pick for level 1",
  );
  assert.equal(
    creationSkillRankCanBeSelected(character, "Know", 0),
    true,
    "the free pick can still train an untrained skill to level 0",
  );
});

test("Wise Skilled grants and spends three ordinary points on non-combat skills", () => {
  const character = {
    ...baseCharacter(),
    classMode: "adventurer",
    classOne: "Wise",
    classTwo: "Warrior",
    wiseConceptSkill: "Pray",
    artPicks: ["Skilled"],
    skillPurchases: {
      ...baseCharacter().skillPurchases,
      Know: 1,
      Connect: 0,
      Craft: 0,
    },
  };
  const status = levelOneCreationStatus(character);
  assert.equal(status.skilledArtCount, 1);
  assert.equal(status.skillPointAllowance, 3);
  assert.equal(status.freeSkillPlan.skillPointsSpent, 3);
  assert.equal(status.freeSkillPlan.skillPointsRemaining, 0);
  assert.equal(status.freeSkillPlan.spending, 0);
  assert.equal(status.stepStatus.skills.complete, true);
});

test("Wise Skilled cannot fund combat ranks or overspend its three-point budget", () => {
  const combat = {
    ...baseCharacter(),
    classMode: "adventurer",
    classOne: "Wise",
    classTwo: "Warrior",
    wiseConceptSkill: "Pray",
    artPicks: ["Skilled"],
    skillPurchases: {
      ...baseCharacter().skillPurchases,
      Shoot: 1,
      Know: 0,
      Connect: 0,
      Craft: 0,
    },
  };
  const combatStatus = levelOneCreationStatus(combat);
  assert.ok(combatStatus.freeSkillPlan.invalidCombatSteps > 0);
  assert.equal(combatStatus.stepStatus.skills.complete, false);

  const overspent = {
    ...combat,
    skillPurchases: {
      ...baseCharacter().skillPurchases,
      Know: 1,
      Connect: 0,
      Craft: 0,
      Heal: 0,
    },
  };
  const overspentStatus = levelOneCreationStatus(overspent);
  assert.equal(overspentStatus.freeSkillPlan.overspend, 1);
  assert.equal(overspentStatus.stepStatus.skills.complete, false);
});

test("Adventurer Arts must be supplied by each partial tradition's own allowance", () => {
  const character = {
    ...baseCharacter(),
    classMode: "adventurer",
    classOne: "High Mage",
    classTwo: "Necromancer",
    focusPicks: [{ name: "Alert", level: 1 }],
  };
  const probe = levelOneCreationStatus(character);
  assert.equal(probe.artAllowanceByTradition["High Mage"], 1);
  assert.equal(probe.artAllowanceByTradition.Necromancer, 1);

  const highMageArts = probe.availableArts.filter((art) => art.tradition === "High Mage");
  const necromancerArts = probe.availableArts.filter((art) => art.tradition === "Necromancer");
  assert.ok(highMageArts.length >= 2);
  assert.ok(necromancerArts.length >= 1);

  const pooled = levelOneCreationStatus({
    ...character,
    artPicks: [highMageArts[0].value, highMageArts[1].value],
  });
  assert.equal(pooled.artCountsByTradition["High Mage"], 2);
  assert.equal(pooled.artCountsByTradition.Necromancer, 0);
  assert.ok(
    pooled.stepStatus.magic.issues.some((message) =>
      message.includes("Necromancer supplies 1 starting Art"),
    ),
  );

  const split = levelOneCreationStatus({
    ...character,
    artPicks: [highMageArts[0].value, necromancerArts[0].value],
  });
  assert.equal(split.artCountsByTradition["High Mage"], 1);
  assert.equal(split.artCountsByTradition.Necromancer, 1);
  assert.equal(
    split.stepStatus.magic.issues.some((message) => message.includes("supplies 1 starting Art")),
    false,
  );
});
