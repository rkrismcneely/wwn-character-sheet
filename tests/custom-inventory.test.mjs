import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  customInventoryItemNames,
  isCustomInventoryItem,
} from "../app/custom-inventory.ts";
import { officialInventoryItems } from "../app/equipment-data.ts";
import { campaignInventoryValue } from "../lib/inventory/items.ts";

const campaignItem = campaignInventoryValue({
  id: "item-1",
  campaignId: "campaign-1",
  name: "Campaign Relic",
  kind: "mundane",
  description: "A campaign item.",
});

test("custom inventory catalog includes only character-created item names", () => {
  const official = officialInventoryItems[0];
  assert.ok(official);
  assert.equal(isCustomInventoryItem(official), false);
  assert.equal(isCustomInventoryItem(campaignItem), false);
  assert.equal(isCustomInventoryItem("Clockwork Bird"), true);
  assert.equal(isCustomInventoryItem("  "), false);

  assert.deepEqual(
    customInventoryItemNames([
      ["Clockwork Bird", official],
      ["Silver Key", "Clockwork Bird", campaignItem],
    ]),
    ["Clockwork Bird", "Silver Key"],
  );
});

test("a custom item disappears from the catalog after its last owned copy is dropped", () => {
  const beforeDrop = customInventoryItemNames([
    ["Clockwork Bird"],
    [],
    [],
  ]);
  assert.deepEqual(beforeDrop, ["Clockwork Bird"]);

  const afterDrop = customInventoryItemNames([
    [],
    [],
    [],
  ]);
  assert.deepEqual(afterDrop, []);
});

test("custom item entry is a draft until Save and hides inventory actions while unsaved", async () => {
  const sheet = await readFile(
    new URL("../app/character-sheet.tsx", import.meta.url),
    "utf8",
  );
  const stored = await readFile(
    new URL("../app/inventory-stored-items.tsx", import.meta.url),
    "utf8",
  );

  assert.match(sheet, /const \[otherStowedDraftName, setOtherStowedDraftName\] = useState\("")/u);
  assert.match(sheet, /setOtherStowedIndex\(i\);\s*setOtherStowedDraftName\("");/u);
  assert.match(sheet, /value=\{otherStowedDraftName\}/u);
  assert.match(sheet, /className="custom-item-save"/u);
  assert.match(sheet, /setStowedItem\(i, name\);\s*setOtherStowedIndex\(null\)/u);
  assert.match(sheet, /item && !editingOther && <span className="inventory-item-actions"/u);
  assert.match(sheet, /<optgroup label="Custom Items">/u);

  assert.match(stored, /const \[otherDraft, setOtherDraft\] = useState\("")/u);
  assert.match(stored, /value=\{otherDraft\}/u);
  assert.match(stored, /className="custom-item-save"/u);
  assert.match(stored, /item && !editingOther && <span className="inventory-item-actions"/u);
  assert.match(stored, /<optgroup label="Custom Items">/u);
});

test("companion Other-item flow also waits for Save before mutating inventory", async () => {
  const sheet = await readFile(
    new URL("../app/character-sheet.tsx", import.meta.url),
    "utf8",
  );

  assert.match(sheet, /companionOtherStowedDrafts/u);
  assert.match(
    sheet,
    /setCompanionOtherStowedDrafts\(current => \(\{ \.\.\.current, \[companion\.id\]: "" \}\)\)/u,
  );
  assert.match(sheet, /setCompanionStowedItem\(index, name\)/u);
  assert.match(sheet, /item && !editingOther && <button type="button" className="drop-item"/u);
});
