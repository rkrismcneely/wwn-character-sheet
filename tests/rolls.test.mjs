import assert from "node:assert/strict";
import test from "node:test";
import { clearRollHistory, MAX_ROLL_HISTORY_ENTRIES, persistRollHistory, prependRollHistory, readRollHistory } from "../app/roll-history.ts";
import { formatShockMinimumReminder, parseDamageExpression, parseShockMinimum, resolveRoll } from "../app/rolls.ts";

function fixedRoll(results, sides) {
  return (count, requestedSides) => {
    assert.equal(count, results.length);
    assert.equal(requestedSides, sides);
    return { count, sides, results, total: results.reduce((total, value) => total + value, 0) };
  };
}

function sampleRequest(overrides = {}) {
  return {
    category: "skill",
    character: { id: "chr_example", name: "Aster" },
    label: "Notice (WIS) Check",
    dice: { count: 2, sides: 6 },
    modifiers: [{ label: "Notice skill", value: 1 }, { label: "WIS", value: 2 }],
    ...overrides,
  };
}

test("the central resolver records a structured skill roll from injected dice", async () => {
  const result = await resolveRoll(sampleRequest(), {
    roll: fixedRoll([4, 6], 6),
    createId: () => "roll_skill",
    now: () => new Date("2026-08-23T12:00:00.000Z"),
  });

  assert.deepEqual(result.dice.results, [4, 6]);
  assert.equal(result.dice.total, 10);
  assert.equal(result.modifierTotal, 3);
  assert.equal(result.total, 13);
  assert.equal(result.character.name, "Aster");
  assert.equal(result.id, "roll_skill");
  assert.equal(result.timestamp, "2026-08-23T12:00:00.000Z");
});

test("WWN saving throws use the displayed target and natural 1/20 outcomes", async () => {
  const request = sampleRequest({
    category: "save",
    label: "Physical Saving Throw",
    dice: { count: 1, sides: 20 },
    modifiers: [],
    target: 12,
    targetKind: "saving-throw",
  });

  const naturalOne = await resolveRoll(request, { roll: fixedRoll([1], 20) });
  const naturalTwenty = await resolveRoll(request, { roll: fixedRoll([20], 20) });
  const ordinaryFailure = await resolveRoll(request, { roll: fixedRoll([11], 20) });
  const ordinarySuccess = await resolveRoll(request, { roll: fixedRoll([12], 20) });

  assert.equal(naturalOne.outcome, "failure");
  assert.equal(naturalTwenty.outcome, "success");
  assert.equal(ordinaryFailure.outcome, "failure");
  assert.equal(ordinarySuccess.outcome, "success");
});

test("initiative is a typed 1d8 roll using the existing calculated modifier", async () => {
  const result = await resolveRoll(sampleRequest({
    category: "initiative",
    label: "Initiative",
    dice: { count: 1, sides: 8 },
    modifiers: [{ label: "Initiative modifier", value: 2 }],
  }), { roll: fixedRoll([6], 8) });

  assert.equal(result.category, "initiative");
  assert.deepEqual(result.dice.results, [6]);
  assert.equal(result.modifierTotal, 2);
  assert.equal(result.total, 8);
});

test("canonical weapon damage expressions preserve their die and modifier", () => {
  assert.deepEqual(parseDamageExpression("1d8+2"), { dice: { count: 1, sides: 8 }, modifier: 2 });
  assert.deepEqual(parseDamageExpression("2d6 - 1"), { dice: { count: 2, sides: 6 }, modifier: -1 });
  assert.throws(() => parseDamageExpression("special"), /Unsupported damage expression/);
});

test("Shock minimums parse from weapon values and produce a clear reminder", () => {
  assert.deepEqual(parseShockMinimum("3/AC 15"), { damage: 3, armorClass: 15 });
  assert.deepEqual(parseShockMinimum("Shock 6/-"), { damage: 6 });
  assert.equal(parseShockMinimum("None"), null);
  assert.equal(formatShockMinimumReminder({ damage: 3, armorClass: 15 }), "Shock minimum: 3 damage if target AC is 15 or lower.");
});

test("invalid injected dice are rejected before an incorrect result is presented", async () => {
  await assert.rejects(
    resolveRoll(sampleRequest(), { roll: () => ({ count: 2, sides: 6, results: [7, 1], total: 8 }) }),
    /out-of-range/,
  );
});

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) || null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("local roll history is newest first, capped, and clears only its session entry", async () => {
  const storage = new MemoryStorage();
  const first = await resolveRoll(sampleRequest(), { roll: fixedRoll([1, 1], 6), createId: () => "first" });
  const second = await resolveRoll(sampleRequest(), { roll: fixedRoll([2, 2], 6), createId: () => "second" });
  const history = prependRollHistory(prependRollHistory([], first), second);
  persistRollHistory(history, storage);
  assert.deepEqual(readRollHistory(storage).map(entry => entry.id), ["second", "first"]);

  const capped = Array.from({ length: MAX_ROLL_HISTORY_ENTRIES + 4 }, (_, index) => ({ ...first, id: `roll-${index}` }))
    .reduce((current, entry) => prependRollHistory(current, entry), []);
  assert.equal(capped.length, MAX_ROLL_HISTORY_ENTRIES);

  clearRollHistory(storage);
  assert.deepEqual(readRollHistory(storage), []);
});

test("rolls three dice for a keep-highest-two skill check", async () => {
  const result = await resolveRoll({
    category: "skill",
    character: { id: "hero", name: "Hero" },
    label: "Heal (INT) Check",
    dice: { count: 3, sides: 6 },
    keepHighest: 2,
    modifiers: [{ label: "Heal skill", value: 1 }],
  }, {
    roll: () => ({ count: 3, sides: 6, results: [2, 6, 5], total: 13 }),
  });
  assert.deepEqual(result.dice.results, [2, 6, 5]);
  assert.equal(result.keepHighest, 2);
  assert.equal(result.total, 12);
});

test("Specialist level two rolls four dice and keeps the two highest", async () => {
  const result = await resolveRoll({
    category: "skill",
    character: { id: "hero", name: "Hero" },
    label: "Sneak Check",
    dice: { count: 4, sides: 6 },
    keepHighest: 2,
  }, {
    roll: () => ({ count: 4, sides: 6, results: [1, 6, 3, 5], total: 15 }),
  });
  assert.equal(result.total, 11);
});
