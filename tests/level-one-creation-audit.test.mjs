import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { backgroundNames, backgrounds } from "../app/background-data.ts";
import {
  backgroundAttributeChoices,
  backgroundAttributePointCount,
  backgroundTableResult,
} from "../app/background-development.ts";
import {
  creationArtForSelection,
  creationBackgroundSkillChoiceOptions,
  artSelectionName,
  artSelectionValue,
  creationFocusClassCategory,
  creationFocusChoiceLabel,
  creationFocusChoiceOptions,
  creationPartialClassPairIsLegal,
  creationSkillGrantResolutions,
  creationSkillRankCanBeSelected,
  creationSkills,
  levelOneCreationStatus,
  manualBackgroundLearningOptions,
} from "../app/character-creation.ts";
import { artSlots, fullClasses, partialClasses, traditionInfo } from "../app/class-data.ts";
import { foci } from "../app/wwn-data.ts";

const attributes = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

function blankState(overrides = {}) {
  return {
    name: "Audit character",
    player: "",
    species: "Human",
    homeland: "",
    profession: "",
    description: "",
    portrait: "",
    level: 1,
    attributeMethod: "array",
    attributeRolls: Object.fromEntries(attributes.map((attribute) => [attribute, 0])),
    attributeSubstitution: "",
    attributeBoosts: Object.fromEntries(attributes.map((attribute) => [attribute, 0])),
    attrs: { STR: 14, DEX: 12, CON: 11, INT: 10, WIS: 9, CHA: 7 },
    background: "Soldier",
    backgroundDevelopmentMethod: "quick",
    backgroundCombatSkill: "",
    backgroundQuickSkillReplacements: ["", ""],
    backgroundLearningPicks: Array.from({ length: 2 }, () => ({ result: "", choice: "", replacement: "" })),
    backgroundDevelopmentRolls: [],
    classMode: "full",
    languages: ["Common", "Trade Cant"],
    classOne: "Warrior",
    classTwo: "",
    vowedEffortSkill: "Exert",
    wiseConceptSkill: "Know",
    beastmasterBond: "bind-companion",
    focusPicks: [],
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
    ...overrides,
  };
}

function updateGrant(state, grant, field, value) {
  if (grant.id === "background-free")
    return { ...state, backgroundCombatSkill: value };
  if (grant.id.startsWith("quick-")) {
    if (field === "choice") return { ...state, backgroundCombatSkill: value };
    const index = Number(grant.id.slice("quick-".length));
    return {
      ...state,
      backgroundQuickSkillReplacements: state.backgroundQuickSkillReplacements.map(
        (replacement, row) => (row === index ? value : replacement),
      ),
    };
  }
  if (grant.id.startsWith("learning-")) {
    const index = Number(grant.id.slice("learning-".length));
    return {
      ...state,
      backgroundLearningPicks: state.backgroundLearningPicks.map((pick, row) =>
        row === index ? { ...pick, [field]: value } : pick,
      ),
    };
  }
  if (grant.id.startsWith("roll-")) {
    const index = Number(grant.id.slice("roll-".length));
    return {
      ...state,
      backgroundDevelopmentRolls: state.backgroundDevelopmentRolls.map((roll, row) =>
        row === index ? { ...roll, [field]: value } : roll,
      ),
    };
  }
  return state;
}

function resolveBackgroundChoices(initial) {
  let state = initial;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pending = creationSkillGrantResolutions(state).find(
      (grant) => grant.needsChoice || grant.needsReplacement,
    );
    if (!pending) return state;
    const constrained = creationBackgroundSkillChoiceOptions(state, pending.id);
    if (constrained.length) {
      state = updateGrant(state, pending, "choice", constrained[0]);
      continue;
    }
    assert.ok(pending.replacementOptions.length, `${pending.source} has a legal replacement`);
    state = updateGrant(state, pending, "replacement", pending.replacementOptions[0]);
  }
  assert.fail("Background grant resolution did not converge");
}

