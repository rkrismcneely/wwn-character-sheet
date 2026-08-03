import assert from "node:assert/strict";
import test from "node:test";
import {
  artSlots,
  casterLimits,
  classRules,
  dualCasterLimits,
  invokerLimits,
  knownSpellSlots,
  partialClasses,
  traditionInfo,
  vowedProgression,
} from "../app/class-data.ts";
import { backgrounds } from "../app/background-data.ts";
import {
  activeBackgroundDevelopmentEntries,
  backgroundAttributeBonuses,
  blankBackgroundDevelopmentRoll,
  blankBackgroundDevelopmentRolls,
  blankBackgroundLearningPicks,
  normalizeBackgroundDevelopment,
  resolveBackgroundSkillGrants,
  rollBackgroundTable,
} from "../app/background-development.ts";
import { foci } from "../app/wwn-data.ts";
import { armorRestrictsMagic, deriveSkillProfile, deriveUnarmedAttack, explicitFocusSkillChoices, focusIsRepeatable, focusTargetAvailable, reconcileFamiliarSlots, storedRankForDisplayedSkillRank } from "../app/phase2-rules.ts";

test("SRD spell preparation and casting progressions", () => {
  assert.deepEqual(casterLimits(1, false), { max: 1, casts: 1, prepared: 3, arts: 2 });
  assert.deepEqual(casterLimits(10, false), { max: 5, casts: 6, prepared: 12, arts: 7 });
  assert.deepEqual(casterLimits(1, true), { max: 1, casts: 1, prepared: 2, arts: 1 });
  assert.deepEqual(dualCasterLimits(10), { max: 4, casts: 5, prepared: 15 });
});

test("SRD art progressions stay tradition-specific", () => {
  assert.equal(artSlots("High Mage", 2, true), 2);
  assert.equal(artSlots("Elementalist", 1, false), 3);
  assert.equal(artSlots("Necromancer", 2, false), 2);
  assert.equal(artSlots("Healer", 10, true), 8);
  assert.equal(artSlots("Vowed", 1, true), 4);
});

test("SRD starting and level-up spellbook sizes", () => {
  assert.equal(knownSpellSlots(["High Mage"], 1, false), 4);
  assert.equal(knownSpellSlots(["High Mage"], 4, true), 8);
  assert.equal(knownSpellSlots(["Necromancer"], 1, false), 4);
  assert.equal(knownSpellSlots(["Necromancer"], 4, true), 5);
  assert.equal(knownSpellSlots(["High Mage", "Necromancer"], 4, true), 10);
});

test("SRD base class attack and Focus progressions", () => {
  assert.equal(classRules("full", "Warrior", "", 10).attack, 10);
  assert.equal(classRules("full", "Expert", "", 10).attack, 5);
  assert.equal(classRules("full", "High Mage", "", 10).attack, 2);
  assert.equal(classRules("adventurer", "Warrior", "Expert", 10).attack, 7);
  assert.equal(classRules("full", "Warrior", "", 10).focusPicks, 6);
});

test("SRD additional partial classes expose their complete Art lists", () => {
  for (const name of ["Accursed", "Bard", "Beastmaster", "Blood Priest", "Duelist", "Mageslayer", "Skinshifter", "Thought Noble", "Wise"]) {
    assert.ok(partialClasses.includes(name), `${name} should be selectable`);
    assert.ok(traditionInfo[name].arts.length >= 10, `${name} should include its SRD Arts`);
  }
  assert.equal(artSlots("Accursed", 1, true), 2);
  assert.equal(artSlots("Bard", 10, true), 7);
  assert.equal(traditionInfo.Wise.usesEffort, false);
});

test("SRD substitute partial classes do not inherit unrelated bonus benefits", () => {
  assert.equal(classRules("adventurer", "Mageslayer", "Expert", 1).hitDice, "1d6");
  assert.equal(classRules("adventurer", "Duelist", "Warrior", 1).hitDice, "1d6");
  assert.equal(classRules("adventurer", "Bard", "High Mage", 1).focusPicks, 1);
});

test("SRD Invoker uses Intelligence-adjusted spell points and preparation", () => {
  assert.deepEqual(invokerLimits(1, false, 2), { max: 1, casts: 4, prepared: 4, arts: 0 });
  assert.deepEqual(invokerLimits(10, false, 2), { max: 5, casts: 13, prepared: 11, arts: 0 });
  assert.deepEqual(invokerLimits(10, true, 2), { max: 3, casts: 8, prepared: 9, arts: 0 });
  assert.ok(partialClasses.includes("Invoker"));
  assert.equal(knownSpellSlots(["Invoker"], 4, false), 10);
  assert.equal(knownSpellSlots(["Invoker"], 4, true), 5);
});

