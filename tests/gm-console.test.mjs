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
  assert.match(consoleUi, /SharedRoll/u);
  assert.match(consoleUi, /Create NPC/u);
  assert.match(consoleUi, /End Session/u);
  assert.match(consoleUi, /Duplicate/u);
  assert.match(consoleUi, /Confirm Delete/u);
  assert.match(consoleUi, /Add to Encounter/u);
  assert.match(encounterRoute, /add_saved_npc/u);
  assert.match(encounterRoute, /campaignNpcEncounterSeed/u);
  assert.match(encounterRoute, /durable\.addNpc\(authorization\.sessionId, seed\)/u);
  assert.match(detail, /Open GM Console/u);
  assert.match(migration, /campaign_npc_templates/u);
  assert.match(migration, /ON DELETE CASCADE/u);
});
