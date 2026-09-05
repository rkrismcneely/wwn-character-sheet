import assert from "node:assert/strict";
import test from "node:test";
import { summarizeEncounterThreat } from "../lib/campaigns/encounter-threat.ts";

function encounter(combatants) {
  return { id: "enc_test", round: 1, currentCombatantId: null, combatants };
}

function npc({ id, name, hpCurrent = 10, sourceStats, threatStats }) {
  return {
    id,
    kind: "npc",
    name,
    initiative: 0,
    hpCurrent,
    combatStats: sourceStats || threatStats ? {
      saves: { physical: 15, evasion: 15, mental: 15 },
      attacks: [],
      notes: "",
      ...(sourceStats ? { sourceStats: { shock: "None", move: "30'", morale: 7, instinct: 5, skill: 1, ...sourceStats } } : {}),
      ...(threatStats ? { threatStats } : {}),
    } : undefined,
  };
}

test("current encounter instances use total HD multiplied by total attacks, not individual scores", () => {
  const result = summarizeEncounterThreat(encounter([
    npc({ id: "a", name: "Veteran", sourceStats: { hitDice: 4, attacksPerMainAction: 1 } }),
    npc({ id: "b", name: "Swarm", sourceStats: { hitDice: 2, attacksPerMainAction: 3 } }),
  ]), [2, 2]);

  assert.deepEqual(result.enemy, { totalHitDice: 6, totalAttacks: 4, score: 24 });
  assert.equal(result.estimate?.ratio, 3);
  assert.equal(result.estimate?.band, "deadly");
  assert.notEqual(result.enemy?.score, 10, "must not use 4×1 + 2×3");
});

test("identical and mixed NPC instances each contribute their current local snapshot", () => {
  const result = summarizeEncounterThreat(encounter([
    npc({ id: "one", name: "Guard", threatStats: { hitDice: 2, attacksPerMainAction: 1 } }),
    npc({ id: "two", name: "Guard", threatStats: { hitDice: 2, attacksPerMainAction: 2 } }),
    npc({ id: "three", name: "Custom Brute", threatStats: { hitDice: 3, attacksPerMainAction: 1 } }),
  ]), [3, 3]);

  assert.deepEqual(result.eligible.map(({ name, hitDice, attacksPerMainAction }) => ({ name, hitDice, attacksPerMainAction })), [
    { name: "Guard", hitDice: 2, attacksPerMainAction: 1 },
    { name: "Guard", hitDice: 2, attacksPerMainAction: 2 },
    { name: "Custom Brute", hitDice: 3, attacksPerMainAction: 1 },
  ]);
  assert.deepEqual(result.enemy, { totalHitDice: 7, totalAttacks: 4, score: 28 });
});

test("encounter-local threat data overrides a Bestiary snapshot without a catalog lookup", () => {
  const instance = npc({
    id: "apex",
    name: "Apex Predator",
    sourceStats: { hitDice: 6, attacksPerMainAction: 2 },
    threatStats: { hitDice: 3, attacksPerMainAction: 1 },
  });
  const result = summarizeEncounterThreat(encounter([instance]), [3]);
  assert.deepEqual(result.enemy, { totalHitDice: 3, totalAttacks: 1, score: 3 });
  assert.equal(result.eligible[0].hitDice, 3);
  assert.equal(result.eligible[0].attacksPerMainAction, 1);
});

test("HP does not change the score, while removing an instance does", () => {
  const instance = npc({ id: "custom", name: "Custom NPC", hpCurrent: 20, threatStats: { hitDice: 4, attacksPerMainAction: 2 } });
  const healthy = summarizeEncounterThreat(encounter([instance]), [2, 2]);
  const wounded = summarizeEncounterThreat(encounter([{ ...instance, hpCurrent: 0 }]), [2, 2]);
  const removed = summarizeEncounterThreat(encounter([]), [2, 2]);
  assert.deepEqual(wounded.enemy, healthy.enemy);
  assert.equal(wounded.estimate?.ratio, healthy.estimate?.ratio);
  assert.equal(removed.enemy, null);
});