test("SRD backgrounds retain Quick Skills and the complete Growth and Learning tables", () => {
  assert.equal(Object.keys(backgrounds).length, 20);
  assert.deepEqual(backgrounds.Soldier.quickSkills, ["Exert-0", "Survive-0"]);
  assert.equal(backgrounds.Soldier.freeSkill, "Any Combat-0");
  assert.deepEqual(backgrounds.Artisan.growth, ["+1 Any Stat", "+2 Physical", "+2 Physical", "+2 Mental", "Exert", "Any Skill"]);
  assert.deepEqual(backgrounds.Scholar.learning, ["Administer", "Heal", "Craft", "Know", "Notice", "Perform", "Pray", "Convince"]);
  assert.equal(backgrounds.Slave.learning.filter(result => result === "Any Skill").length, 1);
});

test("Phase 2A Focus data exposes explicit combat choices", () => {
  assert.match(foci.find(focus => focus.name === "Close Combatant").level1, /any combat skill/i);
  assert.match(foci.find(focus => focus.name === "Shocking Assault").level1, /Punch or Stab/i);
  assert.match(foci.find(focus => focus.name === "Unarmed Combatant").level2, /unmodified 1d6/i);
  assert.deepEqual(explicitFocusSkillChoices("Close Combatant"), ["Punch", "Shoot", "Stab"]);
  assert.deepEqual(explicitFocusSkillChoices("Shocking Assault"), ["Punch", "Stab"]);
  assert.equal(armorRestrictsMagic(traditionInfo["High Mage"].armor), true);
  assert.equal(armorRestrictsMagic(traditionInfo.Invoker.armor), true);
  assert.equal(armorRestrictsMagic(traditionInfo.Vowed.armor), true);
  assert.equal(armorRestrictsMagic(traditionInfo.Healer.armor), false);
});

test("granted ranks and Polymath floors do not overwrite purchased ranks", () => {
  assert.deepEqual(deriveSkillProfile({ purchased: -1, sourceCount: 1 }), {
    purchased: -1, sourceCount: 1, sourceFloor: 0, granted: 0, polymathFloor: -1, effective: 0,
  });
  assert.equal(deriveSkillProfile({ purchased: 0, sourceCount: 1 }).effective, 1);
  assert.equal(deriveSkillProfile({ purchased: -1, sourceCount: 0, polymathFloor: 0 }).effective, 0);
  assert.equal(deriveSkillProfile({ purchased: 2, sourceCount: 0, polymathFloor: 1 }).effective, 2);
  // All Background sources use the same visible-rank conversion: Free Skill,
  // Quick Skills, chosen Learning, and rolled Growth/Learning results.
  assert.equal(storedRankForDisplayedSkillRank(0, 1), -1);
  assert.equal(storedRankForDisplayedSkillRank(1, 1), 0);
  assert.equal(storedRankForDisplayedSkillRank(1, 2), -1);
  assert.equal(storedRankForDisplayedSkillRank(2, 2), 0);
});

test("unarmed attacks apply default, Unarmed Combatant, Vowed, and Shock modifiers", () => {
  assert.deepEqual(deriveUnarmedAttack({
    baseAttack: 0, punchSkill: -1, physicalModifier: 1, warriorDamage: 0,
    shockingAssaultBonus: 0, shockThreshold: 15, unarmedCombatantLevel: 0,
  }), { hit: -1, damage: "1d2+1", shock: "None", note: "Permanent unarmed attack" });
  assert.deepEqual(deriveUnarmedAttack({
    baseAttack: 1, punchSkill: 1, physicalModifier: 1, warriorDamage: 0,
    shockingAssaultBonus: 0, shockThreshold: 15, unarmedCombatantLevel: 1,
  }), { hit: 3, damage: "1d8+1", shock: "2/AC 15", note: "Unarmed Combatant progression" });
  assert.deepEqual(deriveUnarmedAttack({
    baseAttack: 3, punchSkill: 2, physicalModifier: 1, warriorDamage: 2,
    shockingAssaultBonus: 2, shockThreshold: 10, unarmedCombatantLevel: 2,
  }), { hit: 6, damage: "1d10+3", shock: "7/AC 10", note: "On a miss: unmodified 1d6 damage + any applicable Shock." });
  assert.deepEqual(
    { hit: vowedProgression[2].hit, damage: vowedProgression[2].damage, shock: vowedProgression[2].shock },
    { hit: 1, damage: "1d8", shock: "2/15" },
  );
  assert.deepEqual(deriveUnarmedAttack({
    baseAttack: 0, punchSkill: 1, physicalModifier: 1, warriorDamage: 0,
    shockingAssaultBonus: 2, shockThreshold: 10, unarmedCombatantLevel: 2,
    vowedProgression: vowedProgression[2], magicalVowedAttack: true,
  }), { hit: 3, damage: "1d8+2", shock: "5/AC 10", note: "Vowed Unarmed Might · magical attack" });
});

