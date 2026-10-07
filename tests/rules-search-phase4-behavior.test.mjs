import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getRuleDetail, searchRules } from "../app/rules-search.ts";

test("strong rule matches are marked high confidence", async () => {
  const result = (await searchRules("System Strain"))[0];
  assert.equal(result?.title, "System Strain");
  assert.equal(result?.confidence, "high");
  assert.equal(result?.ambiguous, false);
});

test("broad weak questions are flagged instead of presented as certain", async () => {
  const results = await searchRules("healing");
  assert.ok(results.length > 1);
  assert.equal(results[0]?.confidence, "low");
  assert.equal(results[0]?.ambiguous, true);
});

test("unrelated nonsense does not return incidental one-word body matches", async () => {
  assert.deepEqual(await searchRules("purple submarine taxation"), []);
});

test("practical combat summaries resolve to the authoritative combat section", async () => {
  for (const [question, title, expectedText] of [
    ["Can I shoot somebody if an enemy is standing right beside me?", "Ranged Attacks in Melee", /-4 penalty/u],
    ["Can I reload a crossbow and attack in the same turn?", "Reloading Weapons", /Shoot-1/u],
    ["Does going prone make me harder to shoot?", "Prone in Combat", /-2 penalty/u],
  ]) {
    const result = (await searchRules(question))[0];
    assert.equal(result?.title, title, question);
    assert.equal(result?.confidence, "high", question);
    const detail = await getRuleDetail(title, question);
    assert.equal(detail?.detailTitle, "Common Combat Actions", question);
    assert.match(detail?.fullText ?? "", expectedText, question);
  }
});

test("known exceptions and supporting rules are linked from the controlling rule", async () => {
  const armor = (await searchRules("Can I cast a spell while wearing armor?"))[0];
  assert.ok(armor?.relatedRules?.some(rule => rule.title === "Armored Magic"));

  const shock = (await searchRules("Does carrying a shield stop Shock damage?"))[0];
  assert.equal(shock?.title, "Shock Damage");
  assert.ok(shock?.relatedRules?.some(rule => rule.title === "Shields"));
  assert.ok(shock?.relatedRules?.some(rule => rule.title === "Total Defense"));

  const firstAid = (await searchRules("How much does first aid heal?"))[0];
  assert.equal(firstAid?.title, "First Aid");
  assert.ok(firstAid?.relatedRules?.some(rule => rule.title === "System Strain"));
});

test("Rules Assistant visibly distinguishes uncertainty from strong answers", async () => {
  const [assistant, styles, searchSource] = await Promise.all([
    readFile(new URL("../app/rules-assistant.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/rules-search.ts", import.meta.url), "utf8"),
  ]);

  assert.match(searchSource, /confidenceFor/u);
  assert.match(searchSource, /ambiguous/u);
  assert.match(assistant, /weak matches rather than a confident rules answer/u);
  assert.match(assistant, /could reasonably point to more than one rule/u);
  assert.match(styles, /\.rules-search-guidance/u);
  assert.match(styles, /\.confidence-low/u);
});
