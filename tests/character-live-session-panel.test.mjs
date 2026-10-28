import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("character-sheet Live Session panel reuses the campaign transport and keeps local history separate", async () => {
  const [sheet, panel, hook, discoveryRoute] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-live-session-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/live-sessions/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /CharacterLiveSessionPanel/u);
  assert.match(sheet, /Roll History/u);
  assert.match(sheet, /liveRollCampaignId/u);
  assert.match(panel, /Join Live Session/u);
  assert.match(panel, />Party</u);
  assert.match(panel, />Encounter/u);
  assert.match(panel, />Recent Rolls</u);
  assert.doesNotMatch(panel, /Open Full Session/u);
  assert.match(panel, /groupedCombatants\.map/u);
  assert.match(panel, /character-live-session-grid/u);
  assert.match(panel, /onJoinedSessionChange/u);
  assert.match(panel, /activeCampaigns\.length > 1/u);
  assert.match(hook, /\/api\/campaigns\/\$\{campaignId\}\/session\/live/u);
  assert.match(hook, /message\.type === "session\.encounter"/u);
  assert.match(hook, /message\.type === "session\.ended"/u);
  assert.match(hook, /recentRolls\.some\(roll => roll\.id === message\.roll\.id\)/u);
  assert.match(discoveryRoute, /listActiveCharacterLiveSessionCampaigns/u);
});

test("Live Session compact dashboard shows full order, adaptive rolls, and clear presence",async()=>{
 const panel=await readFile(new URL("../app/character-live-session-panel.tsx",import.meta.url),"utf8");
 const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
 assert.match(panel,/groupedCombatants\.map/u);
 assert.doesNotMatch(panel,/visibleEncounterCount/u);
 assert.match(panel,/ResizeObserver/u);
 assert.match(panel,/recentRolls\.slice\(0, rollLimit\)/u);
 assert.match(panel,/character-live-heading-status/u);
 assert.match(panel,/character-live-presence-offline/u);
 assert.match(css,/character-live-presence-offline\{background:transparent/u);
});

test("Live session refresh preserves websocket presence and resets it on disconnect",async()=>{
 const hook=await readFile(new URL("../app/campaigns/use-live-session.ts",import.meta.url),"utf8");
 assert.match(hook,/latestPresence = useRef/u);
 assert.match(hook,/presence\.keys\.has\(participant\.participantKey\)/u);
 assert.match(hook,/latestPresence\.current = \{ sessionId, keys \}/u);
 assert.match(hook,/latestPresence\.current = null/u);
});
