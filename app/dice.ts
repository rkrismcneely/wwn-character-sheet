/**
 * Secure, unbiased dice rolling for browser-facing WWN utilities.
 *
 * This module deliberately does not parse dice expressions. Callers provide
 * the number of dice and the number of faces directly so the same utility can
 * support future attacks, skills, saves, and table rolls without coupling
 * randomness to any particular UI component.
 */

export type DiceRoll = {
  count: number;
  sides: number;
  results: number[];
  total: number;
};

const UINT32_RANGE = 0x1_0000_0000;
const MAX_DICE_COUNT = 1_000;
const MAX_DIE_SIDES = 1_000_000;

function validateDice(count: number, sides: number) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("Dice count must be a positive integer.");
  }
  if (!Number.isInteger(sides) || sides < 2) {
    throw new RangeError("Dice must have at least two sides.");
  }
  if (count > MAX_DICE_COUNT) {
    throw new RangeError(`Dice count cannot exceed ${MAX_DICE_COUNT}.`);
  }
  if (sides > MAX_DIE_SIDES) {
    throw new RangeError(`Dice cannot have more than ${MAX_DIE_SIDES} sides.`);
  }
}

function secureRandomUint32() {
  const cryptoSource = globalThis.crypto;
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new Error("Secure browser randomness is unavailable; the die was not rolled.");
  }

  const values = new Uint32Array(1);
  cryptoSource.getRandomValues(values);
  return values[0];
}

function unbiasedFace(sides: number) {
  // 2^32 is not evenly divisible by every possible die size. Reject the
  // short tail so every remaining bucket contains the same number of values.
  const remainder = UINT32_RANGE - Math.floor(UINT32_RANGE / sides) * sides;
  const limit = UINT32_RANGE - remainder;
  let randomValue = secureRandomUint32();
  while (randomValue >= limit) {
    randomValue = secureRandomUint32();
  }

  // The rejection step makes this quotient/subtraction mapping uniform. It
  // intentionally avoids an unchecked modulo reduction of the raw value.
  const bucket = Math.floor(randomValue / sides);
  const offset = randomValue - bucket * sides;
  return offset + 1;
}

export function rollDice(count: number, sides: number): DiceRoll {
  validateDice(count, sides);
  const results = Array.from({ length: count }, () => unbiasedFace(sides));
  return {
    count,
    sides,
    results,
    total: results.reduce((sum, result) => sum + result, 0),
  };
}

export function rollDie(sides: number): DiceRoll {
  return rollDice(1, sides);
}
