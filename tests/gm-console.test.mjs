import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BestiaryBrowseItem } from "../app/campaigns/bestiary-browse.ts";
import { builtInBestiaryCreatures, searchBestiaryCreatures } from "../lib/campaigns/bestiary.ts";

test("GM Console is owner-gated and reuses the existing session, encounter, party, and roll components", async () => {
  const [page, consoleUi, encounterRoute, detail, migration, threatMigration, styles] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/gm/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/encounter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_campaign_npc_templates.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_campaign_npc_threat_stats.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /campaign\.ownerUserId !== actor\.userId/u);
  assert.match(page, /notFound\(\)/u);
  assert.match(consoleUi, /useCampaignLiveSession/u);
  assert.match(consoleUi, /EncounterTracker/u);
  assert.match(consoleUi, /GmPartyStatus/u);
  assert.match(consoleUi, /\/api\/campaigns\/\$\{campaignId\}\/gm\/party/u);
  assert.match(consoleUi, /System Strain/u);
  assert.match(consoleUi, /Physical/u);
  assert.doesNotMatch(consoleUi, /Start a session to view party presence/u);
  assert.match(consoleUi, /RollResultTray/u);
  assert.match(consoleUi, /RollHistoryPanel/u);
  assert.match(consoleUi, /RulesAssistant/u);
  assert.match(consoleUi, /<RulesAssistant className="gm-console-rules-assistant" id="gm-rules-question" \/>/u);
  assert.doesNotMatch(consoleUi, /<RulesAssistant compact/u);
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
  assert.match(consoleUi, /Search name or description/u);
  assert.match(consoleUi, /Copy to NPC Library/u);
  assert.match(consoleUi, /Source & license/u);
  assert.match(consoleUi, /BestiaryBrowseItem/u);
  assert.match(consoleUi, /filteredCreatures\.map\(creature => <BestiaryBrowseItem/u);
  assert.match(consoleUi, /WWN Encounter Estimate/u);
  assert.match(consoleUi, /calculateWwnThreatEstimate/u);
  assert.match(consoleUi, /Assumed creature quantity/u);
  assert.match(consoleUi, /Minimum Hit Dice/u);
  assert.match(consoleUi, /Maximum Hit Dice/u);
  assert.match(consoleUi, /Estimated threat/u);
  assert.match(consoleUi, /Link campaign characters to estimate encounter threat/u);
  assert.match(consoleUi, /\/api\/campaigns\/\$\{campaignId\}\/characters/u);
  assert.match(consoleUi, /character\.threatLevel/u);
  assert.doesNotMatch(consoleUi, /character => character\.level/u);
  assert.match(consoleUi, /wwnThreatEstimateProvenance/u);
  assert.match(consoleUi, /partyLevels=\{partyLevels\}/u);
  assert.match(consoleUi, /partyLoaded=\{partyLoaded\}/u);
  assert.equal((consoleUi.match(/<BestiaryStatBlock/g) ?? []).length, 1, "only the selected creature mounts a full stat block");
  assert.match(consoleUi, /data-mobile-view=\{mobileView\}/u);
  assert.match(consoleUi, /setMobileView\("browse"\)/u);
  assert.match(styles, /\.gm-bestiary-list\{[^}]*max-height:min\(66vh,720px\)[^}]*overflow:auto/u);
  assert.match(styles, /\.gm-bestiary-browser\{display:grid;grid-template-columns:minmax\(270px,\.72fr\) minmax\(0,1\.28fr\)/u);
  assert.match(styles, /\.gm-bestiary-browser\[data-mobile-view="detail"\] \.gm-bestiary-browse/u);
  assert.match(styles, /\.gm-bestiary-filters\{display:grid/u);
  assert.match(styles, /\.gm-bestiary-threat-grid/u);
  assert.match(consoleUi, /End Session/u);
  assert.match(consoleUi, /action\(session \? "end" : "start"\)/u);
  assert.doesNotMatch(consoleUi, /Session Active/u);
  assert.match(consoleUi, /Duplicate/u);
  assert.match(consoleUi, /Confirm Delete/u);
  assert.match(consoleUi, /Add to Encounter/u);
  assert.match(consoleUi, /Threat data/u);
  assert.match(consoleUi, /Attacks per Main Action/u);
  assert.match(consoleUi, /Attacks \/ Action/u);
  assert.match(consoleUi, /Default HP is a table-ready value derived from Hit Dice/u);
  assert.match(consoleUi, /Usual armor in the SRD/u);
  assert.match(consoleUi, /Mage level \{creature\.spellcasting\.level\}/u);
  assert.match(consoleUi, /TWE-curated representative loadout/u);
  assert.match(consoleUi, /creature\.spellcasting\.spells\.map/u);
  assert.match(consoleUi, /creature\.spellcasting\.arts\.map/u);
  assert.match(consoleUi, /attack\.shock/u);
  assert.match(consoleUi, /Weapon starter/u);
  assert.match(consoleUi, /npcWeaponStarters/u);
  assert.match(consoleUi, /Move attack/u);
  assert.match(consoleUi, /Shock/u);
  assert.match(encounterRoute, /add_saved_npc/u);
  assert.match(encounterRoute, /add_bestiary_npc/u);
  assert.match(encounterRoute, /builtInBestiaryEncounterSeed/u);
  assert.match(encounterRoute, /campaignNpcEncounterSeed/u);
  assert.match(encounterRoute, /durable\.addNpc\(authorization\.sessionId, seed\)/u);
  assert.match(detail, /Open GM Console/u);
  assert.match(migration, /campaign_npc_templates/u);
  assert.match(migration, /ON DELETE CASCADE/u);
  assert.match(threatMigration, /ADD COLUMN hit_dice/u);
  assert.match(threatMigration, /ADD COLUMN attacks_per_main_action/u);
});

test("GM party route is owner-scoped and returns only a derived projection", async () => {
  const [route, service] = await Promise.all([
    readFile(new URL("../app/api/campaigns/[id]/gm/party/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/gm-party.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getSessionActor\(request\)/u);
  assert.match(route, /listGmPartyCharacters/u);
  assert.match(route, /cache-control.*no-store/u);
  assert.match(service, /campaign\.ownerUserId !== actor\.userId/u);
  assert.match(service, /campaignGmPartyStatus/u);
  assert.doesNotMatch(service, /character:\s*data/u);
});

test("Bestiary renders a 512-entry synthetic test catalog as compact browse rows", () => {
  const baseCreature = builtInBestiaryCreatures[0];
  const syntheticCatalog = Array.from({ length: 512 }, (_, index) => ({
    ...baseCreature,
    id: `synthetic-${index}`,
    name: `Synthetic Creature ${String(512 - index).padStart(3, "0")}`,
    description: index === 311 ? "Needle-in-a-haystack synthetic creature." : "Synthetic test-only creature description.",
  }));
  const sortedCreatures = searchBestiaryCreatures(syntheticCatalog, "");
  const markup = renderToStaticMarkup(createElement(
    "ul",
    { className: "gm-bestiary-list" },
    sortedCreatures.map((creature, index) => createElement(BestiaryBrowseItem, { key: creature.id, creature, selected: index === 0, onSelect: () => {} })),
  ));

  assert.equal((markup.match(/class="gm-bestiary-row"/gu) ?? []).length, 512);
  assert.match(markup, /Synthetic Creature 001/u);
  assert.doesNotMatch(markup, /gm-bestiary-stat-block/u);
});