test("repeatable Spirit Familiar Focus rows retain distinct familiar records", () => {
  const active = [{ id: "first", focusSlot: 0, name: "Ash" }, { id: "second", focusSlot: 1, name: "Bramble" }];
  const archived = [{ id: "third", focusSlot: 2, name: "Cinder" }];
  const mapped = reconcileFamiliarSlots(active, archived, [1, 2, 3], (focusSlot, index) => ({ id: `new-${index}`, focusSlot, name: "" }));
  assert.deepEqual(mapped.map(item => item.id), ["second", "third", "new-2"]);
  assert.deepEqual(mapped.map(item => item.focusSlot), [1, 2, 3]);
});

test("repeatable Specialist and Developed Attribute targets stay distinct", () => {
  const picks = [
    { name: "Developed Attribute", choice: "STR" },
    { name: "Specialist", choice: "Craft" },
  ];
  assert.equal(focusTargetAvailable(picks, "Developed Attribute", "STR", 2), false);
  assert.equal(focusTargetAvailable(picks, "Developed Attribute", "DEX", 2), true);
  assert.equal(focusTargetAvailable(picks, "Specialist", "Craft", 2), false);
  assert.equal(focusTargetAvailable(picks, "Specialist", "Know", 2), true);
  assert.equal(focusIsRepeatable("Developed Attribute"), true);
  assert.equal(focusIsRepeatable("Specialist"), true);
  assert.equal(focusIsRepeatable("Spirit Familiar"), true);
  assert.equal(focusIsRepeatable("Polymath"), false);
});

test("Background Development keeps Quick, chosen Learning, and rolled methods mutually exclusive", () => {
  for (const [backgroundName, background] of Object.entries(backgrounds)) {
    const quick = activeBackgroundDevelopmentEntries(backgroundName, {
      backgroundDevelopmentMethod: "quick",
      backgroundLearningPicks: blankBackgroundLearningPicks(),
      backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
    });
    assert.deepEqual(quick.map(entry => entry.result), background.quickSkills, `${backgroundName} Quick Skills should remain distinct`);
  }

  const chosen = activeBackgroundDevelopmentEntries("Scholar", {
    backgroundDevelopmentMethod: "choose-learning",
    backgroundLearningPicks: [{ result: "Craft", choice: "" }, { result: "Notice", choice: "" }],
    backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
  });
  assert.deepEqual(chosen.map(entry => entry.result), ["Craft", "Notice"]);

  const chosenDuplicate = activeBackgroundDevelopmentEntries("Scholar", {
    backgroundDevelopmentMethod: "choose-learning",
    backgroundLearningPicks: [{ result: "Craft", choice: "" }, { result: "Craft", choice: "" }],
    backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
  });
  assert.deepEqual(chosenDuplicate.map(entry => entry.result), ["Craft", "Craft"]);

  const rolls = [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 1, result: "+1 Any Stat" },
    { ...blankBackgroundDevelopmentRoll("learning"), die: 1, result: "Connect" },
    { ...blankBackgroundDevelopmentRoll("learning"), die: 8, result: "Trade" },
  ];
  const rolled = activeBackgroundDevelopmentEntries("Artisan", {
    backgroundDevelopmentMethod: "roll-growth-learning",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: rolls,
  });
  assert.deepEqual(rolled.map(entry => entry.source), [
    "Artisan Background: Growth 1",
    "Artisan Background: Learning 2",
    "Artisan Background: Learning 3",
  ]);
  const allGrowth = activeBackgroundDevelopmentEntries("Artisan", {
    backgroundDevelopmentMethod: "roll-growth-learning",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: [
      { ...blankBackgroundDevelopmentRoll("growth"), die: 1, result: "+1 Any Stat" },
      { ...blankBackgroundDevelopmentRoll("growth"), die: 2, result: "+2 Physical" },
      { ...blankBackgroundDevelopmentRoll("growth"), die: 4, result: "+2 Mental" },
    ],
  });
  assert.deepEqual(allGrowth.map(entry => entry.source), [
    "Artisan Background: Growth 1",
    "Artisan Background: Growth 2",
    "Artisan Background: Growth 3",
  ]);
  const allLearning = activeBackgroundDevelopmentEntries("Artisan", {
    backgroundDevelopmentMethod: "roll-growth-learning",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: [
      { ...blankBackgroundDevelopmentRoll("learning"), die: 1, result: "Connect" },
      { ...blankBackgroundDevelopmentRoll("learning"), die: 2, result: "Convince" },
      { ...blankBackgroundDevelopmentRoll("learning"), die: 8, result: "Trade" },
    ],
  });
  assert.deepEqual(allLearning.map(entry => entry.source), [
    "Artisan Background: Learning 1",
    "Artisan Background: Learning 2",
    "Artisan Background: Learning 3",
  ]);
  assert.equal(activeBackgroundDevelopmentEntries("Artisan", {
    backgroundDevelopmentMethod: "review",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: rolls,
  }).length, 0);
});

