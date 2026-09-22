import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  advancementClassPerDieBonus,
  advancementFocusOptionLabel,
  advancementPlan,
  advancementSkillCreditBySkill,
  attributeBoostLimitAtLevel,
  levelUpHitPointRollBounds,
  levelUpHitPointTotal,
  legalAdvancementFocuses,
  skillAdvancementCost,
  skillRankCapAtLevel,
  validLevelUpHitPointRoll,
} from "../app/level-advancement.ts";
import {
  deriveSkillProfile,
  focusSelectionCost,
  inferFocusAdvancementFlags,
  reconcileSpiritFamiliarHitPoints,
  spiritFamiliarBenefitLimit,
  spiritFamiliarLevelTwoSelectionLimit,
  spiritFamiliarMaximumHitPoints,
  storedRankForDisplayedSkillRank,
} from "../app/phase2-rules.ts";
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

test("advancement Focus labels describe the action at every future Focus opportunity", () => {
  assert.equal(
    advancementFocusOptionLabel(base({ focusPicks: [] }), "Alert"),
    "Alert — new Level 1",
  );
  assert.equal(
    advancementFocusOptionLabel(base({ focusPicks: [{ name: "Alert", level: 1 }] }), "Alert"),
    "Alert — upgrade to Level 2",
  );
  assert.equal(
    advancementFocusOptionLabel(base({ focusPicks: [{ name: "Spirit Familiar", level: 1 }] }), "Spirit Familiar"),
    "Spirit Familiar — upgrade to Level 2",
  );
  for (const level of [1, 4, 6, 9]) {
    assert.equal(
      advancementFocusOptionLabel(base({
        level,
        focusPicks: [{ name: "Spirit Familiar", level: 2 }],
      }), "Spirit Familiar"),
      "Spirit Familiar — add another Level 2",
    );
  }
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
      assert.equal(plan.artPicks, plan.artGrants.reduce((total, grant) => total + grant.count, 0));
    }
  }
  for (const classOne of partialClasses) for (const classTwo of partialClasses) {
    if (!creationPartialClassPairIsLegal(classOne, classTwo)) continue;
    for (let level = 1; level <= 10; level += 1) {
      const plan = advancementPlan(base({ level, classMode: "adventurer", classOne, classTwo }));
      assert.ok(plan.skillPoints >= 3, `${classOne}/${classTwo} at level ${level}`);
      assert.ok(plan.artPicks >= 0 && plan.spellPicks >= 0, `${classOne}/${classTwo} at level ${level}`);
      assert.equal(plan.artPicks, plan.artGrants.reduce((total, grant) => total + grant.count, 0));
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

test("skill advancement charges each new displayed rank at its increasing SRD cost", () => {
  assert.equal(skillAdvancementCost(-1, 0), 1);
  assert.equal(skillAdvancementCost(0, 1), 2);
  assert.equal(skillAdvancementCost(1, 2), 3);
  assert.equal(skillAdvancementCost(2, 3), 4);
  assert.equal(skillAdvancementCost(3, 4), 5);
  assert.equal(skillAdvancementCost(0, 2), 5, "multi-rank increases pay for each intermediate level");
  assert.equal(skillAdvancementCost(0, 2, 3), 2, "a new Focus credit offsets literal skill points, not rank gates");
});

test("partial-class Art grants stay attached to the tradition that earned them", () => {
  const dualMage = advancementPlan(base({
    level: 2,
    classMode: "adventurer",
    classOne: "High Mage",
    classTwo: "Necromancer",
  }));
  assert.deepEqual(
    dualMage.artGrants.map(({ tradition, count }) => ({ tradition, count })),
    [
      { tradition: "High Mage", count: 1 },
      { tradition: "Necromancer", count: 1 },
    ],
  );
  assert.equal(dualMage.artPicks, 2);
});

test("Mageslayer advancement exposes the fixed Arts from its class table", () => {
  const levelTwo = advancementPlan(base({
    level: 1,
    classMode: "adventurer",
    classOne: "Mageslayer",
    classTwo: "Warrior",
  }));
  assert.equal(levelTwo.artGrants.length, 1);
  assert.equal(levelTwo.artGrants[0].tradition, "Mageslayer");
  assert.equal(levelTwo.artGrants[0].count, 2);
  assert.deepEqual([...levelTwo.artGrants[0].fixedArts].sort(), ["Spellshield", "Witchfinder"]);
  const levelThree = advancementPlan(base({
    level: 2,
    classMode: "adventurer",
    classOne: "Mageslayer",
    classTwo: "Warrior",
  }));
  assert.deepEqual(levelThree.artGrants[0].fixedArts, ["Disrupt Sorcery"]);
});

test("HP reroll keeps the better total and otherwise grants one", () => {
  assert.equal(levelUpHitPointTotal(12, 5, 2, 0, 2, false), 13);
  assert.equal(levelUpHitPointTotal(12, 11, 2, 0, 2, false), 15);
  assert.equal(levelUpHitPointTotal(8, 2, 2, -2, -1, false), 9);
  assert.equal(advancementClassPerDieBonus(base({ classOne: "Warrior" })), 2);
  assert.equal(advancementClassPerDieBonus(base({ classOne: "High Mage" })), -1);
});

test("Level-Up HP raw totals share bounded validation and canonical calculation", () => {
  assert.deepEqual(levelUpHitPointRollBounds(6), { minimum: 6, maximum: 36 });
  assert.equal(validLevelUpHitPointRoll(6, 6), true);
  assert.equal(validLevelUpHitPointRoll(36, 6), true);
  assert.equal(validLevelUpHitPointRoll(5, 6), false);
  assert.equal(validLevelUpHitPointRoll(37, 6), false);
  assert.equal(levelUpHitPointTotal(18, 24, 6, 1, 2, false), 42);
});

test("advancement Focus bonus skill credit is separate from paid skill ranks", () => {
  const character = base({ focusPicks: [{ name: "Armsmaster", level: 1, advancement: true }] });
  assert.deepEqual(advancementSkillCreditBySkill(character), { Stab: 3 });
  assert.equal(deriveSkillProfile({ purchased: -1, sourceCount: 0, credit: 3 }).effective, 1);
  assert.equal(deriveSkillProfile({ purchased: 1, sourceCount: 0, credit: 3 }).effective, 2);
});

test("direct multi-level Focus rows infer advancement credit after the starting Foci", () => {
  const picks = inferFocusAdvancementFlags([
    { name: "Armsmaster", level: 1 },
    { name: "Alert", level: 1 },
    { name: "Unarmed Combatant", level: 1 },
  ], 2);
  assert.deepEqual(
    picks.map((pick) => pick.advancement),
    [false, false, true],
  );

  const character = base({
    level: 5,
    focusPicks: [
      { name: "Armsmaster", level: 1 },
      { name: "Alert", level: 1 },
      { name: "Unarmed Combatant", level: 1 },
    ],
  });
  assert.deepEqual(
    advancementSkillCreditBySkill(character),
    { Punch: 3 },
    "the third Warrior Focus is an advancement Focus even when five levels are filled in directly",
  );
});

test("Focus bonus-skill credit cannot rewrite or refund a paid skill rank", () => {
  const paidPunchZero = 0;
  const withFocus = deriveSkillProfile({
    purchased: paidPunchZero,
    sourceCount: 0,
    credit: 3,
  });
  assert.equal(withFocus.granted, 0);
  assert.equal(withFocus.effective, 1);
  assert.equal(withFocus.creditRemaining, 1);

  const withoutFocus = deriveSkillProfile({
    purchased: paidPunchZero,
    sourceCount: 0,
  });
  assert.equal(withoutFocus.granted, 0);
  assert.equal(withoutFocus.effective, 0);

  const restoredFocus = deriveSkillProfile({
    purchased: paidPunchZero,
    sourceCount: 0,
    credit: 3,
  });
  assert.equal(restoredFocus.granted, 0);
  assert.equal(restoredFocus.effective, 1);
  assert.equal(restoredFocus.creditRemaining, 1);

  assert.equal(
    storedRankForDisplayedSkillRank(0, 0),
    paidPunchZero,
    "the trained Punch-0 selection remains Punch-0 regardless of Focus credit",
  );
  assert.equal(
    skillAdvancementCost(0, 1),
    2,
    "two later normal points combine with the banked Focus point to reach Punch-2 effectively",
  );
  const afterTwoMoreNormalPoints = deriveSkillProfile({
    purchased: 1,
    sourceCount: 0,
    credit: 3,
  });
  assert.equal(afterTwoMoreNormalPoints.granted, 1);
  assert.equal(afterTwoMoreNormalPoints.effective, 2);
  assert.equal(afterTwoMoreNormalPoints.creditRemaining, 0);
});

test("skill controls edit trained rank rather than Focus-adjusted effective rank", async () => {
  const [sheet, wizard] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/level-up-wizard-impl.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(sheet, /value=\{profile\.granted\}/u);
  assert.match(
    sheet,
    /storedRankForDisplayedSkillRank\(rank, profile\.sourceCount\)/u,
  );
  assert.doesNotMatch(
    sheet,
    /storedRankForDisplayedSkillRank\(rank, profile\.sourceCount, profile\.credit\)/u,
  );
  assert.match(sheet, /creditRemaining/u);
  assert.match(sheet, /inferFocusAdvancementFlags\(nextPicks, startingFocusSelections\)/u);

  assert.match(wizard, /value=\{profile\.granted\}/u);
  assert.match(
    wizard,
    /storedRankForDisplayedSkillRank\(selected, profile\.sourceCount\)/u,
  );
  assert.doesNotMatch(
    wizard,
    /storedRankForDisplayedSkillRank\(selected, profile\.sourceCount, profile\.credit\)/u,
  );
  assert.match(wizard, /skillSpendForRank\(skill, profile\.granted\)/u);
  assert.match(wizard, /baselineProfile\.granted/u);
  assert.match(wizard, /creditRemaining/u);
});

test("Focus options respect existing Focus levels and class restrictions", () => {
  const warriorOptions = legalAdvancementFocuses(base({ focusPicks: [{ name: "Alert", level: 1 }] }));
  assert.ok(warriorOptions.some((focus) => focus.name === "Alert"));
  const mageOptions = legalAdvancementFocuses(base({ classOne: "High Mage" }));
  assert.ok(!mageOptions.some((focus) => focus.name === "Developed Attribute"));
  assert.ok(!mageOptions.some((focus) => focus.name === "Nullifier"));
});

test("Spirit Familiar level two can repeat for one pick and unlocks two benefits each time", () => {
  assert.equal(focusSelectionCost([{ name: "Spirit Familiar", level: 1 }]), 1);
  assert.equal(focusSelectionCost([{ name: "Spirit Familiar", level: 2 }]), 2);
  assert.equal(focusSelectionCost([
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
  ]), 3);
  assert.equal(focusSelectionCost([
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
  ]), 4);

  assert.equal(spiritFamiliarBenefitLimit([{ name: "Spirit Familiar", level: 1 }]), 0);
  assert.equal(spiritFamiliarBenefitLimit([{ name: "Spirit Familiar", level: 2 }]), 2);
  assert.equal(spiritFamiliarBenefitLimit([
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
  ]), 4);
  assert.equal(spiritFamiliarBenefitLimit([
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
    { name: "Spirit Familiar", level: 2 },
  ]), 6);

  assert.equal(spiritFamiliarLevelTwoSelectionLimit(1), 1);
  assert.equal(spiritFamiliarLevelTwoSelectionLimit(2), 2);
  assert.equal(spiritFamiliarLevelTwoSelectionLimit(4), 2);
  assert.equal(spiritFamiliarLevelTwoSelectionLimit(5), 3);
  assert.equal(spiritFamiliarLevelTwoSelectionLimit(7), 3);
  assert.equal(spiritFamiliarLevelTwoSelectionLimit(10), 3);
});

test("Spirit Familiar is offered again on later Focus opportunities after level two", () => {
  const levelTwoUpgrade = legalAdvancementFocuses(base({
    level: 1,
    focusPicks: [{ name: "Spirit Familiar", level: 1 }],
  }));
  assert.ok(levelTwoUpgrade.some((focus) => focus.name === "Spirit Familiar"));

  const levelTwoRepeatAfterCreation = legalAdvancementFocuses(base({
    level: 1,
    focusPicks: [{ name: "Spirit Familiar", level: 2 }],
  }));
  assert.ok(
    levelTwoRepeatAfterCreation.some((focus) => focus.name === "Spirit Familiar"),
    "a character who bought Spirit Familiar 2 at creation can buy level 2 again with the level-2 Focus pick",
  );

  const levelFiveRepeat = legalAdvancementFocuses(base({
    level: 4,
    focusPicks: [{ name: "Spirit Familiar", level: 2 }],
  }));
  assert.ok(levelFiveRepeat.some((focus) => focus.name === "Spirit Familiar"));

  const levelSevenRepeat = legalAdvancementFocuses(base({
    level: 6,
    focusPicks: [
      { name: "Spirit Familiar", level: 2 },
      { name: "Spirit Familiar", level: 2 },
    ],
  }));
  assert.ok(levelSevenRepeat.some((focus) => focus.name === "Spirit Familiar"));

  const exhaustedBenefits = legalAdvancementFocuses(base({
    level: 9,
    focusPicks: [
      { name: "Spirit Familiar", level: 2 },
      { name: "Spirit Familiar", level: 2 },
      { name: "Spirit Familiar", level: 2 },
    ],
  }));
  assert.ok(!exhaustedBenefits.some((focus) => focus.name === "Spirit Familiar"));
});

test("Spirit Familiar maximum HP tracks level and preserves damage when the maximum rises", () => {
  assert.equal(spiritFamiliarMaximumHitPoints(1, false), 1);
  assert.equal(spiritFamiliarMaximumHitPoints(2, false), 2);
  assert.equal(spiritFamiliarMaximumHitPoints(2, true), 6);
  assert.equal(spiritFamiliarMaximumHitPoints(10, true), 30);

  assert.deepEqual(
    reconcileSpiritFamiliarHitPoints(1, 1, 2),
    { current: 2, maximum: 2 },
    "a healthy familiar stays healthy when leveling",
  );
  assert.deepEqual(
    reconcileSpiritFamiliarHitPoints(1, 2, 6),
    { current: 5, maximum: 6 },
    "existing damage is preserved when the 3x HP benefit raises maximum HP",
  );
  assert.deepEqual(
    reconcileSpiritFamiliarHitPoints(2, 2, 6),
    { current: 6, maximum: 6 },
    "an undamaged familiar remains at full HP when the benefit is selected",
  );
  assert.deepEqual(
    reconcileSpiritFamiliarHitPoints(0, 2, 6),
    { current: 0, maximum: 6 },
    "a slain familiar is not silently revived by a maximum-HP increase",
  );
  assert.deepEqual(
    reconcileSpiritFamiliarHitPoints(5, 6, 2),
    { current: 2, maximum: 2 },
    "lowering the maximum clamps current HP without creating extra damage",
  );
});

test("Spirit Familiar UI enforces benefit caps and lifecycle behavior", async () => {
  const [sheet, wizard] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/level-up-wizard-impl.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /spiritFamiliarBenefitCap = spiritFamiliarBenefitLimit\(sheet\.focusPicks\)/u);
  assert.match(
    sheet,
    /\(sheet\.level < 2 && pick\.name !== "Spirit Familiar"\)/u,
    "Spirit Familiar level 2 remains selectable at level 1 when the Focus-pick budget can pay for it",
  );
  assert.match(sheet, /Choose \{spiritFamiliarBenefitCap\}/u);
  assert.match(sheet, /activeFamiliarBenefits\.length >= spiritFamiliarBenefitCap/u);
  assert.match(sheet, /disabled=\{atLimit \|\| !canEdit\}/u);
  assert.match(sheet, /Lvl 2 repeat/u);
  assert.match(sheet, /const nextFamiliars = primarySpiritFocusSlot === undefined/u);
  assert.match(sheet, /existingSpiritRepeat && Number\(currentPick\?\.level\) < 2/u);
  assert.match(sheet, /reconcileSpiritFamiliarHitPoints/u);
  assert.match(sheet, /familiarAdditionalShape/u);
  assert.match(sheet, /hover\/fly/u);
  assert.match(sheet, /companions: current\.companions\.map\(resetFamiliarRefresh\)/u);
  assert.match(sheet, /archivedCompanions: current\.archivedCompanions\.map\(resetFamiliarRefresh\)/u);
  assert.match(wizard, /advancementFocusOptionLabel\(sheet as AdvancementCharacter, focus\.name\)/u);
  assert.match(wizard, /<strong>\{selectedFocusActionLabel\}<\/strong>/u);
  assert.match(wizard, /Each level-2 purchase unlocks two more benefit boxes/u);
});

test("Level-Up Wizard remains transactional, URL-addressable, and version-guarded", async () => {
  const [wizard, sheet, css] = await Promise.all([
    readFile(new URL("../app/level-up-wizard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-creation-wizard.css", import.meta.url), "utf8"),
  ]);
  assert.match(wizard, /window\.sessionStorage\.setItem\(storageKey\(persistenceKey\)/u);
  assert.match(wizard, /window\.sessionStorage\.removeItem\(storageKey\(persistenceKey\)\)/u);
  assert.match(wizard, /onFinish\(final, sourceLevel\)/u);
  assert.match(wizard, /Canceling discards the draft/u);
  assert.match(wizard, /onClick=\{cancel\}>Cancel level-up/u);
  assert.match(wizard, /setState\(\{ sourceLevel, step: 0, draft: clone\(sheet\) \}\)/u);
  assert.match(wizard, /Roll \{plan\.to\}d6 for HP/u);
  assert.match(wizard, /Enter physical dice total/u);
  assert.match(wizard, /hpRollMinimum/u);
  assert.match(wizard, /hpRollMaximum/u);
  assert.match(wizard, /HP dice total:/u);
  assert.match(wizard, /type="number"[\s\S]*aria-describedby="level-up-hp-range"/u);
  assert.match(wizard, /className="level-up-hp-controls"[\s\S]*className="level-up-hp-manual-input"/u);
  assert.doesNotMatch(wizard, /level-up-hp-entry[\s\S]*creation-roll-entry/u);
  assert.match(wizard, /Legal raw total: \{hpRollMinimum\}–\{hpRollMaximum\}/u);
  assert.match(wizard, /disabled=\{hpRollComplete\}/u);
  assert.match(wizard, /Clear HP total/u);
  assert.match(wizard, /aria-label="Clear HP dice total"/u);
  assert.match(wizard, /hpRoll: undefined/u);
  assert.match(wizard, /Traditional Education/u);
  assert.match(wizard, /forcedArtsForTraditions/u);
  assert.match(wizard, /plan\.artGrants/u);
  assert.match(wizard, /art\.tradition !== requirement\.tradition/u);
  assert.match(wizard, /Required Art · \$\{artSelectionName\(requiredArt\)\}/u);
  assert.match(wizard, /Mandatory starting Arts are enforced automatically/u);
  assert.match(wizard, /Deep Apprehension/u);
  assert.match(wizard, /skillAdvancementCost/u);
  assert.match(wizard, /rank >= minimumRank/u);
  assert.match(wizard, /boosts <= baselineBoostsForAttribute/u);
  assert.match(sheet, /levelUpModeFromUrl/u);
  assert.match(sheet, /setLevelUpMode\(true\)/u);
  assert.match(sheet, /Number\(currentPayload\.version\) !== cloudVersion/u);
  assert.match(sheet, /Number\(currentPayload\.character\.level\) !== sourceLevel/u);
  assert.match(sheet, /Use the Level-Up Wizard to apply one legal level at a time/u);
  assert.match(wizard, /className="level-up-attribute-card"/u);
  assert.match(wizard, /className="level-up-skill-field"/u);
  assert.match(wizard, /aria-label=\{`Increase \$\{attribute\}`\}/u);
  assert.match(wizard, /aria-label=\{`Decrease \$\{attribute\}`\}/u);
  assert.match(wizard, /aria-label=\{`\$\{skill\} advancement rank`\}/u);
  assert.match(css, /\.level-up-attributes-grid\s*\{[\s\S]*?repeat\(3/u);
  assert.match(css, /\.level-up-skills-grid\s*\{[\s\S]*?repeat\(3/u);
  assert.match(css, /\.level-up-attribute-controls button\s*\{[\s\S]*?width:\s*40px/u);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?level-up-skills-grid[\s\S]*?repeat\(2/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?level-up-skills-grid[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?level-up-attributes-grid[\s\S]*?grid-template-columns: 1fr/u);
  assert.match(css, /\.level-up-hp-controls\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(8rem, 12rem\)/u);
  assert.match(css, /\.level-up-hp-manual-input\s*\{[\s\S]*?border:\s*1px/u);
  assert.match(css, /\.level-up-hp-controls > \.primary-button\s*\{[\s\S]*?grid-row:\s*2/u);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.level-up-hp-controls\s*\{[\s\S]*?grid-template-columns:\s*1fr/u);
  assert.match(css, /\.level-up-hp-result\s*\{[\s\S]*?display:\s*grid/u);
});
