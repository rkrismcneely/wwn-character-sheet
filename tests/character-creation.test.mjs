import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  creationBackgroundSkillChoiceOptions,
  creationBackgroundSkillChoiceValue,
  creationSkillGrantResolutions,
  creationSkillSources,
  choiceOptionsForBackgroundResult,
  levelOneCreationStatus,
  manualBackgroundLearningOptions,
} from "../app/character-creation.ts";
import { backgrounds } from "../app/background-data.ts";
import { resolveBackgroundSkillGrants } from "../app/background-development.ts";
import {
  guidedCreationModeFromUrl,
  levelUpModeFromUrl,
  withLevelUpMode,
  withGuidedCreationMode,
} from "../app/guided-creation-route.ts";

const skills = [
  "Administer",
  "Connect",
  "Convince",
  "Craft",
  "Exert",
  "Heal",
  "Know",
  "Lead",
  "Magic",
  "Notice",
  "Perform",
  "Pray",
  "Punch",
  "Ride",
  "Sail",
  "Shoot",
  "Sneak",
  "Stab",
  "Survive",
  "Trade",
  "Work",
];

const baseCharacter = () => ({
  name: "Wizard test",
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
  focusPicks: [
    { name: "Armsmaster", level: 1 },
    { name: "Alert", level: 1 },
  ],
  artPicks: [],
  spellPicks: [],
  skillPurchases: Object.fromEntries(skills.map((skill) => [skill, -1])),
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

const withFreePick = (character) => {
  character.skillPurchases.Know = 0;
  return character;
};

test("level-one guided creation validates ordinary martial and expert/warrior paths", () => {
  const martial = withFreePick(baseCharacter());
  const martialStatus = levelOneCreationStatus(martial);
  assert.equal(martialStatus.canFinish, true);
  assert.equal(martialStatus.startingHp, 6);
  assert.equal(martialStatus.skillRanks.Stab, 1);
  assert.deepEqual(martialStatus.sources.Stab, [
    "Soldier Background: free skill",
    "Armsmaster Focus: bonus skill",
  ]);

  const expertWarrior = withFreePick({
    ...baseCharacter(),
    classMode: "adventurer",
    classOne: "Expert",
    classTwo: "Warrior",
    focusPicks: ["Alert", "Cultured", "Die Hard"].map((name) => ({
      name,
      level: 1,
    })),
  });
  const expertWarriorStatus = levelOneCreationStatus(expertWarrior);
  assert.equal(expertWarriorStatus.canFinish, true);
  assert.equal(expertWarriorStatus.allowedFocusPicks, 3);
  assert.equal(expertWarriorStatus.startingHp, 8);

  const expert = withFreePick({
    ...baseCharacter(),
    background: "Scholar",
    backgroundCombatSkill: "",
    classOne: "Expert",
    focusPicks: ["Alert", "Cultured"].map((name) => ({ name, level: 1 })),
  });
  const expertStatus = levelOneCreationStatus(expert);
  assert.equal(expertStatus.canFinish, true);
  assert.equal(expertStatus.hasMagicStep, false);
});

test("level-one guided creation requires an explicit starting-equipment path", () => {
  const character = withFreePick({
    ...baseCharacter(),
    armor: "",
    shield: "",
    readied: [],
    stowed: [],
    sp: 0,
    cp: 0,
    creationEquipmentMethod: "",
    creationStartingSilver: null,
  });
  assert.equal(levelOneCreationStatus(character).stepStatus.equipment.complete, false);
});

test("guided creation exposes physical parity controls for every setup die", async () => {
  const [wizard, sheet] = await Promise.all([
    readFile(new URL("../app/character-creation-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(wizard, /Roll 3d6 in order/u);
  assert.match(wizard, /min=\{3\}/u);
  assert.match(wizard, /max=\{18\}/u);
  assert.match(wizard, /Physical 3d6 total/u);
  assert.match(wizard, /Roll 1d6 for HP/u);
  assert.match(wizard, /backgroundDevelopmentRollFromDie/u);
  assert.match(wizard, /Physical result/u);
  assert.match(sheet, /backgroundDevelopmentRollFromDie/u);
  assert.match(sheet, /Physical d\{dieSize\} result/u);
  assert.match(wizard, /Wise concept skill[\s\S]*creationSkills\.map/u);
  assert.match(sheet, /wiseConceptSkill: skills\.includes/u);
});

test("level-one guided creation validates full and partial Mage spell selections", () => {
  const fullMage = withFreePick({
    ...baseCharacter(),
    background: "Scholar",
    backgroundCombatSkill: "",
    classOne: "High Mage",
    focusPicks: [{ name: "Alert", level: 1 }],
    artPicks: ["Arcane Lexicon", "Counter Magic"],
    spellPicks: [
      "Apprehending the Arcane Form",
      "Cognitive Supersession of the Inferior Orders",
      "The Coruscating Coffin",
      "Damnation of the Sense",
    ].map((name) => ({ name, prepared: false, cast: false })),
  });
  const fullMageStatus = levelOneCreationStatus(fullMage);
  assert.equal(fullMageStatus.canFinish, true);
  assert.equal(fullMageStatus.artAllowance, 2);
  assert.equal(fullMageStatus.knownSpellAllowance, 4);
  assert.deepEqual(fullMageStatus.sources.Magic, [
    "High Mage Class: bonus skill",
  ]);

  const partialMage = withFreePick({
    ...baseCharacter(),
    classMode: "adventurer",
    classOne: "Warrior",
    classTwo: "High Mage",
    artPicks: ["Arcane Lexicon"],
    spellPicks: [
      "Apprehending the Arcane Form",
      "Cognitive Supersession of the Inferior Orders",
    ].map((name) => ({ name, prepared: false, cast: false })),
  });
  const partialMageStatus = levelOneCreationStatus(partialMage);
  assert.equal(partialMageStatus.canFinish, true);
  assert.equal(partialMageStatus.artAllowance, 1);
  assert.equal(partialMageStatus.knownSpellAllowance, 2);
});

test("creation ledger retains the normal background, class, and Focus sources", () => {
  const character = withFreePick(baseCharacter());
  const sources = creationSkillSources(character);
  assert.deepEqual(sources.Exert, ["Soldier Background: Quick Skills"]);
  assert.deepEqual(sources.Survive, ["Soldier Background: Quick Skills"]);
  assert.deepEqual(sources.Notice, ["Alert Focus: bonus skill"]);

  const unresolved = creationSkillGrantResolutions({
    ...character,
    backgroundCombatSkill: "",
  });
  assert.equal(
    unresolved.find((grant) => grant.id === "background-free")?.needsChoice,
    true,
  );
});

test("background choice options interpret canonical ranked results", () => {
  assert.deepEqual(choiceOptionsForBackgroundResult("Any Combat"), ["Punch", "Shoot", "Stab"]);
  assert.deepEqual(choiceOptionsForBackgroundResult("Any Combat-0"), ["Punch", "Shoot", "Stab"]);
  assert.deepEqual(choiceOptionsForBackgroundResult("Any Skill"), skills);
  assert.deepEqual(choiceOptionsForBackgroundResult("Any Skill-0"), skills);
  assert.deepEqual(choiceOptionsForBackgroundResult("Stab-0"), []);
});

test("Soldier's canonical Any Combat-0 free skill resolves through the creation ledger", () => {
  const unresolved = withFreePick({ ...baseCharacter(), backgroundCombatSkill: "" });
  const pending = creationSkillGrantResolutions(unresolved).find((grant) => grant.id === "background-free");
  assert.deepEqual(pending?.result, "Any Combat-0");
  assert.equal(pending?.needsChoice, true);

  const resolved = withFreePick({ ...baseCharacter(), backgroundCombatSkill: "Punch" });
  const free = creationSkillGrantResolutions(resolved).find((grant) => grant.id === "background-free");
  assert.equal(free?.resolvedSkill, "Punch");
  assert.equal(free?.needsChoice, false);
  assert.equal(levelOneCreationStatus(resolved).stepStatus.skills.complete, true);
});

test("resolver-backed skill choices stay visible, editable, and constrained by grant order", () => {
  const withShoot = withFreePick({
    ...baseCharacter(),
    backgroundCombatSkill: "Shoot",
  });
  assert.equal(
    creationBackgroundSkillChoiceValue(withShoot, "background-free"),
    "Shoot",
  );
  assert.deepEqual(
    creationBackgroundSkillChoiceOptions(withShoot, "background-free"),
    ["Punch", "Shoot", "Stab"],
  );

  const withPunch = { ...withShoot, backgroundCombatSkill: "Punch" };
  assert.equal(
    creationBackgroundSkillChoiceValue(withPunch, "background-free"),
    "Punch",
  );
  assert.deepEqual(creationSkillSources(withPunch).Punch, [
    "Soldier Background: free skill",
  ]);

  const cappedShoot = withFreePick({
    ...baseCharacter(),
    backgroundCombatSkill: "Shoot",
    backgroundDevelopmentMethod: "choose-learning",
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "", replacement: "" },
      { result: "", choice: "", replacement: "" },
    ],
    focusPicks: [{ name: "Deadeye", level: 1 }],
  });
  assert.deepEqual(
    creationBackgroundSkillChoiceOptions(cappedShoot, "learning-0"),
    ["Punch", "Stab"],
  );
  assert.deepEqual(
    creationBackgroundSkillChoiceOptions(
      { ...cappedShoot, backgroundCombatSkill: "Punch" },
      "learning-0",
    ),
    ["Punch", "Shoot", "Stab"],
    "changing an earlier grant recomputes later legal choices",
  );

  const staleShoot = {
    ...cappedShoot,
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "Shoot", replacement: "" },
      { result: "", choice: "", replacement: "" },
    ],
  };
  assert.equal(creationBackgroundSkillChoiceValue(staleShoot, "learning-0"), "");
  assert.equal(
    creationSkillGrantResolutions(staleShoot).find((grant) => grant.id === "learning-0")?.needsReplacement,
    true,
  );
});

test("Soldier and Deadeye use ordered legal replacement options for a third acquisition", () => {
  const blocked = withFreePick({
    ...baseCharacter(),
    backgroundDevelopmentMethod: "choose-learning",
    backgroundCombatSkill: "Shoot",
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "Shoot", replacement: "" },
      { result: "", choice: "", replacement: "" },
    ],
    focusPicks: [{ name: "Deadeye", level: 1 }],
  });
  assert.deepEqual(creationSkillSources(blocked).Shoot, [
    "Soldier Background: free skill",
    "Deadeye Focus: bonus skill",
  ]);
  const pending = creationSkillGrantResolutions(blocked).find(
    (grant) => grant.id === "learning-0",
  );
  assert.equal(pending?.rawSkill, "Shoot");
  assert.equal(pending?.needsReplacement, true);
  assert.equal(pending?.replacementOptions.includes("Shoot"), false);
  assert.equal(pending?.replacementOptions.includes("Punch"), true);
  assert.equal(pending?.replacementOptions.includes("Stab"), true);
  assert.deepEqual(pending?.replacementOptions, ["Punch", "Stab"]);

  const resolved = {
    ...blocked,
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "Shoot", replacement: "Punch" },
      { result: "", choice: "", replacement: "" },
    ],
  };
  const replacement = creationSkillGrantResolutions(resolved).find(
    (grant) => grant.id === "learning-0",
  );
  assert.equal(replacement?.needsReplacement, false);
  assert.equal(replacement?.resolvedSkill, "Punch");
  assert.deepEqual(creationSkillSources(resolved).Punch, [
    "Soldier Background: chosen Learning 1",
  ]);

  const stale = {
    ...blocked,
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "Shoot", replacement: "Shoot" },
      { result: "", choice: "", replacement: "" },
    ],
  };
  const invalidStoredReplacement = creationSkillGrantResolutions(stale).find(
    (grant) => grant.id === "learning-0",
  );
  assert.equal(invalidStoredReplacement?.resolvedSkill, "");
  assert.equal(invalidStoredReplacement?.needsReplacement, true);
});

