import assert from "node:assert/strict";
import test from "node:test";
import { builtInBestiaryEncounterSeed, repairLegacyBestiaryEncounterNpc } from "../lib/campaigns/bestiary.ts";
import { summarizeEncounterThreat } from "../lib/campaigns/encounter-threat.ts";

const apexLegacyNotes = "CC0 WWN SRD stat line: 6 HD (default HP 27, rounded-up average of 6d8); Shock 2/13; Move 40'; Morale 8; Instinct 6; Skill +2.";
const elitesLegacyNotes = "CC0 WWN SRD stat line: 3 HD (default HP 14, rounded-up average of 3d8); Shock Weapon +2; Move 30'; Morale 10; Instinct 2; Skill +2. The SRD's 18a AC is the creature's usual armor.";

function npc({ id, name, hpMax, armorClass, notes, combatStats }) {
  return { id, kind: "npc", name, initiative: 0, hpCurrent: hpMax - 1, hpMax, armorClass, notes, ...(combatStats ? { combatStats } : {}) };
}

function oldCombatStats({ notes, physical, evasion, mental, attacks, sourceStats }) {
  return { saves: { physical, evasion, mental }, attacks, notes, sourceStats };
}

function encounter(combatants) {
  return { id: "enc_test", round: 1, currentCombatantId: null, combatants };
}

test("repairs the historical one-attack Bestiary signature and removes only generated notes", () => {
  const legacy = npc({
    id: "elite", name: "Elites or Special Guards", hpMax: 14, armorClass: 16, notes: elitesLegacyNotes,
    combatStats: oldCombatStats({
      notes: elitesLegacyNotes, physical: 13, evasion: 14, mental: 14,
      attacks: [{ name: "Attack", attackBonus: 5, damage: "Weapon +2", description: "GM adjusted" }],
      sourceStats: { hitDice: 3, shock: "Weapon +2", move: "30'", morale: 10, instinct: 2, skill: 2 },
    }),
  });
  const repaired = repairLegacyBestiaryEncounterNpc(legacy);
  assert.ok(repaired);
  assert.equal(repaired.hpCurrent, 13, "encounter-local HP remains authoritative");
  assert.equal(repaired.armorClass, 16, "encounter-local AC remains authoritative");
  assert.deepEqual(repaired.combatStats?.saves, { physical: 13, evasion: 14, mental: 14 });
  assert.deepEqual(repaired.combatStats?.attacks, [{ name: "Attack", attackBonus: 5, damage: "Weapon +2", description: "GM adjusted" }]);
  assert.deepEqual(repaired.combatStats?.sourceStats, { hitDice: 3, attacksPerMainAction: 1, shock: "Weapon +2", move: "30'", morale: 10, instinct: 2, skill: 2 });
  assert.equal(repaired.notes, "");
  assert.equal(repaired.combatStats?.notes, "");
  assert.equal(repairLegacyBestiaryEncounterNpc(repaired), null, "the persisted clean snapshot no longer needs compatibility recognition");
});

test("repairs an Apex Predator-era snapshot and restores its canonical multiattack metadata", () => {
  const legacy = npc({ id: "apex", name: "Apex Predator", hpMax: 27, armorClass: 13, notes: apexLegacyNotes });
  const repaired = repairLegacyBestiaryEncounterNpc(legacy);
  assert.ok(repaired);
  assert.deepEqual(repaired.combatStats?.sourceStats, { hitDice: 6, attacksPerMainAction: 2, shock: "2/13", move: "40'", morale: 8, instinct: 6, skill: 2 });
  assert.deepEqual(repaired.combatStats?.attacks[0], { name: "Attack", attackBonus: 6, damage: "1d8", description: "Two attacks per Main Action." }, "the matcher reconstructs the historical generic snapshot, not the new curated display attack");
  assert.equal(repaired.combatStats?.attacks[0]?.description, "Two attacks per Main Action.");
});

test("a custom NPC sharing a Bestiary name but mismatched mechanics is not recognized", () => {
  const custom = npc({ id: "custom-apex", name: "Apex Predator", hpMax: 27, armorClass: 12, notes: apexLegacyNotes });
  assert.equal(repairLegacyBestiaryEncounterNpc(custom), null);
  const result = summarizeEncounterThreat(encounter([custom]), [3]);
  assert.deepEqual(result.excluded.map(entry => entry.missing), [["HD", "attacks/Main Action"]]);
});

test("explicit encounter threat stats still override a recovered or source Bestiary identity", () => {
  const modern = builtInBestiaryEncounterSeed("apex-predator");
  assert.ok(modern);
  const npcWithOverride = { id: "override", kind: "npc", ...modern, combatStats: { ...modern.combatStats, threatStats: { hitDice: 2, attacksPerMainAction: 1 } } };
  assert.equal(repairLegacyBestiaryEncounterNpc(npcWithOverride), null, "modern snapshots are already complete");
  const result = summarizeEncounterThreat(encounter([npcWithOverride]), [2]);
  assert.deepEqual(result.enemy, { totalHitDice: 2, totalAttacks: 1, score: 2 });
});

test("modern Bestiary copies and sparse custom NPCs remain unchanged", () => {
  const modern = builtInBestiaryEncounterSeed("apex-predator");
  assert.ok(modern);
  const modernNpc = { id: "modern", kind: "npc", ...modern };
  const sparse = npc({ id: "sparse", name: "Custom Brute", hpMax: 18, armorClass: 15, notes: "GM's custom brute" });
  assert.equal(repairLegacyBestiaryEncounterNpc(modernNpc), null);
  assert.equal(repairLegacyBestiaryEncounterNpc(sparse), null);
  const result = summarizeEncounterThreat(encounter([modernNpc, sparse]), [3]);
  assert.deepEqual(result.enemy, { totalHitDice: 6, totalAttacks: 2, score: 12 });
  assert.deepEqual(result.excluded.map(entry => entry.name), ["Custom Brute"]);
});

test("a note with GM-authored text is never cleaned or backfilled", () => {
  const edited = npc({ id: "edited", name: "Apex Predator", hpMax: 27, armorClass: 13, notes: `${apexLegacyNotes} GM: wounded by the ranger.` });
  assert.equal(repairLegacyBestiaryEncounterNpc(edited), null);
  assert.equal(edited.notes, `${apexLegacyNotes} GM: wounded by the ranger.`);
});

test("mixed encounter threat includes repaired legacy Bestiary snapshots independently", () => {
  const elite = repairLegacyBestiaryEncounterNpc(npc({
    id: "elite", name: "Elites or Special Guards", hpMax: 14, armorClass: 18, notes: elitesLegacyNotes,
    combatStats: oldCombatStats({
      notes: elitesLegacyNotes, physical: 14, evasion: 14, mental: 14,
      attacks: [{ name: "Attack", attackBonus: 4, damage: "Weapon +2", description: "" }],
      sourceStats: { hitDice: 3, shock: "Weapon +2", move: "30'", morale: 10, instinct: 2, skill: 2 },
    }),
  }));
  const apex = repairLegacyBestiaryEncounterNpc(npc({ id: "apex", name: "Apex Predator", hpMax: 27, armorClass: 13, notes: apexLegacyNotes }));
  assert.ok(elite && apex);
  const result = summarizeEncounterThreat(encounter([elite, apex]), [3, 3]);
  assert.deepEqual(result.enemy, { totalHitDice: 9, totalAttacks: 3, score: 27 });
  assert.equal(result.estimate?.band, "deadly");
});