test("Background Learning and rolled Any results obey character-creation acquisition limits", () => {
  const skillList = ["Craft", "Notice", "Punch", "Shoot", "Stab", "Magic"];
  const duplicateResults = resolveBackgroundSkillGrants([
    { id: "free", result: "Craft", source: "Free" },
    { id: "learning-1", result: "Craft", source: "Learning 1" },
    { id: "learning-2", result: "Craft", source: "Learning 2" },
  ], skillList, ["Punch", "Shoot", "Stab"]);
  assert.equal(duplicateResults[0].resolvedSkill, "Craft");
  assert.equal(duplicateResults[1].resolvedSkill, "Craft");
  assert.equal(duplicateResults[2].needsReplacement, true);
  assert.equal(duplicateResults[2].resolvedSkill, "");

  const replacement = resolveBackgroundSkillGrants([
    { id: "free", result: "Craft", source: "Free" },
    { id: "learning-1", result: "Craft", source: "Learning 1" },
    { id: "learning-2", result: "Craft", source: "Learning 2", replacement: "Notice" },
  ], skillList, ["Punch", "Shoot", "Stab"]);
  assert.equal(replacement[2].resolvedSkill, "Notice");
  assert.equal(replacement[2].needsReplacement, false);

  const anyResults = resolveBackgroundSkillGrants([
    { id: "combat-pending", result: "Any Combat", source: "Learning" },
    { id: "combat", result: "Any Combat", choice: "Shoot", source: "Learning" },
    { id: "any-skill", result: "Any Skill", choice: "Magic", source: "Growth" },
  ], skillList, ["Punch", "Shoot", "Stab"]);
  assert.equal(anyResults[0].needsChoice, true);
  assert.equal(anyResults[1].resolvedSkill, "Shoot");
  assert.equal(anyResults[2].resolvedSkill, "Magic");
  for (const combatSkill of ["Punch", "Shoot", "Stab"]) {
    const [combat] = resolveBackgroundSkillGrants([
      { id: `combat-${combatSkill}`, result: "Any Combat", choice: combatSkill, source: "Learning" },
    ], skillList, ["Punch", "Shoot", "Stab"]);
    assert.equal(combat.resolvedSkill, combatSkill);
  }
});

test("Background Growth uses the selected table die and applies legal attribute point assignments", () => {
  assert.deepEqual(rollBackgroundTable("Artisan", "growth", () => 0), {
    table: "growth", die: 1, result: "+1 Any Stat", choice: "", replacement: "", attributeChoices: [],
  });
  assert.deepEqual(rollBackgroundTable("Artisan", "learning", () => 0.9999), {
    table: "learning", die: 8, result: "Trade", choice: "", replacement: "", attributeChoices: [],
  });

  const base = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 1, result: "+1 Any Stat", attributeChoices: ["CHA"] },
  ], base), { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 1 });
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 2, result: "+2 Physical", attributeChoices: ["STR", "STR"] },
  ], base), { STR: 2, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 2, result: "+2 Physical", attributeChoices: ["DEX", "CON"] },
  ], base), { STR: 0, DEX: 1, CON: 1, INT: 0, WIS: 0, CHA: 0 });
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 4, result: "+2 Mental", attributeChoices: ["INT", "INT"] },
  ], base), { STR: 0, DEX: 0, CON: 0, INT: 2, WIS: 0, CHA: 0 });
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 4, result: "+2 Mental", attributeChoices: ["WIS", "CHA"] },
  ], base), { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 1, CHA: 1 });
  assert.deepEqual(backgroundAttributeBonuses("Artisan", "roll-growth-learning", [
    { ...blankBackgroundDevelopmentRoll("growth"), die: 2, result: "+2 Physical", attributeChoices: ["STR", "STR"] },
  ], { ...base, STR: 18 }), { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 });
});

