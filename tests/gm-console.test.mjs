import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BestiaryBrowseItem } from "../app/campaigns/bestiary-browse.ts";
import { builtInBestiaryCreatures, searchBestiaryCreatures } from "../lib/campaigns/bestiary.ts";

test("GM Console is owner/admin-gated and reuses the existing session, encounter, party, and roll components", async () => {
  const [page, consoleUi, encounterRoute, detail, migration, threatMigration, styles, rollToolbarStyles] = await Promise.all([
    readFile(new URL("../app/campaigns/[id]/gm/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/encounter/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-detail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_campaign_npc_templates.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_campaign_npc_threat_stats.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console-roll-toolbar.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /canManageCampaignRuntime\(actor, campaign\)/u);
  assert.match(page, /notFound\(\)/u);
  assert.match(page, /gm-console-roll-toolbar\.css/u);
  assert.match(consoleUi, /useCampaignLiveSession/u);
  assert.match(consoleUi, /EncounterTracker/u);
  assert.match(consoleUi, /GmPartyStatus/u);
  assert.match(consoleUi, /\/api\/campaigns\/\$\{campaignId\}\/gm\/party/u);
  assert.match(consoleUi, /System Strain/u);
  assert.match(consoleUi, /Physical/u);
  assert.match(consoleUi, /gm-party-status-core/u);
  assert.match(consoleUi, /gm-party-status-resources/u);
  assert.match(consoleUi, /className="gm-party-status-saves"/u);
  assert.match(consoleUi, /className="gm-party-status-save-grid"/u);
  assert.match(consoleUi, /Saving Throws/u);
  assert.match(styles, /\.gm-party-status-grid\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
  assert.match(styles, /@media\(max-width:1100px\)[\s\S]*?\.gm-party-status-grid\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(styles, /@media\(max-width:720px\)[\s\S]*?\.gm-party-status-grid\s*\{\s*grid-template-columns:minmax\(0,1fr\)/u);
  assert.match(styles, /\.gm-party-status-core\s*\{[^}]*grid-template-columns:minmax\(0,1\.15fr\)/u);
  assert.match(styles, /\.gm-party-status-save-grid\s*\{[^}]*repeat\(4,minmax\(0,1fr\)\)/u);
  assert.match(styles, /@media\(max-width:400px\)[\s\S]*?\.gm-party-status-save-grid\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(consoleUi, /const hasResources = character\.spellUsage !== null \|\| character\.effortCommitted !== null/u);
  assert.doesNotMatch(consoleUi, /<span>AC \{character\.armorClass\}<\/span>/u);
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
  assert.match(consoleUi, /Shared campaign rolls \+ private GM rolls visible only to the GM/u);
  assert.match(consoleUi, /aria-expanded=\{rollHistoryOpen\}/u);
  assert.match(consoleUi, /pendingLatestRoll/u);
  assert.match(consoleUi, /sharedHistory/u);
  assert.match(consoleUi, /privateGmRolls/u);
  assert.match(consoleUi, /const gmHistory = \[\.\.\.privateGmRolls, \.\.\.sharedHistory\]/u);
  assert.match(consoleUi, /history=\{gmHistory\}/u);
  assert.match(consoleUi, /Private GM Rolls/u);
  assert.match(consoleUi, /roll\.dice\.results/u);
  assert.doesNotMatch(consoleUi, /rollDice\(/u);
  assert.doesNotMatch(consoleUi, /ConsoleTab = .*"rolls"/u);
  assert.doesNotMatch(consoleUi, /tab === "rolls"/u);

  const gmQuickRollStart = consoleUi.indexOf("async function rollGmDice");
  const gmQuickRollEnd = consoleUi.indexOf("async function encounterAction", gmQuickRollStart);
  assert.ok(gmQuickRollStart >= 0 && gmQuickRollEnd > gmQuickRollStart, "GM quick-roll function remains in the console roll pipeline");
  const gmQuickRoll = consoleUi.slice(gmQuickRollStart, gmQuickRollEnd);
  assert.match(consoleUi, /resolveRoll/u);
  assert.match(gmQuickRoll, /category: "generic"/u);
  assert.match(gmQuickRoll, /character: \{ id: "gm-private", name: "GM" \}/u);
  assert.match(gmQuickRoll, /setPrivateGmRolls\(current => \[roll, \.\.\.current\]\.slice\(0, 50\)\)/u);
  assert.doesNotMatch(gmQuickRoll, /fetch\(/u, "private GM rolls never publish to the live-session endpoint");
  assert.match(consoleUi, /rollGmDice\(1, 20, "d20"\)/u);
  assert.match(consoleUi, /rollGmDice\(2, 6, "2d6"\)/u);
  assert.match(consoleUi, /aria-label="Roll a private GM d20"/u);
  assert.match(consoleUi, /aria-label="Roll private GM 2d6"/u);
  assert.match(rollToolbarStyles, /\.gm-console-private-rolls/u);
  assert.match(rollToolbarStyles, /\.gm-console-quick-roll/u);
  assert.match(rollToolbarStyles, /\.gm-console-history-count/u);
  assert.match(rollToolbarStyles, /@media\(max-width:640px\)/u);
  assert.match(rollToolbarStyles, /html\[data-theme="dark"\]/u);

  assert.match(consoleUi, /Create NPC/u);
  assert.match(consoleUi, /Built-In Bestiary/u);
  assert.match(consoleUi, /Search creatures/u);
  assert.match(consoleUi, /Search name or description/u);
  assert.match(consoleUi, /Copy to NPC Library/u);
  assert.match(consoleUi, /Source & license/u);
  assert.match(consoleUi, /BestiaryBrowseItem/u);
  assert.match(consoleUi, /visibleCreatures\.map\(creature => <BestiaryBrowseItem/u);
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
  assert.match(styles, /\.gm-party-status-core dd\s*\{[^}]*white-space:nowrap/u);
  assert.match(styles, /\.gm-party-status-saves h3\s*\{/u);
  assert.match(styles, /\.gm-party-status-save-grid > div\s*\{[^}]*border-left:1px/u);
  assert.match(styles, /\.gm-party-status-resources\s*\{\s*display:flex/u);
  assert.doesNotMatch(styles, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/u);
  assert.match(styles, /@media\(max-width:640px\)\s*\{[^}]*\.gm-party-status-card/u);
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
  assert.match(consoleUi, /Armor notation from the source statblock/u);
  assert.match(consoleUi, /Mage level \{creature\.spellcasting\.level\}/u);
  assert.match(consoleUi, /TWE-curated representative loadout/u);
  assert.match(consoleUi, /creature\.spellcasting\.spells\.map/u);
  assert.match(consoleUi, /creature\.spellcasting\.arts\.map/u);
  assert.match(consoleUi, /attack\.shock/u);
  assert.match(consoleUi, /Weapon starter/u);
  assert.match(consoleUi, /npcWeaponStarters/u);
  assert.match(consoleUi, /gm-npc-hp-roll/u);
  assert.match(consoleUi, /Roll HP/u);
  assert.match(consoleUi, /Add \{kind\}/u);
  assert.match(consoleUi, /Add attack from weapon or monster catalog/u);
  assert.match(consoleUi, /<optgroup label="Monster attacks">/u);
  assert.match(consoleUi, /Move attack/u);
  assert.match(consoleUi, /Shock/u);
  assert.match(encounterRoute, /add_saved_npc/u);
  assert.match(encounterRoute, /add_bestiary_npc/u);
  assert.match(encounterRoute, /builtInBestiaryEncounterSeed/u);
  assert.match(encounterRoute, /campaignNpcEncounterSeed/u);
  assert.match(encounterRoute, /durable\.addNpc\(authorization\.sessionId, seed\)/u);
  assert.match(detail, /aria-label="Campaign pages"/u);
  assert.match(detail, /campaign.permissions.canUseGmConsole/u);
  assert.match(detail, /<GmConsole campaignId=\{campaignId\}/u);
  assert.match(detail, /"encounter", "bestiary", "npcs", "items", "stores", "party", "recaps"/u);
  assert.match(migration, /campaign_npc_templates/u);
  assert.match(migration, /ON DELETE CASCADE/u);
  assert.match(threatMigration, /ADD COLUMN hit_dice/u);
  assert.match(threatMigration, /ADD COLUMN attacks_per_main_action/u);
});

test("GM party route is owner/admin-scoped and returns only a derived projection", async () => {
  const [route, service] = await Promise.all([
    readFile(new URL("../app/api/campaigns/[id]/gm/party/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/gm-party.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getSessionActor\(request\)/u);
  assert.match(route, /listGmPartyCharacters/u);
  assert.match(route, /cache-control.*no-store/u);
  assert.match(service, /canManageCampaignRuntime\(actor, campaign\)/u);
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