test("legacy and sparse NPCs are excluded explicitly, making mixed estimates partial", () => {
  const result = summarizeEncounterThreat(encounter([
    npc({ id: "eligible-a", name: "Veteran", sourceStats: { hitDice: 3, attacksPerMainAction: 1 } }),
    npc({ id: "eligible-b", name: "Pack Hunter", threatStats: { hitDice: 2, attacksPerMainAction: 2 } }),
    npc({ id: "legacy", name: "Legacy Guard" }),
    npc({ id: "sparse", name: "Sparse NPC", sourceStats: { hitDice: 2 } }),
  ]), [2, 2]);

  assert.deepEqual(result.enemy, { totalHitDice: 5, totalAttacks: 3, score: 15 });
  assert.equal(result.estimate?.band, "risky");
  assert.deepEqual(result.excluded.map(({ name, missing }) => ({ name, missing })), [
    { name: "Legacy Guard", missing: ["HD", "attacks/Main Action"] },
    { name: "Sparse NPC", missing: ["attacks/Main Action"] },
  ]);
});

test("empty, all-ineligible, and no-party encounters never invent a harmless estimate", () => {
  const empty = summarizeEncounterThreat(encounter([]), [2]);
  assert.deepEqual({ npcCount: empty.npcCount, enemy: empty.enemy, estimate: empty.estimate }, { npcCount: 0, enemy: null, estimate: null });

  const unavailable = summarizeEncounterThreat(encounter([npc({ id: "legacy", name: "Legacy Guard" })]), [2]);
  assert.equal(unavailable.enemy, null);
  assert.equal(unavailable.estimate, null);
  assert.equal(unavailable.excluded.length, 1);

  const noParty = summarizeEncounterThreat(encounter([npc({ id: "built-in", name: "Bestiary NPC", sourceStats: { hitDice: 2, attacksPerMainAction: 1 } })]), []);
  assert.deepEqual(noParty.enemy, { totalHitDice: 2, totalAttacks: 1, score: 2 });
  assert.equal(noParty.estimate, null);
});

test("an encounter snapshot remains independent after a source template changes", () => {
  const sourceTemplate = { hitDice: 3, attacksPerMainAction: 1 };
  const existingInstance = npc({ id: "saved-copy", name: "Template Guard", threatStats: { ...sourceTemplate } });
  sourceTemplate.hitDice = 8;
  sourceTemplate.attacksPerMainAction = 3;
  const newlyAddedInstance = npc({ id: "new-copy", name: "Template Guard", threatStats: { ...sourceTemplate } });
  const result = summarizeEncounterThreat(encounter([existingInstance, newlyAddedInstance]), [3, 3]);
  assert.deepEqual(result.eligible.map(({ hitDice, attacksPerMainAction }) => ({ hitDice, attacksPerMainAction })), [
    { hitDice: 3, attacksPerMainAction: 1 },
    { hitDice: 8, attacksPerMainAction: 3 },
  ]);
  assert.deepEqual(result.enemy, { totalHitDice: 11, totalAttacks: 4, score: 44 });
});


test("friendly NPCs are excluded completely from hostile encounter threat", () => {
  const hostile = npc({ id: "hostile", name: "Hostile Guard", threatStats: { hitDice: 2, attacksPerMainAction: 1 } });
  const ally = { ...npc({ id: "friendly", name: "Allied Beast", threatStats: { hitDice: 8, attacksPerMainAction: 4 } }), friendly: true };
  const result = summarizeEncounterThreat(encounter([hostile, ally]), [2, 2]);

  assert.equal(result.npcCount, 1);
  assert.deepEqual(result.eligible.map(({ name }) => name), ["Hostile Guard"]);
  assert.deepEqual(result.enemy, { totalHitDice: 2, totalAttacks: 1, score: 2 });
  assert.equal(result.excluded.length, 0);
});
