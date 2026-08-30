import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  advancementClassPerDieBonus,
  advancementPlan,
  advancementSkillCreditBySkill,
  attributeBoostLimitAtLevel,
  levelUpHitPointTotal,
  legalAdvancementFocuses,
  skillRankCapAtLevel,
} from "../app/level-advancement.ts";
import { deriveSkillProfile } from "../app/phase2-rules.ts";
import { fullClasses, partialClasses } from "../app/class-data.ts";
import { creationPartialClassPairIsLegal } from "../app/character-creation.ts";

const base = (overrides = {}) => ({
  level: 1,
  classMode: "full",
  classOne: "Warrior",
  classTwo: "",
  attrs: { STR: 14, DEX: 12, CON: 11, INT: 10, WIS: 9, CHA: 7 },
  attributeBoosts: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  focusPicks: [], artPicks: [], spellPicks: [], skillPurchases: {},
  ...overrides,
});

test("advancement matrix exposes every legal one-level transition", () => {
  for (let from = 1; from <= 9; from += 1) {
    const plan = advancementPlan(base({ level: from }));
    assert.equal(plan.from, from);
    assert.equal(plan.to, from + 1);
    assert.equal(plan.canAdvance, true);
    assert.equal(plan.gainsFocus, [2, 5, 7, 10].includes(from + 1));
  }
  assert.equal(advancementPlan(base({ level: 10 })).canAdvance, false);
});

test("class matrix reuses Expert, Mage, and partial-class progressions", () => {
  assert.equal(advancementPlan(base({ classOne: "Expert" })).skillPoints, 4);
  assert.equal(advancementPlan(base({ classMode: "adventurer", classOne: "Expert", classTwo: "Warrior" })).skillPoints, 4);
  const mage = advancementPlan(base({ classOne: "High Mage" }));
  assert.equal(mage.artPicks, 1);
  assert.equal(mage.spellPicks, 2);
  const partialMage = advancementPlan(base({ classMode: "adventurer", classOne: "Warrior", classTwo: "High Mage" }));
  assert.equal(partialMage.artPicks, 1);
  assert.equal(partialMage.spellPicks, 2, "the app's known-spell table remains the source of truth");
});

test("every supported full and legal partial path has a complete 1–10 matrix", () => {
  for (const classOne of fullClasses) {
    for (let level = 1; level <= 10; level += 1) {
      const plan = advancementPlan(base({ level, classOne }));
      assert.ok(plan.skillPoints >= 3, `${classOne} at level ${level}`);
      assert.ok(plan.artPicks >= 0 && plan.spellPicks >= 0, `${classOne} at level ${level}`);
    }
  }
  for (const classOne of partialClasses) for (const classTwo of partialClasses) {
    if (!creationPartialClassPairIsLegal(classOne, classTwo)) continue;
    for (let level = 1; level <= 10; level += 1) {
      const plan = advancementPlan(base({ level, classMode: "adventurer", classOne, classTwo }));
      assert.ok(plan.skillPoints >= 3, `${classOne}/${classTwo} at level ${level}`);
      assert.ok(plan.artPicks >= 0 && plan.spellPicks >= 0, `${classOne}/${classTwo} at level ${level}`);
    }
  }
});

test("skill and attribute caps follow the SRD level gates", () => {
  assert.equal(skillRankCapAtLevel(1), 1);
  assert.equal(skillRankCapAtLevel(3), 2);
  assert.equal(skillRankCapAtLevel(6), 3);
  assert.equal(skillRankCapAtLevel(9), 4);
  assert.equal(attributeBoostLimitAtLevel(2), 2);
  assert.equal(attributeBoostLimitAtLevel(3), 3);
  assert.equal(attributeBoostLimitAtLevel(6), 4);
  assert.equal(attributeBoostLimitAtLevel(9), 5);
});

test("HP reroll keeps the better total and otherwise grants one", () => {
  assert.equal(levelUpHitPointTotal(12, 5, 2, 0, 2, false), 13);
  assert.equal(levelUpHitPointTotal(12, 11, 2, 0, 2, false), 15);
  assert.equal(levelUpHitPointTotal(8, 2, 2, -2, -1, false), 9);
  assert.equal(advancementClassPerDieBonus(base({ classOne: "Warrior" })), 2);
  assert.equal(advancementClassPerDieBonus(base({ classOne: "High Mage" })), -1);
});

test("advancement Focus bonus skill credit is separate from paid skill ranks", () => {
  const character = base({ focusPicks: [{ name: "Armsmaster", level: 1, advancement: true }] });
  assert.deepEqual(advancementSkillCreditBySkill(character), { Stab: 3 });
  assert.equal(deriveSkillProfile({ purchased: -1, sourceCount: 0, credit: 3 }).effective, 1);
  assert.equal(deriveSkillProfile({ purchased: 1, sourceCount: 0, credit: 3 }).effective, 2);
});

test("Focus options respect existing Focus levels and class restrictions", () => {
  const warriorOptions = legalAdvancementFocuses(base({ focusPicks: [{ name: "Alert", level: 1 }] }));
  assert.ok(warriorOptions.some((focus) => focus.name === "Alert"));
  const mageOptions = legalAdvancementFocuses(base({ classOne: "High Mage" }));
  assert.ok(!mageOptions.some((focus) => focus.name === "Developed Attribute"));
  assert.ok(!mageOptions.some((focus) => focus.name === "Nullifier"));
});

test("Level-Up Wizard remains transactional, URL-addressable, and version-guarded", async () => {
  const [wizard, sheet] = await Promise.all([
    readFile(new URL("../app/level-up-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(wizard, /window\.sessionStorage\.setItem\(storageKey\(persistenceKey\)/u);
  assert.match(wizard, /onFinish\(final, sourceLevel\)/u);
  assert.match(wizard, /Canceling or closing it leaves the saved character unchanged/u);
  assert.match(wizard, /Roll \{plan\.to\}d6 for HP/u);
  assert.match(wizard, /Enter your \{plan\.to\}d6 total/u);
  assert.match(wizard, /hpRollMinimum/u);
  assert.match(wizard, /hpRollMaximum/u);
  assert.match(wizard, /HP dice total:/u);
  assert.match(wizard, /Traditional Education/u);
  assert.match(wizard, /Deep Apprehension/u);
  assert.match(sheet, /levelUpModeFromUrl/u);
  assert.match(sheet, /setLevelUpMode\(true\)/u);
  assert.match(sheet, /Number\(currentPayload\.version\) !== cloudVersion/u);
  assert.match(sheet, /Number\(currentPayload\.character\.level\) !== sourceLevel/u);
  assert.match(sheet, /Use the Level-Up Wizard to apply one legal level at a time/u);
});