function fillFoci(initial) {
  let state = initial;
  const fallback = ["Alert", "Artisan", "Armsmaster", "Authority", "Connected"];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = levelOneCreationStatus(state);
    if (status.focusPicksUsed >= status.allowedFocusPicks) return state;

    const selectedClasses = status.selectedClasses;
    const withoutMageslayerGrant = state.focusPicks.filter(
      (pick) => !(selectedClasses.includes("Mageslayer") && pick.name === "Nullifier"),
    );
    let desired = "";
    if (selectedClasses.includes("Mageslayer") && !state.focusPicks.some((pick) => pick.name === "Nullifier")) {
      desired = "Nullifier";
    } else if (
      selectedClasses.includes("Warrior") &&
      !withoutMageslayerGrant.some((pick) => creationFocusClassCategory(pick) !== "noncombat")
    ) {
      desired = "Alert";
    } else if (
      selectedClasses.includes("Expert") &&
      !withoutMageslayerGrant.some((pick) => creationFocusClassCategory(pick) !== "combat")
    ) {
      desired = "Artisan";
    }
    const candidates = [desired, ...fallback].filter(Boolean);
    const name = candidates.find((candidate) =>
      !state.focusPicks.some((pick) => pick.name === candidate) &&
      status.focusEligibility(candidate, state.focusPicks.length).eligible,
    );
    assert.ok(name, "a generic legal Focus is available for the audited class");
    state = {
      ...state,
      focusPicks: [...state.focusPicks, { name, level: 1, choice: "" }],
    };
  }
  return state;
}

function fillArtQuotas(status, initialArts = []) {
  const arts = [...initialArts];
  const countForTradition = (tradition) => arts.filter((selection) =>
    creationArtForSelection(status.availableArts, selection)?.tradition === tradition,
  ).length;

  for (const art of status.availableArts) {
    if (arts.length === status.artAllowance) break;
    if ((art.minLevel || 1) > 1) continue;
    if (art.name === "Skilled") continue;
    if (art.name === "Deep Apprehension" && !arts.some((selection) => selection.endsWith("Surface Apprehension"))) continue;
    if (arts.includes(art.value)) continue;
    const completedGroup = status.requiredArtChoiceGroups.find((group) => group.options.includes(art.value));
    if (completedGroup && arts.some((selection) => completedGroup.options.includes(selection))) continue;
    const allowed = status.artAllowanceByTradition?.[art.tradition] ?? status.artAllowance;
    if (countForTradition(art.tradition) >= allowed) continue;
    arts.push(art.value);
  }
  return arts;
}

function fillMagic(initial) {
  const status = levelOneCreationStatus(initial);
  const startingArts = [...status.forcedArts];
  for (const group of status.requiredArtChoiceGroups) {
    if (!startingArts.some((selection) => group.options.includes(selection))) startingArts.push(group.options[0]);
  }
  const arts = fillArtQuotas(status, startingArts);
  assert.equal(arts.length, status.artAllowance, "enough level-1 Arts exist for the active traditions");
  const artChoices = { ...(initial.artChoices || {}) };
  for (const selection of arts) {
    const name = artSelectionName(selection);
    if (name === "Favored Weapon") artChoices[name] = ["Long sword"];
    if (name === "Style Weaponry") artChoices[name] = ["Swords", "Bows", "Axes"];
  }
  const spells = status.availableSpells
    .filter((spell) => spell.level <= status.limits.max)
    .filter((spell, index, all) => all.findIndex((other) => other.name === spell.name) === index)
    .slice(0, status.knownSpellAllowance)
    .map((spell) => ({ name: spell.name, prepared: false, cast: false }));
  assert.equal(spells.length, status.knownSpellAllowance, "enough level-1 spells exist for the active traditions");
  return { ...initial, artPicks: arts, artChoices, spellPicks: spells };
}

function chooseFreeSkill(initial) {
  for (const skill of creationSkills) {
    if (!creationSkillRankCanBeSelected(initial, skill, 0)) continue;
    const candidate = {
      ...initial,
      skillPurchases: { ...initial.skillPurchases, [skill]: 0 },
    };
    if (levelOneCreationStatus(candidate).freeSkillPlan.freeSkill) return candidate;
  }
  assert.fail("A legal free creation skill should be available");
}

function completedState(initial) {
  let state = fillFoci(initial);
  state = resolveBackgroundChoices(state);
  state = fillMagic(state);
  state = chooseFreeSkill(state);
  return state;
}

