import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSharedRollCategory, resolveRoll } from "../app/rolls.ts";
import {
  npcRollRequest,
  normalizeSharedRollRequest,
  toCampaignSharedRoll,
  toPublicNpcCampaignSharedRoll,
} from "../lib/campaigns/shared-roll.ts";

test("only semantic contextual roll categories are shareable", () => {
  assert.equal(isSharedRollCategory("generic"), false);
  for (const category of ["skill", "save", "initiative", "attack", "damage"]) {
    assert.equal(isSharedRollCategory(category), true);
  }
  assert.throws(() => normalizeSharedRollRequest({ category: "generic", label: "d20 Roll", dice: { count: 1, sides: 20 } }, { id: "chr_one", name: "Hero" }));
});

test("the server-issued shared result preserves one authoritative raw roll", async () => {
  let randomCalls = 0;
  const request = normalizeSharedRollRequest({
    category: "skill",
    character: { id: "forged", name: "Forged" },
    label: "Know (INT) Check",
    dice: { count: 2, sides: 6 },
    modifiers: [{ label: "Know skill", value: 1 }, { label: "INT", value: 2 }],
  }, { id: "chr_real", name: "Cecil the Amber" });
  const result = toCampaignSharedRoll(await resolveRoll(request, {
    roll: () => { randomCalls += 1; return { count: 2, sides: 6, results: [5, 4], total: 9 }; },
    now: () => new Date("2026-08-25T12:00:00.000Z"),
    createId: () => "roll-authoritative",
  }));
  assert.equal(randomCalls, 1);
  assert.deepEqual(result.dice.results, [5, 4]);
  assert.equal(result.total, 12);
  assert.deepEqual(result.character, { id: "chr_real", name: "Cecil the Amber" });
});

test("NPC rolls use identity-free, human-readable action labels for rich, generic, custom, multiple-attack, and sparse snapshots", async () => {
  const richNpc = {
    id: "cmb_internal", kind: "npc", name: "Apex Predator", initiative: 0, hpCurrent: 32,
    combatStats: {
      saves: { physical: 12, evasion: 13, mental: 14 }, notes: "",
      attacks: [{ name: "Bite", attackBonus: 6, damage: "1d8+2", description: "" }, { name: "Claw", attackBonus: 4, damage: "1d6", description: "" }],
    },
  };
  const attack = npcRollRequest(richNpc, { kind: "attack", attackIndex: 0 });
  const damage = npcRollRequest(richNpc, { kind: "damage", attackIndex: 1 });
  const save = npcRollRequest(richNpc, { kind: "save", save: "physical" });
  assert.deepEqual(attack, { category: "attack", character: { id: "npc", name: "Apex Predator" }, label: "Bite Attack", dice: { count: 1, sides: 20 }, modifiers: [{ label: "Attack bonus", value: 6 }] });
  assert.deepEqual(damage, { category: "damage", character: { id: "npc", name: "Apex Predator" }, label: "Claw Damage", dice: { count: 1, sides: 6 }, modifiers: [] });
  assert.equal(save?.label, "Physical Save");
  assert.equal(save?.target, 12);
  assert.equal(save?.targetKind, "saving-throw");
  const resolved = await resolveRoll(attack, { roll: () => ({ count: 1, sides: 20, results: [12], total: 12 }), createId: () => "npc-roll" });
  assert.equal(resolved.total, 18);
  assert.equal(resolved.label, "Bite Attack");

  const customNpc = { ...richNpc, name: "Campaign Guard", combatStats: { saves: { physical: 15, evasion: 14, mental: 13 }, notes: "", attacks: [{ name: "Spear", attackBonus: 2, damage: "1d6", description: "" }] } };
  assert.equal(npcRollRequest(customNpc, { kind: "attack", attackIndex: 0 })?.label, "Spear Attack");
  const genericNpc = { ...richNpc, name: "Small Pack Predator #2", combatStats: { ...richNpc.combatStats, attacks: [{ name: "Attack", attackBonus: 2, damage: "1d4", description: "" }] } };
  assert.equal(npcRollRequest(genericNpc, { kind: "attack", attackIndex: 0 })?.label, "Attack");
  assert.equal(npcRollRequest(genericNpc, { kind: "damage", attackIndex: 0 })?.label, "Damage");
  assert.equal(npcRollRequest(genericNpc, { kind: "attack", attackIndex: 0 })?.character.name, "Small Pack Predator #2");
  assert.equal(npcRollRequest({ ...richNpc, combatStats: undefined }, { kind: "attack", attackIndex: 0 }), null);
  assert.equal(npcRollRequest({ ...richNpc, combatStats: { ...richNpc.combatStats, attacks: [{ name: "Improvised", attackBonus: 0, damage: "Wpn", description: "" }] } }, { kind: "damage", attackIndex: 0 }), null);
});

test("published NPC rolls omit GM-only save targets and encounter identifiers", async () => {
  const request = npcRollRequest({ id: "cmb_secret", kind: "npc", name: "Hidden Sentinel", initiative: 0, hpCurrent: 1, combatStats: { saves: { physical: 12, evasion: 13, mental: 14 }, attacks: [], notes: "" } }, { kind: "save", save: "physical" });
  const result = await resolveRoll(request, { roll: () => ({ count: 1, sides: 20, results: [20], total: 20 }), createId: () => "npc-save" });
  const published = toPublicNpcCampaignSharedRoll(result);
  assert.equal(Object.hasOwn(published, "target"), false);
  assert.equal(published.outcome, "success");
  assert.deepEqual(published.character, { id: "npc", name: "Hidden Sentinel" });
  assert.equal(JSON.stringify(published).includes("cmb_secret"), false);
});

test("shared session transport keeps party status authoritative, realtime, and reconnect-safe", async () => {
  const [sheet, route, characterRoute, durable, sessionUi, sessionClient, liveSessionService] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/rolls/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-live-session.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/live-session-service.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /isSharedRollCategory\(request\.category\)/u);
  assert.match(sheet, /rawRoll = \(preparedSharedRoll \|\| localResult\)!\.dice/u);
  assert.match(sheet, /action: "publish"/u);
  assert.match(route, /authorizeLiveSessionRoll/u);
  assert.match(route, /authorizeEncounterManagement/u);
  assert.match(route, /npc_prepare/u);
  assert.match(route, /npc_publish/u);
  assert.match(route, /npcRollRequest/u);
  assert.match(route, /toPublicNpcCampaignSharedRoll/u);
  assert.match(route, /resolveRoll\(rollRequest\)/u);
  assert.match(liveSessionService, /requireRuntimeManager\(actor, campaign\)/u);
  assert.match(characterRoute, /activeCharacterStatusTargets/u);
  assert.match(characterRoute, /announceCharacterStatus/u);
  assert.match(durable, /INSERT OR IGNORE INTO session_rolls/u);
  assert.match(durable, /published_at IS NULL/u);
  assert.match(durable, /LIMIT 50/u);
  assert.match(durable, /type: "session\.roll"/u);
  assert.match(durable, /announceCharacterStatus/u);
  assert.match(durable, /session\.character-status/u);
  assert.match(sessionClient, /recentRolls\.some\(roll => roll\.id === message\.roll\.id\)/u);
  assert.match(sessionClient, /message\.type === "session\.character-status"/u);
  assert.match(sessionUi, /Live Rolls/u);
  assert.match(sessionUi, /\{roll\.character\.name\} — \{roll\.label\}/u);
  assert.match(sessionUi, />Party</u);
  assert.match(sessionClient, /ws\.onopen = \(\) => \{[\s\S]*?void load\(\)/u);
});
