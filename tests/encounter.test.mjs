import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collapsedNpcCombatSummary, encounterCurrentAfterRemoval, encounterTurnTransition } from "../lib/campaigns/encounter.ts";
import { memberEncounterProjection, normalizeCampaignNpcCombatStats } from "../lib/campaigns/live-session.ts";

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

test("combat summary presentation supports rich, custom, sparse, and legacy NPC snapshots", () => {
  const rich = collapsedNpcCombatSummary({
    saves: { physical: 12, evasion: 13, mental: 14 },
    attacks: [{ name: "Bite", attackBonus: 4, damage: "1d8", description: "" }, { name: "Claw", attackBonus: 3, damage: "1d6", description: "" }],
    notes: "",
    sourceStats: { hitDice: 3, shock: "2/13", move: "40'", morale: 8, instinct: 5, skill: 1 },
  });
  assert.deepEqual(rich, { saves: "P 12 · E 13 · M 14", primaryAttack: "Bite +4 · 1d8", additionalAttacks: 1, shock: "2/13", move: "40'", morale: 8 });

  const custom = collapsedNpcCombatSummary({
    saves: { physical: 15, evasion: 14, mental: 13 },
    attacks: [{ name: "Spear", attackBonus: 2, damage: "1d6", description: "" }],
    notes: "Campaign guard",
  });
  assert.deepEqual(custom, { saves: "P 15 · E 14 · M 13", primaryAttack: "Spear +2 · 1d6", additionalAttacks: 0, shock: null, move: null, morale: null });

  assert.equal(collapsedNpcCombatSummary(undefined), null);
});

test("legacy encounter combat snapshots gain empty Bundle 7 magic arrays without losing data", () => {
  const legacy = {
    saves: { physical: 12, evasion: 13, mental: 14 },
    attacks: [{ name: "Spear", attackBonus: 2, damage: "1d6", description: "" }],
    notes: "Existing encounter NPC",
    sourceStats: { hitDice: 2, shock: "1/AC 13", move: "30'", morale: 7, instinct: 4, skill: 0 },
  };
  const normalized = normalizeCampaignNpcCombatStats(legacy);
  assert.deepEqual(normalized?.spells, []);
  assert.deepEqual(normalized?.arts, []);
  assert.deepEqual(normalized?.attacks, legacy.attacks);
  assert.equal(normalized?.notes, legacy.notes);
  assert.equal(normalizeCampaignNpcCombatStats({}), undefined);
});

test("encounters stay durable, ordered, owner-controlled, and realtime", async () => {
  const [durable, route, sessionRoute, sessionUi, sessionClient, sessionCss] = await Promise.all([
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/encounter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-live-session.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8"),
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
  assert.match(route, /npc_combat/u);
  assert.match(route, /normalizeNpcAttacks/u);
  assert.match(durable, /setNpcCombatStats/u);
  assert.match(durable, /restoreBestiaryEncounterAbilities/u);
  assert.match(route, /moveTurn/u);
  assert.match(sessionRoute, /durable\.encounter\(result\.state\.session\.id\)/u);
  assert.match(sessionClient, /message\.type === "session\.encounter"/u);
  assert.match(sessionUi, /Start Encounter/u);
  assert.match(sessionUi, /Previous Turn/u);
  assert.match(sessionUi, /Next Turn/u);
  assert.match(sessionUi, /Live Rolls/u);
  assert.match(sessionUi, /collapsedNpcCombatSummary/u);
  assert.match(sessionUi, /campaign-encounter-npc-combat/u);
  assert.match(sessionUi, /campaign-encounter-npc-combat-empty/u);
  assert.match(sessionUi, /combatant\.kind === "npc" && <NpcCombatStrip stats=\{canManage \? combatant\.combatStats : undefined\}/u);
  assert.match(sessionUi, /additionalAttacks/u);
  assert.match(sessionUi, /campaign-encounter-hp-control/u);
  assert.match(sessionUi, /campaign-encounter-initiative/u);
  assert.match(sessionUi, /campaign-encounter-pc/u);
  assert.match(sessionUi, /campaign-encounter-npc-row/u);
  assert.match(sessionUi, /campaign-encounter-pc-context/u);
  assert.match(sessionUi, /<span>Initiative<\/span>/u);
  assert.match(sessionUi, /\$\{name\} initiative/u);
  assert.match(sessionUi, /campaign-encounter-friendly-actions/u);
  assert.match(sessionUi, /campaign-friendly-badge/u);
  assert.match(sessionUi, /stats\.abilities/u);
  assert.match(sessionUi, /Traits &amp; abilities/u);
  assert.ok(sessionUi.indexOf("Traits &amp; abilities") > sessionUi.indexOf("<h4>Attacks</h4>"), "source abilities render after attacks");
  assert.match(sessionUi, /NpcRollButtons/u);
  assert.match(sessionUi, /Physical Save/u);
  assert.match(sessionUi, /Edit encounter combat/u);
  assert.match(sessionUi, /Save encounter combat/u);
  assert.match(sessionUi, /Changes apply only to this encounter instance/u);
  assert.match(sessionUi, /Encounter Threat/u);
  assert.match(sessionUi, /summarizeEncounterThreat/u);
  assert.match(sessionUi, /Partial estimate/u);
  assert.match(sessionUi, /Link campaign characters to estimate encounter threat/u);
  assert.match(sessionUi, /partyLevels/u);
  assert.match(sessionUi, /canRollDamage/u);
  assert.match(sessionUi, /canManage && onNpcRoll/u);
  assert.match(sessionCss, /campaign-encounter-initiative\{grid-column:3;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-pc-context\{display:grid/u);
  assert.match(sessionCss, /campaign-encounter-pc>\.campaign-encounter-initiative\{grid-column:4;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-npc-row>\.campaign-encounter-initiative,.campaign-encounter-pc>\.campaign-encounter-initiative\{grid-column:4;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-npc-row>\.campaign-encounter-hp,.campaign-encounter-pc>\.campaign-encounter-hp\{grid-column:5;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-npc-row>\.campaign-encounter-ac,.campaign-encounter-pc>\.campaign-encounter-ac\{grid-column:6;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-pc>\.campaign-encounter-pc-context\{grid-column:1\/-1;grid-row:2\}/u);
  assert.match(sessionCss, /campaign-encounter-hp\{grid-column:4;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-ac\{grid-column:5;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-encounter-remove\{grid-column:6;grid-row:1\}/u);
  assert.match(sessionCss, /campaign-npc-roll-controls/u);
  assert.match(sessionCss, /campaign-encounter-threat/u);
  assert.match(sessionCss, /campaign-encounter-npc-combat \.campaign-npc-roll-controls\{display:none/u);
  assert.match(sessionCss, /campaign-encounter-npc-row>\.campaign-encounter-friendly-actions\{grid-column:2;grid-row:2/u);
  assert.match(sessionCss, /campaign-encounter-friendly-actions\{grid-column:1\/-1;grid-row:3\}/u);
  assert.match(sessionCss, /campaign-encounter-npc\{grid-template-columns:minmax\(180px,1fr\) repeat\(4,minmax\(68px,82px\)\) auto auto\}/u);
  assert.match(sessionCss, /campaign-encounter-hp-control input\{width:52px;box-sizing:border-box\}/u);
  assert.match(sessionCss, /campaign-encounter-friendly input\{width:34px;height:34px;margin:0;accent-color:#ad762b\}/u);
  assert.match(sessionCss, /campaign-encounter-threat>summary::before\{content:"▸"/u);
  assert.match(sessionCss, /campaign-encounter-threat\[open\]>summary::before\{content:"▾"\}/u);
});