test("catalog-driven Background audit exercises all three development paths", () => {
  assert.equal(backgroundNames.length, 20);
  for (const name of backgroundNames) {
    const background = backgrounds[name];
    assert.equal(background.growth.length, 6, `${name} Growth d6 shape`);
    assert.equal(background.learning.length, 8, `${name} Learning d8 shape`);
    assert.equal(background.quickSkills.length, 2, `${name} Quick Skills shape`);
    assert.deepEqual(
      manualBackgroundLearningOptions(name),
      [...new Set(background.learning.filter((result) => result !== "Any Skill"))],
      `${name} preserves independent manual choices while removing roll weighting`,
    );
    background.growth.forEach((result, index) =>
      assert.equal(backgroundTableResult(name, "growth", index + 1), result, `${name} Growth die ${index + 1}`),
    );
    background.learning.forEach((result, index) =>
      assert.equal(backgroundTableResult(name, "learning", index + 1), result, `${name} Learning die ${index + 1}`),
    );

    const quick = completedState(blankState({ background: name }));
    assert.equal(levelOneCreationStatus(quick).canFinish, true, `${name} Quick Skills reaches a valid character`);

    const manualResults = manualBackgroundLearningOptions(name).slice(0, 2);
    const manual = completedState(blankState({
      background: name,
      backgroundDevelopmentMethod: "choose-learning",
      backgroundLearningPicks: manualResults.map((result) => ({ result, choice: "", replacement: "" })),
    }));
    assert.equal(levelOneCreationStatus(manual).canFinish, true, `${name} Choose Learning reaches a valid character`);

    const rolls = [
      { table: "growth", die: 1 },
      { table: "learning", die: 1 },
      { table: "growth", die: 2 },
    ].map(({ table, die }) => {
      const result = backgroundTableResult(name, table, die);
      const pointCount = backgroundAttributePointCount(result);
      const legalAttributes = backgroundAttributeChoices(result);
      return {
        table,
        die,
        result,
        choice: "",
        replacement: "",
        attributeChoices: Array.from({ length: pointCount }, () => legalAttributes[0] || ""),
      };
    });
    const rolled = completedState(blankState({
      background: name,
      backgroundDevelopmentMethod: "roll-growth-learning",
      backgroundDevelopmentRolls: rolls,
    }));
    assert.equal(levelOneCreationStatus(rolled).canFinish, true, `${name} Roll Growth / Learning reaches a valid character`);
  }
});

test("full classes and every legal partial pairing can form a valid level-1 character", () => {
  assert.equal(fullClasses.length, 6);
  for (const classOne of fullClasses) {
    const complete = completedState(blankState({ classOne }));
    assert.equal(levelOneCreationStatus(complete).canFinish, true, `${classOne} full class`);
  }

  let legalPairs = 0;
  for (const classOne of partialClasses) for (const classTwo of partialClasses) {
    const state = blankState({ classMode: "adventurer", classOne, classTwo });
    const status = levelOneCreationStatus(state);
    const legal = creationPartialClassPairIsLegal(classOne, classTwo);
    const classIssues = status.stepStatus.class.issues.join(" ");
    if (!legal) {
      assert.notEqual(classIssues, "", `${classOne} / ${classTwo} is rejected`);
      continue;
    }
    legalPairs += 1;
    let complete;
    try {
      complete = completedState(state);
    } catch (error) {
      throw new Error(`${classOne} / ${classTwo}: ${error.message}`);
    }
    assert.equal(levelOneCreationStatus(complete).canFinish, true, `${classOne} / ${classTwo}`);
  }
  assert.ok(legalPairs > 0);
});

test("every Focus has a catalog-supported compatible level-1 state", () => {
  assert.equal(foci.length, 36);
  for (const focus of foci) {
    const classOne = focus.name === "Traditional Education"
      ? "Invoker"
      : focus.name === "Polymath"
        ? "Expert"
        : ["Armored Magic"].includes(focus.name)
          ? "High Mage"
          : "Warrior";
    const state = blankState({
      classOne,
      focusPicks: [],
      ...(focus.name === "Lucky" ? { attrs: { STR: 14, DEX: 12, CON: 11, INT: 10, WIS: 9, CHA: 7 } } : {}),
    });
    const status = levelOneCreationStatus(state);
    assert.equal(status.focusEligibility(focus.name, 0).eligible, true, `${focus.name} has a valid class/attribute context`);
    const label = creationFocusChoiceLabel(focus.name);
    const options = creationFocusChoiceOptions(focus.name);
    if (label) assert.ok(options.length, `${focus.name} choice metadata`);
    const complete = completedState({
      ...state,
      focusPicks: [{ name: focus.name, level: 1, choice: options[0] || "" }],
    });
    assert.equal(levelOneCreationStatus(complete).canFinish, true, `${focus.name} completes a compatible creation state`);
  }
});

