import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  campaignInventoryArmor,
  campaignInventoryKindLabel,
  campaignInventorySnapshot,
  campaignInventoryValue,
  campaignInventoryWeapon,
  inventoryItemDisplayName,
  inventoryItemDescription,
} from "../lib/inventory/items.ts";

test("campaign inventory values preserve stable identity and a readable snapshot", () => {
  const item = {
    id: "citem_example",
    campaignId: "cmp_example",
    name: "Moon-Silver Key",
    kind: "magical",
    description: "Opens doors marked with the lunar seal.",
  };
  const value = campaignInventoryValue(item);
  assert.notEqual(value, item.name);
  assert.deepEqual(campaignInventorySnapshot(value), item);
  assert.equal(inventoryItemDisplayName(value), item.name);
  assert.equal(inventoryItemDescription(value), item.description);
  assert.equal(inventoryItemDisplayName("Rope, 20m"), "Rope, 20m");
  assert.equal(campaignInventorySnapshot("Rope, 20m"), null);
  assert.equal(campaignInventorySnapshot("__twe_campaign_item__%7Bbroken"), null);
});

test("campaign equipment snapshots expose weapon and armour mechanics without changing legacy values", () => {
  const weapon = {
    id: "citem_weapon",
    campaignId: "cmp_example",
    name: "Harbor Spear",
    kind: "weapon",
    description: "A spear made for dockside defense.",
    properties: { weapon: { damage: "1d6", shock: "2/AC 13", range: "30/60", attribute: "Str/Dex", skill: "Stab", encumbrance: 1, traits: "T" } },
  };
  const armor = {
    id: "citem_armor",
    campaignId: "cmp_example",
    name: "Harbor Buckler",
    kind: "armor",
    description: "A compact shield.",
    properties: { armor: { armorClass: 13, encumbrance: 1, shield: "small", restrictions: "", properties: "Ignores the first Shock instance each round." } },
  };
  const weaponValue = campaignInventoryValue(weapon);
  const armorValue = campaignInventoryValue(armor);
  assert.deepEqual(campaignInventorySnapshot(weaponValue), weapon);
  assert.deepEqual(campaignInventorySnapshot(armorValue), armor);
  assert.deepEqual(campaignInventoryWeapon(weaponValue), { name: "Harbor Spear", damage: "1d6", shock: "2/AC 13", range: "30/60", attribute: "Str/Dex", skill: "Stab", enc: "1", cost: "-", traits: "T" });
  assert.deepEqual(campaignInventoryArmor(armorValue), { name: "Harbor Buckler", ac: 13, enc: 1, shield: "small", restrictions: "", properties: "Ignores the first Shock instance each round." });
  assert.equal(campaignInventoryKindLabel("armor"), "Armour");
  assert.match(inventoryItemDescription(armorValue), /Ignores the first Shock instance/u);
});

test("campaign item persistence and APIs keep visibility server-authoritative", async () => {
  const [migration, equipmentMigration, service, listRoute, itemRoute, gmLibrary, gmConsole, migrationScript, deployWorkflow] = await Promise.all([
    readFile(new URL("../drizzle/0016_campaign_items.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0019_campaign_item_equipment.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/items.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/items/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/items/[itemId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-item-library.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/migrate-campaign-items.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-production.yml", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /CREATE TABLE `campaign_items`/u);
  assert.match(migration, /CREATE TABLE `campaign_item_characters`/u);
  assert.match(migration, /visibility_mode/u);
  assert.match(migration, /campaign_items_kind_check/u);
  assert.match(equipmentMigration, /properties_json/u);
  assert.match(equipmentMigration, /'weapon', 'armor'/u);
  assert.match(service, /Only the campaign owner can manage campaign items/u);
  assert.match(service, /Every selected character must be linked to this campaign/u);
  assert.match(service, /ci\.visibility_mode = 'all'/u);
  assert.match(service, /campaign_item_characters/u);
  assert.match(service, /character\.ownerUserId !== actor\.userId/u);
  assert.match(listRoute, /searchParams\.get\("characterId"\)/u);
  assert.match(listRoute, /listCampaignItemsForCharacter/u);
  assert.match(itemRoute, /updateCampaignItem/u);
  assert.match(itemRoute, /deleteCampaignItem/u);
  assert.match(gmLibrary, /All linked players/u);
  assert.match(gmLibrary, /Selected characters only/u);
  assert.match(gmLibrary, /Mundane/u);
  assert.match(gmLibrary, /Magical/u);
  assert.match(gmLibrary, /Armour/u);
  assert.match(gmLibrary, /Weapon properties/u);
  assert.match(gmConsole, /CampaignItemLibrary/u);
  assert.match(gmConsole, /"items"/u);
  assert.match(migrationScript, /0016_campaign_items\.sql/u);
  assert.match(migrationScript, /0019_campaign_item_equipment\.sql/u);
  assert.match(deployWorkflow, /migrate-campaign-items/u);
});

test("character inventory supports unlimited Stored Items and campaign-item pickers without replacing legacy string arrays", async () => {
  const [sheet, storedItems, css] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/inventory-stored-items.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /stored:\s*\[\]/u);
  assert.match(storedItems, /Stored Items/u);
  assert.match(storedItems, /does not count against Strength/u);
  assert.match(sheet, /campaignInventoryValue/u);
  assert.match(sheet, /campaignInventorySnapshot/u);
  assert.match(storedItems, /\/items\?characterId=/u);
  assert.match(sheet, /moveStowedToStored/u);
  assert.match(sheet, /moveStoredToStowed/u);
  assert.match(sheet, /inventoryItemDisplayName/u);
  assert.match(sheet, /campaignInventoryWeapon/u);
  assert.match(sheet, /campaignInventoryArmor/u);
  assert.match(sheet, /campaignArmorItems/u);
  assert.match(css, /stored-items-section/u);
  assert.match(css, /campaign-item-description/u);
});
