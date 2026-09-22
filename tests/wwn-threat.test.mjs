import assert from "node:assert/strict";
import test from "node:test";
import { builtInBestiaryCreatures, filterBestiaryCreatures } from "../lib/campaigns/bestiary.ts";
import {
  calculateWwnEnemyScore,
  calculateWwnPartyScore,
  calculateWwnThreatEstimate,
  wwnThreatBandForRatio,
} from "../lib/campaigns/wwn-threat.ts";

test("WWN party score uses the sum of linked PC levels multiplied by the linked PC count", () => {
  assert.deepEqual(calculateWwnPartyScore([3]), { levels: [3], characterCount: 1, totalLevels: 3, score: 3 });
  assert.deepEqual(calculateWwnPartyScore([4, 2]), { levels: [4, 2], characterCount: 2, totalLevels: 6, score: 12 }); // owner and member links both count.
  assert.deepEqual(calculateWwnPartyScore([3, 3, 3, 3]), { levels: [3, 3, 3, 3], characterCount: 4, totalLevels: 12, score: 48 });
  assert.deepEqual(calculateWwnPartyScore([1, 3, 5]), { levels: [1, 3, 5], characterCount: 3, totalLevels: 9, score: 27 });
});

test("WWN enemy score totals group HD and attacks before multiplying", () => {
  assert.deepEqual(calculateWwnEnemyScore([{ hitDice: 6, attacksPerMainAction: 2 }]), { totalHitDice: 6, totalAttacks: 2, score: 12 });
  assert.deepEqual(calculateWwnEnemyScore([{ hitDice: 2, attacksPerMainAction: 1, quantity: 3 }]), { totalHitDice: 6, totalAttacks: 3, score: 18 });
  assert.deepEqual(calculateWwnEnemyScore([{ hitDice: 1, attacksPerMainAction: 1, quantity: 10 }]), { totalHitDice: 10, totalAttacks: 10, score: 100 });
  assert.deepEqual(calculateWwnEnemyScore([{ hitDice: 2, attacksPerMainAction: 2, quantity: 3 }]), { totalHitDice: 6, totalAttacks: 6, score: 36 });
});

test("TWE's approved WWN threat bands include every exact boundary", () => {
  assert.equal(wwnThreatBandForRatio(0.49), "trivial");
  assert.equal(wwnThreatBandForRatio(0.5), "favorable");
  assert.equal(wwnThreatBandForRatio(1), "favorable");
  assert.equal(wwnThreatBandForRatio(1.01), "risky");
  assert.equal(wwnThreatBandForRatio(1.99), "risky");
  assert.equal(wwnThreatBandForRatio(2), "deadly");
  assert.equal(wwnThreatBandForRatio(4), "deadly");
  assert.equal(wwnThreatBandForRatio(4.01), "overwhelming");
});

test("WWN threat estimates expose scores, ratio, and bands without making a party from malformed data", () => {
  const party = [1, 1]; // Party Score 4.
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 1, attacksPerMainAction: 1 }])?.band, "trivial");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 1, attacksPerMainAction: 2 }])?.band, "favorable");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 2, attacksPerMainAction: 2 }])?.band, "favorable");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 5, attacksPerMainAction: 1 }])?.band, "risky");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 7, attacksPerMainAction: 1 }])?.band, "risky");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 8, attacksPerMainAction: 1 }])?.band, "deadly");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 16, attacksPerMainAction: 1 }])?.band, "deadly");
  assert.equal(calculateWwnThreatEstimate(party, [{ hitDice: 17, attacksPerMainAction: 1 }])?.band, "overwhelming");
  assert.equal(calculateWwnPartyScore([]), null);
  assert.equal(calculateWwnPartyScore([1, "2"]), null);
  assert.equal(calculateWwnEnemyScore([{ hitDice: 1, attacksPerMainAction: 0 }]), null);
  assert.equal(calculateWwnThreatEstimate([1], [{ hitDice: 1, attacksPerMainAction: 1, quantity: 0 }]), null);
});

test("all immutable Bestiary entries have explicit valid threat inputs", () => {
  assert.equal(builtInBestiaryCreatures.length, 84);
  assert.ok(builtInBestiaryCreatures.every(creature => Number.isFinite(creature.sourceStats.hitDice) && creature.sourceStats.hitDice >= 0));
  assert.ok(builtInBestiaryCreatures.every(creature => Number.isSafeInteger(creature.sourceStats.attacksPerMainAction) && creature.sourceStats.attacksPerMainAction > 0));
  assert.ok(builtInBestiaryCreatures.every(Object.isFrozen));
  assert.ok(builtInBestiaryCreatures.every(creature => Object.isFrozen(creature.sourceStats)));
  assert.equal(builtInBestiaryCreatures.find(creature => creature.id === "automaton-warbot")?.sourceStats.attacksPerMainAction, 3);
  assert.equal(builtInBestiaryCreatures.find(creature => creature.id === "predator-hellbeast")?.sourceStats.attacksPerMainAction, 4);
  assert.equal(builtInBestiaryCreatures.find(creature => creature.id === "apex-predator")?.sourceStats.attacksPerMainAction, 2);
  assert.equal(builtInBestiaryCreatures.find(creature => creature.id === "famous-arch-mage")?.sourceStats.attacksPerMainAction, 1);
});

test("Bestiary filtering combines text, HD, and party-relative threat locally without mutation", () => {
  const before = builtInBestiaryCreatures.map(creature => ({ id: creature.id, sourceStats: { ...creature.sourceStats } }));
  assert.deepEqual(filterBestiaryCreatures(builtInBestiaryCreatures, { query: "wizard", minHitDice: 5, maxHitDice: 10 }).map(creature => creature.name), ["Master Wizard", "Skilled Sorcerer"]);
  assert.deepEqual(filterBestiaryCreatures(builtInBestiaryCreatures, { minHitDice: 10, maxHitDice: 10 }).map(creature => creature.name), ["Aboleth", "Warbot Automaton", "Famous Arch-Mage", "Juvenile Poison Dragon", "Major Hero", "Hellbeast Predator", "Hulking Predator"]);
  assert.deepEqual(filterBestiaryCreatures(builtInBestiaryCreatures, { partyLevels: [1, 1], threatBand: "trivial", quantity: 1 }).filter(creature => creature.source.license === "CC0").map(creature => creature.name), ["Barbarian Fighter", "Peaceful Human", "Small Vicious Predator", "Small Pack Predator", "Thug or Militia", "Veteran Soldier"]);
  assert.deepEqual(builtInBestiaryCreatures.map(creature => ({ id: creature.id, sourceStats: { ...creature.sourceStats } })), before);
});
