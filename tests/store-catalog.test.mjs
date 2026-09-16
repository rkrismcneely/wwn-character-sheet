import assert from "node:assert/strict";
import test from "node:test";
import {
  storeCatalog,
  storeCatalogById,
  storeCatalogCategories,
  storeCatalogSourceCounts,
} from "../app/store-catalog-data.ts";
import { purchasableEquipment } from "../app/equipment-data.ts";

test("store catalog adds categorized store-only content without expanding player equipment", () => {
  assert.equal(storeCatalogById.size, storeCatalog.length);
  assert.equal(storeCatalogSourceCounts.tidal, 38);
  assert.ok(storeCatalogSourceCounts.equipmentEmporium > 700);
  assert.ok(storeCatalogSourceCounts.wwn > purchasableEquipment.length);

  for (const item of storeCatalog) {
    assert.ok(storeCatalogCategories.includes(item.category), `${item.name} has a valid category`);
    assert.ok(item.defaultCost, `${item.name} has a default cost`);
    assert.ok(item.sourceLabel, `${item.name} has source metadata`);
    assert.ok(item.license, `${item.name} has license metadata`);
  }

  assert.equal(purchasableEquipment.some(item => item.name === "Camel"), false);
  assert.equal(purchasableEquipment.some(item => item.name === "Potion of Healing"), false);
  assert.equal(purchasableEquipment.some(item => item.name.startsWith("Scroll of ")), false);
});

test("canonical WWN prices win over imported duplicates", () => {
  const horse = storeCatalog.find(item => item.name === "Horse, riding");
  const chicken = storeCatalog.find(item => item.name === "Chicken");
  const cow = storeCatalog.find(item => item.name === "Cow");
  const rowboat = storeCatalog.find(item => item.name === "Rowboat");

  assert.deepEqual([horse?.source, horse?.defaultCost], ["wwn-srd", "200 sp"]);
  assert.deepEqual([chicken?.source, chicken?.defaultCost], ["wwn-srd", "5 cp"]);
  assert.deepEqual([cow?.source, cow?.defaultCost], ["wwn-srd", "10 sp"]);
  assert.deepEqual([rowboat?.source, rowboat?.defaultCost], ["wwn-srd", "30 sp"]);

  assert.equal(storeCatalog.filter(item => item.name === "Chicken").length, 1);
  assert.equal(storeCatalog.filter(item => item.name === "Cow").length, 1);
  assert.equal(storeCatalog.filter(item => item.name === "Rowboat").length, 1);
});

test("Equipment Emporium prices are normalized to the WWN silver economy", () => {
  const camel = storeCatalog.find(item => item.name === "Camel");
  const waterClock = storeCatalog.find(item => item.name === "Water Clock");
  const mandrake = storeCatalog.find(item => item.name === "Mandrake root");
  const commonRodent = storeCatalog.find(item => item.name === "Rodent (Common)");
  const platinum = storeCatalog.find(item => item.name === "Platinum, per lb");

  assert.deepEqual([camel?.source, camel?.defaultCost], ["equipment-emporium", "75 sp"]);
  assert.deepEqual([waterClock?.source, waterClock?.defaultCost], ["equipment-emporium", "1,000 sp"]);
  assert.equal(mandrake?.defaultCost, "2 sp 5 cp");
  assert.equal(commonRodent?.defaultCost, "1 cp");
  assert.equal(platinum?.defaultCost, "45 sp");
});

test("selected Tidal magic items use audited WWN prices", () => {
  const healing = storeCatalog.find(item => item.name === "Potion of Healing");
  const waterBreathing = storeCatalog.find(item => item.name === "Potion of Water Breathing");
  const immovableRod = storeCatalog.find(item => item.name === "Immovable Rod");
  const dragonSlayer = storeCatalog.find(item => item.name === "Dragon Slayer");

  assert.deepEqual([healing?.source, healing?.category, healing?.defaultCost], ["tidal", "Potions", "250 sp"]);
  assert.equal(waterBreathing?.defaultCost, "500 sp");
  assert.equal(immovableRod?.defaultCost, "12,500 sp");
  assert.equal(dragonSlayer?.defaultCost, "50,000 sp");
});

test("WWN High Magic spells are available as priced scrolls", () => {
  const scrolls = storeCatalog.filter(item => item.category === "Scrolls");
  assert.ok(scrolls.length > 0);
  for (const scroll of scrolls) {
    const level = Number(scroll.subcategory.replace("Level ", ""));
    assert.ok(level >= 1 && level <= 5);
    assert.equal(scroll.defaultCost, `${(level * 1_000).toLocaleString("en-US")} sp`);
    assert.equal(scroll.source, "wwn-srd");
  }
});
