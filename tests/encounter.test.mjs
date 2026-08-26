import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { encounterCurrentAfterRemoval, encounterTurnTransition } from "../lib/campaigns/encounter.ts";
import { memberEncounterProjection } from "../lib/campaigns/live-session.ts";

const encounter = {
  id: "enc_one",
  round: 2,
  currentCombatantId: "cecil",
  combatants: [
    { id: "cecil", kind: "pc", characterId: "chr_cecil", initiative: 17 },
    { id: "orc", kind: "npc", name: "Orc", initiative: 14, hpCurrent: 8, hpMax: 12, armorClass: 15, notes: "" },
    { id: "todd", kind: "pc", characterId: "chr_todd", initiative: 11 },
  ],
};

test("turn transitions advance, wrap rounds, and move backward sensibly", () => {
  assert.deepEqual(encounterTurnTransition(encounter, "next"), { currentCombatantId: "orc", round: 2 });
  assert.deepEqual(encounterTurnTransition({ ...encounter, currentCombatantId: "todd" }, "next"), { currentCombatantId: "cecil", round: 3 });
  assert.deepEqual(encounterTurnTransition(encounter, "previous"), { currentCombatantId: "todd", round: 1 });
  assert.deepEqual(encounterTurnTransition({ ...encounter, round: 1 }, "previous"), { currentCombatantId: "todd", round: 1 });
});

test("removing the current combatant selects the next surviving turn without changing round", () => {
  assert.equal(encounterCurrentAfterRemoval(encounter, "cecil"), "orc");
  assert.equal(encounterCurrentAfterRemoval({ ...encounter, currentCombatantId: "orc" }, "orc"), "todd");
  assert.equal(encounterCurrentAfterRemoval({ ...encounter, currentCombatantId: "todd" }, "todd"), "cecil");
  assert.equal(encounterCurrentAfterRemoval({ ...encounter, currentCombatantId: "cecil", combatants: [encounter.combatants[0]] }, "cecil"), null);
});

test("member encounter projections redact GM-only NPC details", () => {
  const projected = memberEncounterProjection(encounter);
  const npc = projected.combatants[1];
  assert.equal(npc.kind, "npc");
  assert.equal(npc.hpCurrent, 8);
  assert.equal(Object.hasOwn(npc, "hpMax"), false);
  assert.equal(Object.hasOwn(npc, "armorClass"), false);
  assert.equal(Object.hasOwn(npc, "notes"), false);
});

test("encounters stay durable, ordered, owner-controlled, and realtime", async () => {
  const [durable, route, sessionRoute, sessionUi, sessionClient] = await Promise.all([
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/encounter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-live-session.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
  ]);
  assert.match(durable, /CREATE TABLE IF NOT EXISTS encounters/u);
  assert.match(durable, /encounters_active_idx[\s\S]*?WHERE ended_at IS NULL/u);
  assert.match(durable, /ORDER BY initiative DESC, added_order ASC, combatant_id ASC/u);
  assert.match(durable, /roll\.category === "initiative"[\s\S]*?roll\.total[\s\S]*?roll\.character\.id/u);
  assert.match(durable, /type: "session\.encounter"/u);
  assert.match(durable, /UPDATE encounters SET ended_at/u);
  assert.match(route, /authorizeEncounterManagement/u);
  assert.match(route, /authorizeEncounterCharacter/u);
  assert.match(route, /startEncounter/u);
  assert.match(route, /setNpcHp/u);
  assert.match(route, /moveTurn/u);
  assert.match(sessionRoute, /durable\.encounter\(result\.state\.session\.id\)/u);
  assert.match(sessionClient, /message\.type === "session\.encounter"/u);
  assert.match(sessionUi, /Start Encounter/u);
  assert.match(sessionUi, /Previous Turn/u);
  assert.match(sessionUi, /Next Turn/u);
  assert.match(sessionUi, /Live Rolls/u);
});
