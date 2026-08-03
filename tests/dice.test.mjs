import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rollDice, rollDie } from "../app/dice.ts";

const UINT32_RANGE = 0x1_0000_0000;

function withRandomValues(values, callback) {
  const originalCrypto = globalThis.crypto;
  let index = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(array) {
        array[0] = values[Math.min(index, values.length - 1)];
        index += 1;
        return array;
      },
    },
  });
  try {
    return callback(() => index);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  }
}

test("d20 results are structured integers from 1 through 20", () => {
  for (let index = 0; index < 200; index += 1) {
    const roll = rollDie(20);
    assert.equal(roll.count, 1);
    assert.equal(roll.sides, 20);
    assert.equal(roll.results.length, 1);
    assert.equal(Number.isInteger(roll.results[0]), true);
    assert.ok(roll.results[0] >= 1 && roll.results[0] <= 20);
    assert.equal(roll.total, roll.results[0]);
  }
});

test("2d6 retains two component results and a matching total", () => {
  for (let index = 0; index < 200; index += 1) {
    const roll = rollDice(2, 6);
    assert.equal(roll.count, 2);
    assert.equal(roll.sides, 6);
    assert.equal(roll.results.length, 2);
    assert.ok(roll.results.every(result => Number.isInteger(result) && result >= 1 && result <= 6));
    assert.ok(roll.total >= 2 && roll.total <= 12);
    assert.equal(roll.total, roll.results[0] + roll.results[1]);
  }
});

test("invalid dice requests fail safely", () => {
  for (const [count, sides] of [
    [0, 6], [-1, 6], [1.5, 6], [1, 1], [1, 6.5], [1_001, 6], [1, 1_000_001],
  ]) {
    assert.throws(() => rollDice(count, sides), RangeError);
  }
});

test("rejection sampling discards the non-divisible tail", () => {
  const remainder = UINT32_RANGE - Math.floor(UINT32_RANGE / 6) * 6;
  const firstRejected = UINT32_RANGE - remainder;
  const lastAccepted = firstRejected - 1;

  withRandomValues([firstRejected, UINT32_RANGE - 1, 0], getCalls => {
    const roll = rollDie(6);
    assert.deepEqual(roll.results, [1]);
    assert.equal(getCalls(), 3);
  });

  withRandomValues([lastAccepted], () => {
    const roll = rollDie(6);
    assert.deepEqual(roll.results, [6]);
  });
});

test("secure randomness is required and simple modulo mapping is not used", async () => {
  const source = await readFile(new URL("../app/dice.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /%\s*sides/);

  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  try {
    assert.throws(() => rollDie(20), /Secure browser randomness is unavailable/);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  }
});

test("rapid repeated rolls remain valid independent roll requests", () => {
  const rolls = Array.from({ length: 100 }, () => rollDice(2, 6));
  assert.ok(rolls.every(roll => roll.results.length === 2 && roll.total >= 2 && roll.total <= 12));
});
