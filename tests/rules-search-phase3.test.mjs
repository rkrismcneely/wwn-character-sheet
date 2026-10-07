import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getRuleDetail, searchRules } from "../app/rules-search.ts";

test("short hand-authored answers drill into the richer SRD rule when available", async () => {
  const result = (await searchRules("What happens when I hit zero HP?"))[0];
  assert.equal(result?.title, "Dropping to 0 Hit Points");
  assert.match(result?.fullText ?? "", /end of the sixth round/i);
  assert.match(result?.detailTitle ?? "", /Mortal Injury and Stabilization/i);
  assert.match(result?.detailSource ?? "", /2\.5\.1/u);
});

test("detailed SRD sections retain their parent context and direct subrules", async () => {
  const effort = await getRuleDetail("Committing Effort", "When does Effort committed for the scene come back?");
  assert.ok(effort);
  assert.match(effort.fullText ?? "", /comfortable night/i);
  assert.ok(effort.context?.parents.some(parent => parent.title === "Classes and Effort"));
  assert.ok(effort.relatedRules?.some(rule => rule.title === "Effort"));

  const injury = await getRuleDetail("Mortal Injury and Stabilization", "What happens at zero HP?");
  assert.ok(injury);
  assert.ok(injury.context?.children.some(child => child.title === "NPCs and Mortal Injury"));
  assert.ok(injury.context?.children.some(child => child.title === "Catastrophic Damage"));
  assert.ok(injury.context?.children.some(child => child.title === "Non-Lethal Incapacitation"));
});

test("rule detail aliases can point to canonical SRD section titles", async () => {
  const shock = await getRuleDetail("Shock Damage", "Do melee weapons deal damage when they miss?");
  assert.ok(shock);
  assert.equal(shock.detailTitle, "Shock");
  assert.match(shock.fullText ?? "", /shield can ignore the first source of Shock/i);
});

test("search results identify controlling and supporting rules", async () => {
  const results = await searchRules("How do I save a companion who is dying?");
  assert.equal(results[0]?.matchKind, "controlling");
  assert.ok(results.some(result => result.matchKind === "supporting"));
  assert.ok(results[0]?.relatedRules?.some(rule => rule.title === "Dropping to 0 Hit Points"));
  assert.ok(results[0]?.relatedRules?.some(rule => rule.title === "First Aid"));

  const armor = await searchRules("Can I cast a spell while wearing armor?");
  assert.equal(armor[0]?.title, "Spellcasting and Armor");
  assert.ok(armor[0]?.relatedRules?.some(rule => rule.title === "Armored Magic"));
});

test("harder conversational questions keep the correct controlling rule at the top", async () => {
  for (const [question, expectedTitle] of [
    ["What happens if I just run away from someone I am fighting?", "Fighting Withdrawal"],
    ["Can I cast this spell in armor and is there an exception?", "Spellcasting and Armor"],
    ["How do I stabilize someone and what happens afterward?", "Stabilizing a Mortally Wounded Character"],
  ]) {
    assert.equal((await searchRules(question))[0]?.title, expectedTitle, question);
  }
});

test("Rules Assistant provides a focused detail view and clickable related-rule navigation", async () => {
  const [assistant, styles] = await Promise.all([
    readFile(new URL("../app/rules-assistant.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(assistant, /getRuleDetail/u);
  assert.match(assistant, /selectedRule/u);
  assert.match(assistant, /Back to results/u);
  assert.match(assistant, /Full rule/u);
  assert.match(assistant, /Rule context/u);
  assert.match(assistant, /Related rules/u);
  assert.match(assistant, /openRuleDetail/u);
  assert.match(assistant, /More details/u);
  assert.match(styles, /\.rule-detail-view/u);
  assert.match(styles, /\.rule-related-link/u);
  assert.match(styles, /\.rules-results\.has-rule-detail/u);
});