test("Level 1 invariants reject stale higher-level and advancement-only state", () => {
  const higherLevel = completedState(blankState({ level: 2 }));
  assert.match(levelOneCreationStatus(higherLevel).stepStatus.identity.issues.join(" "), /level-1/i);

  const higherFocus = completedState(blankState({
    classOne: "Warrior",
    focusPicks: [{ name: "Alert", level: 2, choice: "" }],
  }));
  assert.match(levelOneCreationStatus(higherFocus).stepStatus.foci.issues.join(" "), /level-1 Focus/i);

  const boosted = completedState(blankState({
    attributeBoosts: { STR: 1, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    attrs: { STR: 15, DEX: 12, CON: 11, INT: 10, WIS: 9, CHA: 7 },
  }));
  assert.match(levelOneCreationStatus(boosted).stepStatus.attributes.issues.join(" "), /advancement points/i);

  const invalidFocusChoice = completedState(blankState({
    focusPicks: [{ name: "Traditional Education", level: 1, choice: "Not a tradition" }],
    classOne: "Invoker",
  }));
  assert.match(levelOneCreationStatus(invalidFocusChoice).stepStatus.foci.issues.join(" "), /legal specialist tradition/i);
});

test("magic availability follows selected casting traditions and partial-pair UI uses the shared rule", async () => {
  const elementalist = levelOneCreationStatus(blankState({ classOne: "Elementalist" }));
  assert.equal(elementalist.availableSpells.some((spell) => spell.tradition === "High Magic"), false);
  assert.ok(elementalist.availableSpells.every((spell) => spell.tradition === "Elementalist"));

  const invoker = levelOneCreationStatus(blankState({ classOne: "Invoker" }));
  assert.ok(invoker.availableSpells.every((spell) => spell.tradition === "High Magic"));
  assert.equal(creationPartialClassPairIsLegal("Invoker", "Healer"), true);
  assert.equal(creationPartialClassPairIsLegal("Invoker", "High Mage"), false);

  const wizard = await readFile(new URL("../app/character-creation-wizard.tsx", import.meta.url), "utf8");
  assert.match(wizard, /creationPartialClassPairIsLegal/u);
  assert.match(wizard, /creationSkillRankCanBeSelected/u);
  assert.match(wizard, /sheet\.level !== 1/u);
});

test("mandatory starting Arts match the SRD class rules", () => {
  const expected = new Map([
    ["Bard", ["A Thousand Tongues"]],
    ["Beastmaster", ["Bind Companion"]],
    ["Duelist", ["Favored Weapon"]],
    ["Elementalist", ["Elemental Resilience", "Elemental Sparks"]],
    ["Healer", ["Healing Touch"]],
    ["Mageslayer", ["Antimage", "Magebane"]],
    ["Skinshifter", ["Change Form"]],
    ["Thought Noble", ["Open Mind"]],
    ["Vowed", ["Martial Style", "Unarmed Might", "Unarmored Defense"]],
  ]);
  for (const [className, names] of expected) {
    const classTwo = className === "Elementalist" ? "Expert" : "Warrior";
    const status = levelOneCreationStatus(blankState({
      classMode: "adventurer",
      classOne: className,
      classTwo,
    }));
    for (const name of names)
      assert.ok(status.forcedArts.some((selection) => selection.endsWith(name)), `${className} requires ${name}`);
    assert.ok(status.forcedArts.length <= status.artAllowance, `${className} has room for required Arts`);
  }

  const accursed = levelOneCreationStatus(blankState({
    classMode: "adventurer",
    classOne: "Accursed",
    classTwo: "Expert",
  }));
  assert.deepEqual(
    accursed.requiredArtChoiceGroups.map((group) => group.options),
    [["Accursed Blade", "Accursed Bolt"]],
  );
});

test("class Art progression handles Mageslayer, Thought Noble, and generic Esoteric Wise correctly", () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => artSlots("Mageslayer", index + 1, true)), [2,4,5,6,7,8,9,10,11,12]);
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => artSlots("Thought Noble", index + 1, true)), [2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => artSlots("Wise", index + 1, true)), [1,1,2,2,3,3,4,4,5,5]);
  const mageslayer = traditionInfo.Mageslayer.arts;
  assert.equal(mageslayer.find((art) => art.name === "Witchfinder")?.minLevel, 2);
  assert.equal(mageslayer.find((art) => art.name === "Absolute Negation")?.minLevel, 10);
});

