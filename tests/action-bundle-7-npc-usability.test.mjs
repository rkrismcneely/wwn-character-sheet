import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");

test("Bundle 7 persists structured spells, arts and friendly NPC state", () => {
  const source = read("lib/campaigns/npcs.ts");
  assert.ok(source.includes("spells_json AS spellsJson"));
  assert.ok(source.includes("arts_json AS artsJson"));
  assert.ok(source.includes("friendly: npc.friendly"));
  assert.ok(source.includes("spells: npc.spells.map"));
});

test("friendly encounter NPCs are excluded from enemy threat", () => {
  assert.ok(read("lib/campaigns/encounter-threat.ts").includes('combatant.kind === "npc" && !combatant.friendly'));
});

test("encounter snapshots carry and can toggle friendliness", () => {
  const worker = read("worker/campaign-live-session.ts");
  const route = read("app/api/campaigns/[id]/session/encounter/route.ts");
  assert.ok(worker.includes("setNpcFriendly"));
  assert.ok(worker.includes("friendly INTEGER NOT NULL DEFAULT 0"));
  assert.ok(route.includes('body.action === "npc_friendly"'));
  assert.ok(worker.includes("normalizeCampaignNpcCombatStats"));
});

test("GM NPC editor exposes HP rolling, structured magic and friendly default", () => {
  const source = read("app/campaigns/gm-console.tsx");
  assert.ok(source.includes("Roll HP"));
  assert.ok(source.includes('NpcMagicAdd kind="Spell"'));
  assert.ok(source.includes('NpcMagicAdd kind="Art"'));
  assert.ok(source.includes("Friendly / allied creature"));
});

test("Encounter Threat is collapsible and friendliness is GM-toggleable", () => {
  const source = read("app/campaigns/campaign-live-session.tsx");
  assert.ok(source.includes('<details className="campaign-encounter-threat">'));
  assert.ok(source.includes("Make Friendly"));
  assert.ok(source.includes("Make Hostile"));
});

test("Bundle 7 migration is additive and defaults existing NPCs safely", () => {
  const sql = read("drizzle/0017_action_bundle_7_npc_usability.sql");
  assert.ok(sql.includes("spells_json TEXT NOT NULL DEFAULT '[]'"));
  assert.ok(sql.includes("arts_json TEXT NOT NULL DEFAULT '[]'"));
  assert.ok(sql.includes("friendly INTEGER NOT NULL DEFAULT 0"));
});
