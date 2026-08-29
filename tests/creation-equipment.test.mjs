import assert from "node:assert/strict";
import test from "node:test";
import {
  creationEquipmentRemainingCopper,
  purchaseCreationEquipment,
  removeCreationEquipmentPurchase,
  rollCreationStartingSilver,
  selectCreationEquipmentMethod,
  selectStartingEquipmentPackage,
} from "../app/creation-equipment.ts";
import {
  purchasableEquipmentById,
  startingEquipmentPackages,
} from "../app/equipment-data.ts";
import { weapons } from "../app/wwn-data.ts";

const baseState = (overrides = {}) => ({
  armor: "",
  shield: "",
  readied: [],
  stowed: [],
  sp: 0,
  cp: 0,
  creationEquipmentMethod: "",
  creationEquipmentPackage: "",
  creationStartingSilver: null,
  creationEquipmentPurchases: [],
  creationEquipmentBase: null,
  ...overrides,
});

const update = (state, result) => {
  assert.equal(result.ok, true, result.reason);
  return { ...state, ...result.update };
};

test("all six WWN Free Edition starting packages are available", () => {
  assert.deepEqual(
    startingEquipmentPackages.map((item) => item.name),
    [
      "Adventuring Peasant",
      "Ranger or Archer",
      "Armored Warrior",
      "Roguish Wanderer",
      "Gentry Wayfarer",
      "Mage, Healer, or Scholar",
    ],
  );
});

test("a package writes canonical equipment into finished-sheet fields", () => {
  let state = baseState();
  state = { ...state, ...selectCreationEquipmentMethod(state, "package") };
  state = update(
    state,
    selectStartingEquipmentPackage(state, "ranger-or-archer"),
  );

  assert.equal(state.armor, "Buff Coat");
  assert.equal(state.shield, "");
  assert.deepEqual(state.readied, ["Bow, Large", "Dagger", "Axe, Hand"]);
  assert.ok(state.stowed.includes("Arrows, 20"));
  assert.ok(state.stowed.includes("Rations, one week"));
  assert.equal(state.sp, 20);
  assert.equal(state.cp, 0);
  for (const name of state.readied)
    assert.ok(weapons.some((weapon) => weapon.name === name), `${name} is canonical`);

  const reloaded = structuredClone(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded, state);
});

test("package armor, shield, repeated weapons, gear, and coin use real sheet state", () => {
  let state = baseState();
  state = { ...state, ...selectCreationEquipmentMethod(state, "package") };
  state = update(
    state,
    selectStartingEquipmentPackage(state, "roguish-wanderer"),
  );
  assert.equal(state.armor, "Buff Coat");
  assert.equal(state.shield, "Small Shield");
  assert.equal(
    state.readied.filter((item) => item === "Throwing Blade").length,
    5,
  );
  assert.ok(state.stowed.includes("Grappling hook"));

  state = update(
    state,
    selectStartingEquipmentPackage(state, "mage-healer-or-scholar"),
  );
  assert.equal(state.armor, "");
  assert.equal(state.shield, "");
  assert.deepEqual(state.readied, ["Dagger", "Dagger", "Staff"]);
  assert.equal(state.sp, 80);
  assert.ok(!state.stowed.includes("Grappling hook"));
});