test("Warrior and Expert bonus Focus requirements are enforced without over-classifying ambiguous Foci", () => {
  const badWarrior = levelOneCreationStatus(blankState({
    classOne: "Warrior",
    focusPicks: [{ name: "Artisan", level: 1 }, { name: "Connected", level: 1 }],
  }));
  assert.match(badWarrior.stepStatus.foci.issues.join(" "), /combat-related/i);

  const goodWarrior = levelOneCreationStatus(blankState({
    classOne: "Warrior",
    focusPicks: [{ name: "Alert", level: 1 }, { name: "Connected", level: 1 }],
  }));
  assert.doesNotMatch(goodWarrior.stepStatus.foci.issues.join(" "), /requires one combat-related/i);

  const badExpert = levelOneCreationStatus(blankState({
    classOne: "Expert",
    focusPicks: [{ name: "Armsmaster", level: 1 }, { name: "Deadeye", level: 1 }],
  }));
  assert.match(badExpert.stepStatus.foci.issues.join(" "), /non-combat-related/i);

  const goodExpert = levelOneCreationStatus(blankState({
    classOne: "Expert",
    focusPicks: [{ name: "Artisan", level: 1 }, { name: "Alert", level: 1 }],
  }));
  assert.doesNotMatch(goodExpert.stepStatus.foci.issues.join(" "), /requires one non-combat-related/i);
});

test("Mageslayer Antimage grants Nullifier and Wise accepts any concept-appropriate skill", () => {
  const mageslayer = levelOneCreationStatus(blankState({
    classMode: "adventurer",
    classOne: "Mageslayer",
    classTwo: "Wise",
    focusPicks: [{ name: "Alert", level: 1 }],
  }));
  assert.equal(mageslayer.allowedFocusPicks, 2);
  assert.match(mageslayer.stepStatus.foci.issues.join(" "), /Nullifier/i);

  const withNullifier = levelOneCreationStatus(blankState({
    classMode: "adventurer",
    classOne: "Mageslayer",
    classTwo: "Wise",
    focusPicks: [{ name: "Nullifier", level: 1 }, { name: "Alert", level: 1 }],
  }));
  assert.doesNotMatch(withNullifier.stepStatus.foci.issues.join(" "), /Antimage grants/i);

  const wiseCombatSkill = levelOneCreationStatus(blankState({
    classMode: "adventurer",
    classOne: "Wise",
    classTwo: "Warrior",
    wiseConceptSkill: "Stab",
  }));
  assert.doesNotMatch(wiseCombatSkill.stepStatus.class.issues.join(" "), /Wise concept skill/i);
});

test("every declared mandatory Art is required and compatible with its level-1 allowance", () => {
  for (const partialClass of partialClasses) {
    const status = levelOneCreationStatus(blankState({
      classMode: "adventurer",
      classOne: partialClass,
      classTwo: "Warrior",
    }));
    if (!creationPartialClassPairIsLegal(partialClass, "Warrior")) continue;
    assert.ok(
      status.forcedArts.length <= status.artAllowance,
      `${partialClass} has enough level-1 Art slots for every mandatory Art`,
    );
    if (!status.forcedArts.length) continue;
    const missing = completedState(blankState({
      classMode: "adventurer",
      classOne: partialClass,
      classTwo: "Warrior",
    }));
    const withoutForced = {
      ...missing,
      artPicks: missing.artPicks.map((art) =>
        status.forcedArts.includes(art) ? "" : art,
      ),
    };
    assert.match(
      levelOneCreationStatus(withoutForced).stepStatus.magic.issues.join(" "),
      /required starting Art/i,
      `${partialClass} cannot omit its mandatory Art`,
    );
  }
});

test("same-named Arts from different traditions retain distinct selection identities", () => {
  const state = blankState({
    classMode: "adventurer",
    classOne: "Bard",
    classTwo: "Blood Priest",
  });
  const status = levelOneCreationStatus(state);
  const bardTongues = artSelectionValue("Bard", "A Thousand Tongues");
  const priestTongues = artSelectionValue("Blood Priest", "A Thousand Tongues");
  const arts = fillArtQuotas(status, [bardTongues, priestTongues]);
  const complete = { ...completedState(state), artPicks: arts };
  assert.equal(levelOneCreationStatus(complete).canFinish, true);
  assert.notEqual(bardTongues, priestTongues);
});
