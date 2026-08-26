import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GM Console is owner-gated and reuses the existing session, encounter, party, and roll components", async () => {
  const [page, consoleUi, encounterRoute, detail, migration] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/gm/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/encounter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_campaign_npc_templates.sql", import.meta.url), "utf8"),
  ]);
  assert.match(page, /campaign\.ownerUserId !== actor\.userId/u);
  assert.match(page, /notFound\(\)/u);
  assert.match(consoleUi, /useCampaignLiveSession/u);
  assert.match(consoleUi, /EncounterTracker/u);
  assert.match(consoleUi, /PartyMember/u);
  assert.match(consoleUi, /RollResultTray/u);
  assert.match(consoleUi, /RollHistoryPanel/u);
  assert.match(consoleUi, /npc_prepare/u);
  assert.match(consoleUi, /npc_publish/u);
  assert.match(consoleUi, /VirtualDiceOverlay/u);
  assert.match(consoleUi, /canManageEncounter/u);
  assert.match(consoleUi, /Recent shared campaign rolls/u);
  assert.match(consoleUi, /aria-expanded=\{rollHistoryOpen\}/u);
  assert.match(consoleUi, /pendingLatestRoll/u);
  assert.match(consoleUi, /sharedHistory\[0\]/u);
  assert.match(consoleUi, /roll\.dice\.results/u);
  assert.doesNotMatch(consoleUi, /rollDice\(/u);
  assert.doesNotMatch(consoleUi, /ConsoleTab = .*"rolls"/u);
  assert.doesNotMatch(consoleUi, /tab === "rolls"/u);
  assert.match(consoleUi, /Create NPC/u);
  assert.match(consoleUi, /Built-In Bestiary/u);
  assert.match(consoleUi, /Search creatures/u);
  assert.match(consoleUi, /Save as My NPC/u);
  assert.match(consoleUi, /End Session/u);
  assert.match(consoleUi, /Duplicate/u);
  assert.match(consoleUi, /Confirm Delete/u);
  assert.match(consoleUi, /Add to Encounter/u);
  assert.match(encounterRoute, /add_saved_npc/u);
  assert.match(encounterRoute, /add_bestiary_npc/u);
  assert.match(encounterRoute, /builtInBestiaryEncounterSeed/u);
  assert.match(encounterRoute, /campaignNpcEncounterSeed/u);
  assert.match(encounterRoute, /durable\.addNpc\(authorization\.sessionId, seed\)/u);
  assert.match(detail, /Open GM Console/u);
  assert.match(migration, /campaign_npc_templates/u);
  assert.match(migration, /ON DELETE CASCADE/u);
});