test("Background Development migration preserves safe data and flags ambiguous combined records", () => {
  const rolledOnly = normalizeBackgroundDevelopment({
    backgroundSkillMode: "growth",
    backgroundGrowthRolls: [2, 3, 4],
    backgroundGrowthChoices: ["STR", "DEX", "INT"],
    backgroundLearningPicks: [{ result: "" }, { result: "" }],
  }, "Barbarian");
  assert.equal(rolledOnly.backgroundDevelopmentMethod, "roll-growth-learning");
  assert.deepEqual(rolledOnly.backgroundDevelopmentRolls[0].attributeChoices, ["STR", "STR"]);
  assert.deepEqual(rolledOnly.backgroundDevelopmentRolls[1].attributeChoices, ["DEX", "DEX"]);
  assert.deepEqual(rolledOnly.backgroundDevelopmentRolls[2].attributeChoices, ["INT", "INT"]);

  const learningOnly = normalizeBackgroundDevelopment({
    backgroundSkillMode: "growth",
    backgroundGrowthRolls: [0, 0, 0],
    backgroundLearningPicks: [{ result: "Connect" }, { result: "Convince" }],
  }, "Artisan");
  assert.equal(learningOnly.backgroundDevelopmentMethod, "choose-learning");
  assert.deepEqual(learningOnly.backgroundLearningPicks.map(pick => pick.result), ["Connect", "Convince"]);

  const combined = normalizeBackgroundDevelopment({
    backgroundSkillMode: "growth",
    backgroundGrowthRolls: [1, 2, 6],
    backgroundGrowthChoices: ["CHA", "STR", "Magic"],
    backgroundLearningPicks: [{ result: "Connect" }, { result: "Craft" }],
  }, "Artisan");
  assert.equal(combined.backgroundDevelopmentMethod, "review");
  assert.equal(combined.backgroundDevelopmentLegacy?.reason, "combined-growth-learning");
  assert.deepEqual(combined.backgroundDevelopmentLegacy?.learningPicks.map(pick => pick.result), ["Connect", "Craft"]);

  const invalidChosenAnySkill = normalizeBackgroundDevelopment({
    backgroundDevelopmentMethod: "choose-learning",
    backgroundLearningPicks: [{ result: "Any Skill", choice: "Magic" }, { result: "Work" }],
    backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
  }, "Laborer");
  assert.equal(invalidChosenAnySkill.backgroundDevelopmentMethod, "review");
  assert.equal(invalidChosenAnySkill.backgroundDevelopmentLegacy?.reason, "invalid-chosen-any-skill");

  const savedRolls = normalizeBackgroundDevelopment({
    backgroundDevelopmentMethod: "roll-growth-learning",
    backgroundCombatSkill: "Punch",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: [
      { table: "growth", die: 2, result: "+2 Physical", attributeChoices: ["STR", "DEX"] },
      { table: "learning", die: 1, result: "Any Combat", choice: "Stab" },
      { table: "growth", die: 6, result: "Any Skill", choice: "Magic" },
    ],
  }, "Barbarian");
  assert.equal(savedRolls.backgroundDevelopmentMethod, "roll-growth-learning");
  assert.deepEqual(savedRolls.backgroundDevelopmentRolls[0].attributeChoices, ["STR", "DEX"]);
  assert.equal(savedRolls.backgroundDevelopmentRolls[1].choice, "Stab");
  assert.equal(savedRolls.backgroundDevelopmentRolls[2].choice, "Magic");

  const tamperedResult = normalizeBackgroundDevelopment({
    backgroundDevelopmentMethod: "roll-growth-learning",
    backgroundLearningPicks: blankBackgroundLearningPicks(),
    backgroundDevelopmentRolls: [
      { table: "learning", die: 1, result: "Trade", choice: "Punch" },
      blankBackgroundDevelopmentRoll(),
      blankBackgroundDevelopmentRoll(),
    ],
  }, "Barbarian");
  assert.equal(tamperedResult.backgroundDevelopmentRolls[0].result, "Any Combat");
});
