import assert from "node:assert/strict";
import test from "node:test";
import { searchRules } from "../app/rules-search.ts";

const benchmark = [
  ["What happens when I hit zero HP?", "Dropping to 0 Hit Points"],
  ["How do I save a companion who is dying?", "Stabilizing a Mortally Wounded Character"],
  ["How much damage do I take if I fall 30 feet?", "Falling"],
  ["How long can I hold my breath underwater?", "Suffocation"],
  ["How many hit points do I heal after sleeping?", "Natural Healing"],
  ["Can I bandage somebody to restore hit points?", "First Aid"],
  ["How do I leave melee without giving them a free attack?", "Fighting Withdrawal"],
  ["Do melee weapons still deal damage when they miss?", "Shock Damage"],
  ["What can I do on my turn in combat?", "Actions in Combat"],
  ["Can a mage cast a spell while wearing armor?", "Spellcasting and Armor"],
  ["How does an attribute modifier work?", "Attribute Modifiers"],
  ["What can I choose when my background says Any Combat?", "Background Skills"],
  ["How much Effort does a Partial class get?", "Classes and Effort"],
  ["When does Effort committed for the scene come back?", "Committing Effort"],
  ["Can my starting skills be above level 1?", "Gaining Skills in Character Creation"],
  ["What is the difference between a full class and a partial class?", "Full and Partial Classes"],
];

test("Rules Search Phase 2 benchmark returns the controlling rule first", async () => {
  for (const [question, expectedTitle] of benchmark) {
    assert.equal((await searchRules(question))[0]?.title, expectedTitle, question);
  }
});

test("segmented SRD results return the specific section rather than the whole parent document", async () => {
  const result = (await searchRules("How does an attribute modifier work?"))[0];
  assert.equal(result?.title, "Attribute Modifiers");
  assert.match(result?.source ?? "", /1\.1\.2/u);
  assert.match(result?.fullText ?? "", /modifier is added to skill checks/i);
  assert.doesNotMatch(result?.fullText ?? "", /Generating Attributes/u);
});

test("concept matches bring useful related rules alongside the controlling rule", async () => {
  const results = await searchRules("How do I save a companion who is dying?");
  const titles = results.map(result => result.title);
  assert.equal(titles[0], "Stabilizing a Mortally Wounded Character");
  assert.ok(titles.includes("Dropping to 0 Hit Points"));
  assert.ok(titles.includes("First Aid"));
});
