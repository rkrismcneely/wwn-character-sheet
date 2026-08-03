import assert from "node:assert/strict";
import test from "node:test";
import { searchRules } from "../app/rules-search.ts";

test("natural-language zero HP question prioritizes the injury rule", () => {
  assert.equal(searchRules("What happens at 0 HP?")[0]?.title, "Dropping to 0 Hit Points");
});

test("exact option names return their SRD entries", () => {
  assert.equal(searchRules("Velocitous Imbuement")[0]?.title, "Velocitous Imbuement");
  assert.equal(searchRules("Henchkeeper level 2")[0]?.title, "Henchkeeper · Level 2");
});

test("common rules aliases find the intended rule", () => {
  assert.equal(searchRules("How do I disengage from melee?")[0]?.title, "Fighting Withdrawal");
});

test("falling questions find the core hazard rule instead of incidental option text", () => {
  for (const question of ["falling", "fall damage", "What happens if I fell 30 feet?", "damage from a fall"]) {
    assert.equal(searchRules(question)[0]?.title, "Falling", question);
  }
});

test("inflections and common-language hazard aliases find the core rule", () => {
  assert.equal(searchRules("How long can I hold my breath?")[0]?.title, "Suffocation");
  assert.equal(searchRules("How does natural recovery work?")[0]?.title, "Natural Healing");
  assert.equal(searchRules("Can I bandage someone?")[0]?.title, "First Aid");
});

test("the complete SRD corpus is searchable beyond hand-authored core topics", () => {
  for (const [question, expectedTitle] of [
    ["Encumbrance", "Encumbrance"],
    ["dungeon exploration", "Dungeon Exploration"],
    ["faction turn", "The Faction Turn"],
    ["major projects", "Major Projects"],
    ["creating magic items", "Creating Magic Items"],
    ["reaction rolls", "Reaction Rolls & Parleying"],
  ]) {
    assert.equal(searchRules(question)[0]?.title, expectedTitle, question);
  }
});

test("search results retain the complete source section behind their excerpt", () => {
  const result = searchRules("Encumbrance")[0];
  assert.ok(result);
  assert.ok(result.fullText);
  assert.ok(result.fullText.length >= result.text.length);
  assert.match(result.fullText, /Encumbrance/i);
});

test("short weapon-trait aliases do not hijack natural-language questions", () => {
  const results = searchRules("What happens at 2 System Strain?");
  assert.equal(results[0]?.title, "System Strain");
  assert.ok(!results.slice(0, 3).some(result => result.category === "Weapon"));
});
