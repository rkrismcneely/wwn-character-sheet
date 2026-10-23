import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { searchRules } from "../app/rules-search.ts";

const rulesSearchSource = await readFile(new URL("../app/rules-search.ts", import.meta.url), "utf8");
const characterSheetSource = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
const rulesAssistantSource = await readFile(new URL("../app/rules-assistant.tsx", import.meta.url), "utf8");

test("the full SRD corpus stays out of the initial character-sheet bundle and the shared assistant owns lazy search", () => {
  assert.match(rulesSearchSource, /import\("\.\/srd-search-data\.ts"\)/u);
  assert.doesNotMatch(rulesSearchSource, /^import \{ completeSrdRules \}/mu);
  assert.match(characterSheetSource, /<RulesAssistant \/>/u);
  assert.match(rulesAssistantSource, /onFocus=\{preloadRulesSearch\}/u);
  assert.match(rulesAssistantSource, /const matches = await searchRules\(trimmedQuestion\);\s*setResults\(matches\)/u);
});

test("natural-language zero HP question prioritizes the injury rule", async () => {
  assert.equal((await searchRules("What happens at 0 HP?"))[0]?.title, "Dropping to 0 Hit Points");
});

test("exact option names return their SRD entries", async () => {
  assert.equal((await searchRules("Velocitous Imbuement"))[0]?.title, "Velocitous Imbuement");
  assert.equal((await searchRules("Henchkeeper level 2"))[0]?.title, "Henchkeeper · Level 2");
});

test("common rules aliases find the intended rule", async () => {
  assert.equal((await searchRules("How do I disengage from melee?"))[0]?.title, "Fighting Withdrawal");
});

test("falling questions find the core hazard rule instead of incidental option text", async () => {
  for (const question of ["falling", "fall damage", "What happens if I fell 30 feet?", "damage from a fall"]) {
    assert.equal((await searchRules(question))[0]?.title, "Falling", question);
  }
});

test("inflections and common-language hazard aliases find the core rule", async () => {
  assert.equal((await searchRules("How long can I hold my breath?"))[0]?.title, "Suffocation");
  assert.equal((await searchRules("How does natural recovery work?"))[0]?.title, "Natural Healing");
  assert.equal((await searchRules("Can I bandage someone?"))[0]?.title, "First Aid");
});

test("the complete SRD corpus is searchable beyond hand-authored core topics", async () => {
  for (const [question, expectedTitle] of [
    ["Encumbrance", "Encumbrance"],
    ["dungeon exploration", "Dungeon Exploration"],
    ["faction turn", "The Faction Turn"],
    ["major projects", "Major Projects"],
    ["creating magic items", "Creating Magic Items"],
    ["reaction rolls", "Making a Reaction Roll"],
  ]) {
    assert.equal((await searchRules(question))[0]?.title, expectedTitle, question);
  }
});

test("search results retain the complete source section behind their excerpt", async () => {
  const result = (await searchRules("Encumbrance"))[0];
  assert.ok(result);
  assert.ok(result.fullText);
  assert.ok(result.fullText.length >= result.text.length);
  assert.match(result.fullText, /Encumbrance/i);
});

test("short weapon-trait aliases do not hijack natural-language questions", async () => {
  const results = await searchRules("What happens at 2 System Strain?");
  assert.equal(results[0]?.title, "System Strain");
  assert.ok(!results.slice(0, 3).some(result => result.category === "Weapon"));
});
