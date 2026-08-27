import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { normalizeNpcAttacks, normalizeNpcThreatStats, readStoredNpcAttacks, threatInput } from "../lib/campaigns/npc-combat.ts";
import { npcAttackFromWeapon, npcWeaponStarters } from "../lib/campaigns/npc-weapons.ts";
import { calculateWwnThreatEstimate } from "../lib/campaigns/wwn-threat.ts";

test("custom NPC attacks are structured, rollable, ordered, and legacy-safe", () => {
  const attacks = normalizeNpcAttacks([
    { name: "Longsword", attackBonus: 5, damage: "1d8+2", shock: "2/AC 13", description: "Range 10/30 · Traits T" },
    { name: "Dagger", attackBonus: 4, damage: "1d4+1", description: "Backup weapon" },
  ]);
  assert.deepEqual(attacks[0], { name: "Longsword", attackBonus: 5, damage: "1d8+2", shock: "2/AC 13", description: "Range 10/30 · Traits T" });
  assert.equal(attacks.length, 2, "multiple weapons remain alternatives, not inferred multiattacks");
  assert.throws(() => normalizeNpcAttacks([{ name: "Improvised", attackBonus: 1, damage: "Weapon", description: "" }]), /rollable dice expression/u);
  const legacy = readStoredNpcAttacks([{ name: "Old weapon", attackBonus: 1, damage: "Weapon", description: "" }]);
  assert.deepEqual(normalizeNpcAttacks(legacy, legacy), legacy, "old structured rows retain their literal damage without prose parsing");
  assert.throws(() => normalizeNpcAttacks([...legacy, { name: "New prose", attackBonus: 1, damage: "Weapon", description: "" }], legacy), /rollable dice expression/u);
});

test("threat-ready custom NPC data requires explicit HD and attacks per Main Action", () => {
  assert.equal(normalizeNpcThreatStats({ hitDice: null, attacksPerMainAction: null }), null);
  assert.deepEqual(normalizeNpcThreatStats({ hitDice: 4, attacksPerMainAction: 2 }), { hitDice: 4, attacksPerMainAction: 2 });
  assert.throws(() => normalizeNpcThreatStats({ hitDice: 4, attacksPerMainAction: null }), /provided together/u);
  assert.throws(() => normalizeNpcThreatStats({ hitDice: 4, attacksPerMainAction: 0 }), /invalid/u);
  const input = threatInput({ hitDice: 4, attacksPerMainAction: 2 });
  assert.deepEqual(input, { hitDice: 4, attacksPerMainAction: 2 });
  assert.ok(calculateWwnThreatEstimate([2, 2, 2], [{ ...input, quantity: 1 }]), "custom data is ready for the existing generic threat calculator without adding a dashboard");
});

test("weapon starters copy existing catalog values into editable custom attacks", () => {
  const sword = npcAttackFromWeapon("Sword, Long");
  assert.deepEqual(sword, { name: "Sword, Long", attackBonus: 0, damage: "1d8", shock: "2/AC 13", description: "" });
  assert.notEqual(sword, npcAttackFromWeapon("Sword, Long"));
  assert.ok(npcWeaponStarters.every(weapon => /^\d+d\d+(?:[+-]\d+)?$/u.test(weapon.damage)));
  assert.equal(npcAttackFromWeapon("Unarmed Attack"), null, "non-rollable catalog formulas are not offered as custom attack starters");
});

test("Phase 5C.7 migration preserves existing campaign NPC rows and adds nullable fields", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE campaign_npc_templates (id TEXT PRIMARY KEY, attacks_json TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '');");
  sqlite.prepare("INSERT INTO campaign_npc_templates (id, attacks_json, notes) VALUES (?, ?, ?)").run("old", '[{"name":"Axe","attackBonus":2,"damage":"1d6","description":""}]', "preserve me");
  const migration = await readFile(new URL("../drizzle/0012_campaign_npc_threat_stats.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  const row = sqlite.prepare("SELECT attacks_json, notes, hit_dice, attacks_per_main_action FROM campaign_npc_templates WHERE id = 'old'").get();
  assert.deepEqual({ ...row }, { attacks_json: '[{"name":"Axe","attackBonus":2,"damage":"1d6","description":""}]', notes: "preserve me", hit_dice: null, attacks_per_main_action: null });
});