test("switching methods replaces generated state but preserves unrelated inventory", () => {
  let state = baseState({
    readied: ["Family blade"],
    stowed: ["Keepsake"],
    sp: 7,
    cp: 3,
  });
  state = { ...state, ...selectCreationEquipmentMethod(state, "package") };
  state = update(
    state,
    selectStartingEquipmentPackage(state, "armored-warrior"),
  );
  assert.deepEqual(state.readied, ["Family blade", "Sword, Short", "Dagger"]);
  assert.equal(state.shield, "Large Shield");

  state = { ...state, ...selectCreationEquipmentMethod(state, "buy") };
  assert.deepEqual(state.readied, ["Family blade"]);
  assert.deepEqual(state.stowed, ["Keepsake"]);
  assert.equal(state.shield, "");
  assert.equal(state.sp, 7);
  assert.equal(state.cp, 3);

  state = update(state, rollCreationStartingSilver(state, 10));
  state = update(state, purchaseCreationEquipment(state, "weapon:Dagger"));
  assert.deepEqual(state.readied, ["Family blade", "Dagger"]);
  assert.equal(state.sp, 104);
  assert.equal(state.cp, 3);
  assert.deepEqual(
    selectCreationEquipmentMethod(state, "buy").creationEquipmentPurchases,
    ["weapon:Dagger"],
  );

  state = { ...state, ...selectCreationEquipmentMethod(state, "package") };
  state = update(
    state,
    selectStartingEquipmentPackage(state, "adventuring-peasant"),
  );
  assert.ok(!state.readied.includes("Dagger") || state.readied.filter((item) => item === "Dagger").length === 1);
  assert.equal(state.sp, 7);
  assert.equal(state.cp, 3);
  assert.equal(state.creationEquipmentPurchases.length, 0);
});

test("starting silver is one 3d6 total multiplied by 10 and cannot be rerolled", () => {
  let state = baseState();
  state = { ...state, ...selectCreationEquipmentMethod(state, "buy") };
  state = update(state, rollCreationStartingSilver(state, 11));
  assert.equal(state.creationStartingSilver, 110);
  assert.equal(state.sp, 110);

  const reroll = rollCreationStartingSilver(state, 18);
  assert.equal(reroll.ok, false);
  assert.match(reroll.reason, /already been rolled/i);
  assert.equal(state.creationStartingSilver, 110);
  assert.equal(rollCreationStartingSilver(baseState({ creationEquipmentMethod: "buy" }), 2).ok, false);
});

test("buying deducts canonical prices, removal refunds exactly, and overspending is rejected", () => {
  let state = baseState();
  state = { ...state, ...selectCreationEquipmentMethod(state, "buy") };
  state = update(state, rollCreationStartingSilver(state, 3));

  const expectedCosts = new Map(weapons.map((weapon) => [weapon.name, weapon.cost]));
  assert.equal(purchasableEquipmentById.get("weapon:Sword, Short")?.costCopper, 100);
  assert.equal(expectedCosts.get("Sword, Short"), "10 sp");

  for (const id of [
    "weapon:Bow, Large",
    "weapon:Dagger",
    "weapon:Spear, Light",
    "gear:Backpack",
  ])
    state = update(state, purchaseCreationEquipment(state, id));

  assert.equal(creationEquipmentRemainingCopper(state), 0);
  assert.equal(state.sp, 0);
  assert.equal(state.cp, 0);
  assert.equal(purchaseCreationEquipment(state, "armor:War Shirt").ok, false);

  state = update(state, removeCreationEquipmentPurchase(state, 1));
  assert.equal(creationEquipmentRemainingCopper(state), 30);
  assert.equal(state.sp, 3);
  assert.equal(state.cp, 0);
  assert.ok(!state.readied.includes("Dagger"));
});

test("copper-priced purchases refund exactly and only one armor or shield can be active", () => {
  let state = baseState();
  state = { ...state, ...selectCreationEquipmentMethod(state, "buy") };
  state = update(state, rollCreationStartingSilver(state, 3));
  state = update(state, purchaseCreationEquipment(state, "gear:Candle"));
  assert.equal(state.sp, 29);
  assert.equal(state.cp, 9);
  state = update(state, removeCreationEquipmentPurchase(state, 0));
  assert.equal(state.sp, 30);
  assert.equal(state.cp, 0);

  state = update(state, purchaseCreationEquipment(state, "armor:War Shirt"));
  assert.equal(state.armor, "War Shirt");
  assert.equal(purchaseCreationEquipment(state, "armor:Buff Coat").ok, false);
  state = update(state, purchaseCreationEquipment(state, "shield:Large Shield"));
  assert.equal(state.shield, "Large Shield");
  assert.equal(purchaseCreationEquipment(state, "shield:Small Shield").ok, false);
});
