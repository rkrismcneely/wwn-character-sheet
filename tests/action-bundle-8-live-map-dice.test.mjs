import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("published campaign rolls are exposed to the map without rerolling", async () => {
  const [liveSession, mapDice, adapter] = await Promise.all([
    read("app/campaigns/use-live-session.ts"),
    read("app/campaigns/campaign-map-shared-dice.tsx"),
    read("app/virtual-dice-adapter.ts"),
  ]);

  assert.match(liveSession, /campaignSharedRollEvent = "twe:campaign-shared-roll"/u);
  assert.match(liveSession, /message\.type === "session\.roll"/u);
  assert.match(liveSession, /roll: message\.roll/u);
  assert.match(mapDice, /const \{ count, sides, results \} = roll\.dice/u);
  assert.match(mapDice, /return results\.map\(value => \(\{ sides, value \}\)\)/u);
  assert.match(mapDice, /overlay\.current\?\.roll\(\{ dice, style \}\)/u);
  assert.match(adapter, /@\$\{request\.dice\.map\(die => die\.value\)\.join\(","\)\}/u);
  assert.doesNotMatch(mapDice, /Math\.random|crypto\.getRandomValues|rollDiceExpression/u);
});

test("live map dice respect GM, viewer, open-map, and reduced-motion controls", async () => {
  const [mapDice, launcher] = await Promise.all([
    read("app/campaigns/campaign-map-shared-dice.tsx"),
    read("app/campaigns/campaign-map-launcher.tsx"),
  ]);

  assert.match(mapDice, /!open \|\| !sharedRollDiceEnabled \|\| !virtualDiceEnabled \|\| reducedMotion/u);
  assert.match(mapDice, /prefers-reduced-motion: reduce/u);
  assert.match(mapDice, /action: "set_shared_roll_dice"/u);
  assert.match(mapDice, /Live Dice: \{sharedRollDiceEnabled \? "On" : "Off"\}/u);
  assert.match(mapDice, /canManage && <button/u);
  assert.match(launcher, /CampaignMapSharedDice/u);
  assert.match(launcher, /mapId=\{map\.id\} open=\{open\} canManage=\{canManage\}/u);
});

test("shared map dice preference is durable and migration-owned", async () => {
  const [service, route, migration, migrateScript, migrateWorkflow, deployWorkflow] = await Promise.all([
    read("lib/campaigns/map-interactions.ts"),
    read("app/api/campaigns/[id]/map/interactions/route.ts"),
    read("drizzle/0020_action_bundle_8_live_map_dice.sql"),
    read("scripts/migrate-campaign-map-foundation.mjs"),
    read(".github/workflows/migrate-campaign-map-foundation.yml"),
    read(".github/workflows/deploy-production.yml"),
  ]);

  assert.match(service, /sharedRollDiceEnabled: boolean/u);
  assert.match(service, /shared_roll_dice_enabled AS sharedRollDiceEnabled/u);
  assert.match(service, /setCampaignMapSharedRollDicePreference/u);
  assert.match(route, /body\.action === "set_shared_roll_dice"/u);
  assert.match(migration, /shared_roll_dice_enabled INTEGER NOT NULL DEFAULT 1/u);
  assert.match(migration, /CHECK \(shared_roll_dice_enabled IN \(0, 1\)\)/u);
  assert.match(migrateScript, /0020_action_bundle_8_live_map_dice\.sql/u);
  assert.match(migrateScript, /shared_roll_dice_enabled/u);
  assert.match(migrateWorkflow, /0020_action_bundle_8_live_map_dice\.sql/u);
  assert.match(deployWorkflow, /0020_action_bundle_8_live_map_dice/u);
});

test("active virtual dice use a contrast scrim", async () => {
  const overlay = await read("app/virtual-dice-overlay.tsx");
  assert.match(overlay, /background: active/u);
  assert.match(overlay, /rgba\(0, 0, 0, 0\.36\)/u);
  assert.match(overlay, /rgba\(35, 24, 12, 0\.20\)/u);
});