test("ordered replacement candidates exclude every skill already at the acquisition cap", () => {
  const state = {
    ...baseCharacter(),
    backgroundDevelopmentMethod: "choose-learning",
    backgroundCombatSkill: "Shoot",
    backgroundLearningPicks: [
      { result: "Any Combat", choice: "Stab", replacement: "" },
      { result: "Any Combat", choice: "Shoot", replacement: "" },
    ],
    focusPicks: [
      { name: "Deadeye", level: 1 },
      { name: "Armsmaster", level: 1 },
    ],
  };
  const pending = creationSkillGrantResolutions(state).find(
    (grant) => grant.id === "learning-1",
  );
  assert.equal(pending?.needsReplacement, true);
  assert.equal(pending?.replacementOptions.includes("Shoot"), false);
  assert.equal(pending?.replacementOptions.includes("Stab"), false);

  const fixed = resolveBackgroundSkillGrants(
    [{ id: "fixed", result: "Stab-0", source: "test" }],
    skills,
    ["Punch", "Shoot", "Stab"],
  );
  assert.equal(fixed[0].resolvedSkill, "Stab");
});

test("manual Learning deduplicates choices without changing canonical roll weighting", async () => {
  assert.equal(backgrounds.Soldier.learning.filter((result) => result === "Any Combat").length, 2);
  assert.equal(
    manualBackgroundLearningOptions("Soldier").filter((result) => result === "Any Combat").length,
    1,
  );
  assert.equal(
    manualBackgroundLearningOptions("Artisan").filter((result) => result === "Craft").length,
    1,
  );
  assert.deepEqual(
    ["Any Combat", "Any Combat"],
    Array.from({ length: 2 }, () => "Any Combat"),
    "the same distinct Learning result remains selectable in both rows",
  );

  const wizard = await readFile(
    new URL("../app/character-creation-wizard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(wizard, /manualBackgroundLearningOptions\(sheet\.background\)/u);
  assert.match(wizard, /creationBackgroundSkillChoiceOptions\(sheet, grant\.id\)/u);
  assert.match(wizard, /creationBackgroundSkillChoiceValue\(sheet, grant\.id\)/u);
  assert.doesNotMatch(wizard, /\.filter\(\(grant\) => grant\.needsChoice \|\| grant\.needsReplacement\)/u);
  assert.match(wizard, /grant\.replacementOptions/u);
  assert.match(wizard, /is already at the level-1 starting\s+maximum/u);
});

test("guided creation route state survives reloads without storing a character draft", async () => {
  const guided = withGuidedCreationMode("/character/chr_example?tab=core", true);
  assert.equal(guided, "/character/chr_example?tab=core&guided=1");
  assert.equal(guidedCreationModeFromUrl(guided), true);
  assert.equal(
    withGuidedCreationMode(guided, false),
    "/character/chr_example?tab=core",
  );
  assert.equal(guidedCreationModeFromUrl("/character/chr_example"), false);
  const levelUp = withLevelUpMode("/character/chr_example?tab=core", true);
  assert.equal(levelUp, "/character/chr_example?tab=core&levelup=1");
  assert.equal(levelUpModeFromUrl(levelUp), true);
  assert.equal(withLevelUpMode(levelUp, false), "/character/chr_example?tab=core");

  const sheet = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
  assert.match(sheet, /synchronizeGuidedCreationMode/u);
  assert.match(sheet, /window\.addEventListener\("popstate", synchronizeGuidedCreationMode\)/u);
  assert.match(sheet, /withGuidedCreationMode\(\s*`\/character\/\$\{payload\.id\}`/u);
  assert.match(sheet, /setGuidedCreationMode\(false, "replace"\)/u);
});

test("the completeness layer keeps Background identity separate from its later choices", () => {
  const early = {
    ...baseCharacter(),
    classOne: "",
    focusPicks: [],
    hpRolls: [],
    skillPurchases: Object.fromEntries(skills.map((skill) => [skill, -1])),
  };
  const status = levelOneCreationStatus(early);
  assert.equal(status.stepStatus.background.complete, true);
  assert.equal(status.stepStatus.skills.complete, false);
  assert.match(
    status.stepStatus.skills.issues.join(" "),
    /free creation skill/i,
  );
});

test("a level-one hit die result is required and uses the ordinary d6 rule", () => {
  const missingRoll = withFreePick({ ...baseCharacter(), hpRolls: [] });
  assert.match(
    levelOneCreationStatus(missingRoll).stepStatus.review.issues.join(" "),
    /hit die result/i,
  );
  const invalidRoll = withFreePick({ ...baseCharacter(), hpRolls: [7] });
  assert.match(
    levelOneCreationStatus(invalidRoll).stepStatus.review.issues.join(" "),
    /hit die result/i,
  );
});

test("creation caps, Origin Focus choices, and magic-step visibility are explicit", () => {
  const overCap = withFreePick(baseCharacter());
  overCap.skillPurchases.Stab = 1;
  assert.match(
    levelOneCreationStatus(overCap).stepStatus.skills.issues.join(" "),
    /above level 1/i,
  );

  const incompleteOrigin = withFreePick({
    ...baseCharacter(),
    focusPicks: [
      { name: "Alert", level: 1 },
      { name: "Xenoblooded", level: 1, choice: "" },
    ],
  });
  assert.match(
    levelOneCreationStatus(incompleteOrigin).stepStatus.foci.issues.join(" "),
    /Xenoblooded needs/i,
  );
  const origin = {
    ...incompleteOrigin,
    focusPicks: [
      { name: "Alert", level: 1 },
      { name: "Xenoblooded", level: 1, choice: "STR +1 / DEX -1" },
    ],
  };
  const originStatus = levelOneCreationStatus(origin);
  assert.equal(originStatus.attributeModifier("STR"), 2);
  assert.equal(originStatus.attributeModifier("DEX"), -1);
  assert.equal(levelOneCreationStatus(baseCharacter()).hasMagicStep, false);
  assert.equal(
    levelOneCreationStatus({ ...baseCharacter(), classOne: "High Mage" })
      .hasMagicStep,
    true,
  );
});

test("class structure and repeatable Focus targets keep normal eligibility rules", () => {
  const invalidFullClass = withFreePick({
    ...baseCharacter(),
    classMode: "full",
    classOne: "Duelist",
  });
  assert.match(
    levelOneCreationStatus(invalidFullClass).stepStatus.class.issues.join(" "),
    /full Class/i,
  );
  const repeatedSpecialistTarget = withFreePick({
    ...baseCharacter(),
    focusPicks: [
      { name: "Specialist", level: 1, choice: "Know" },
      { name: "Specialist", level: 1, choice: "Know" },
    ],
  });
  assert.match(
    levelOneCreationStatus(
      repeatedSpecialistTarget,
    ).stepStatus.foci.issues.join(" "),
    /target not used/i,
  );
});

test("class backtracking exposes invalid dependent choices without mutating the character", () => {
  const mage = withFreePick({
    ...baseCharacter(),
    classOne: "High Mage",
    focusPicks: [{ name: "Armored Magic", level: 1 }],
    artPicks: ["Arcane Lexicon", "Counter Magic"],
    spellPicks: [
      "Apprehending the Arcane Form",
      "Cognitive Supersession of the Inferior Orders",
      "The Coruscating Coffin",
      "Damnation of the Sense",
    ].map((name) => ({ name, prepared: false, cast: false })),
  });
  const changedClass = { ...mage, classOne: "Warrior" };
  const status = levelOneCreationStatus(changedClass);
  assert.equal(changedClass.focusPicks[0].name, "Armored Magic");
  assert.match(
    status.stepStatus.foci.issues.join(" "),
    /Armored Magic requires/i,
  );
  assert.match(
    status.stepStatus.magic.issues.join(" "),
    /Choose 0 level-1 Arts/i,
  );
});

test("guided creation entry and wizard use the canonical sheet rather than a parallel draft", async () => {
  const [sheet, wizard] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/character-creation-wizard.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(sheet, /Guided Creation/u);
  assert.match(sheet, /Blank Character/u);
  assert.match(sheet, /onChange=\{update =>\s*setSheet/u);
  assert.match(sheet, /normalizeCreationEquipmentFields/u);
  assert.match(wizard, /Resolve Background choices/u);
  assert.match(wizard, /Character so far/u);
  assert.match(wizard, /Needs attention/u);
  assert.match(wizard, /lastStepStorageKey/u);
  assert.match(wizard, /Worn armor/u);
  assert.match(wizard, /ReviewSection/u);
  assert.match(wizard, /Level 1 hit-die roll/u);
  assert.match(
    wizard,
    /rollCreationStartingSilver\(sheet, rollDice\(3, 6\)\.total\)/u,
  );
  assert.doesNotMatch(wizard, /Math\.random/u);
  assert.doesNotMatch(wizard, /useState<LevelOneCreationCharacter>/u);
});

test("Level Up stays in the Character Level cell without changing the Identity grid", async () => {
  const [sheet, styles] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /<span>Character Level<\/span>[\s\S]*className="level-control-row"[\s\S]*>Level Up<\/button>/u);
  assert.match(sheet, /className="level-select"/u);
  assert.doesNotMatch(sheet, /character-sheet-guided-action[\s\S]*Level Up · \{sheet\.level\}/u);
  assert.match(sheet, /sheet\.level < 10[\s\S]*className="level-up-inline-button"/u);
  assert.match(sheet, /if \(sheet\.level >= 1 && nextLevel > sheet\.level\)/u);
  assert.match(styles, /\.level-control-row[\s\S]*\.level-select\{width:112px/u);
});

test("Choose Learning keeps both selects readable across responsive widths", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.background-learning-rows\s*\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css, /\.background-learning-rows \.background-result-row\s*\{\s*grid-template-columns:minmax\(0,1fr\)/u);
  assert.match(css, /\.background-learning-rows \.background-result-row select\s*\{[\s\S]*width:100%/u);
  assert.match(css, /\.background-result-row\{grid-template-columns:minmax\(0,1fr\)\}/u);
});
