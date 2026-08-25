import { rollDice, type DiceRoll } from "./dice.ts";

export type RollCategory = "generic" | "skill" | "attack" | "damage" | "save" | "initiative";

export type RollModifier = {
  label: string;
  value: number;
};

export type RollDice = {
  count: number;
  sides: number;
};

export type RollCharacter = {
  id: string;
  name: string;
};

export type RollRequest = {
  category: RollCategory;
  character: RollCharacter;
  label: string;
  dice: RollDice;
  modifiers?: RollModifier[];
  target?: number;
  /** WWN saving throws use an equal-or-higher target with natural 1/20 rules. */
  targetKind?: "saving-throw";
};

export type RollOutcome = "success" | "failure";

export type RollResult = {
  id: string;
  timestamp: string;
  category: RollCategory;
  character: RollCharacter;
  label: string;
  dice: DiceRoll;
  modifiers: RollModifier[];
  modifierTotal: number;
  total: number;
  target?: number;
  outcome?: RollOutcome;
};

export type RollResolverOptions = {
  /** Injectable for deterministic tests and a future visual dice renderer. */
  roll?: (count: number, sides: number) => DiceRoll;
  now?: () => Date;
  createId?: () => string;
};

export type DamageExpression = {
  dice: RollDice;
  modifier: number;
};

let fallbackId = 0;

function createRollId() {
  const cryptoSource = globalThis.crypto;
  if (cryptoSource && typeof cryptoSource.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  fallbackId += 1;
  return `roll-${Date.now()}-${fallbackId}`;
}

function validateDiceResult(roll: DiceRoll, expected: RollDice) {
  if (roll.count !== expected.count || roll.sides !== expected.sides || roll.results.length !== expected.count) {
    throw new Error("The dice resolver returned an invalid result.");
  }
  if (roll.results.some(value => !Number.isInteger(value) || value < 1 || value > expected.sides)) {
    throw new Error("The dice resolver returned an out-of-range result.");
  }
  if (roll.total !== roll.results.reduce((total, value) => total + value, 0)) {
    throw new Error("The dice resolver returned an invalid total.");
  }
}

function resolveOutcome(request: RollRequest, roll: DiceRoll, total: number): RollOutcome | undefined {
  if (request.target === undefined) return undefined;

  if (request.targetKind === "saving-throw" && roll.count === 1 && roll.sides === 20) {
    if (roll.results[0] === 1) return "failure";
    if (roll.results[0] === 20) return "success";
  }
  return total >= request.target ? "success" : "failure";
}

/**
 * Resolve one structured roll request. UI components submit requests here;
 * they never calculate totals or choose their own random source.
 */
export async function resolveRoll(
  request: RollRequest,
  options: RollResolverOptions = {},
): Promise<RollResult> {
  const roll = (options.roll || rollDice)(request.dice.count, request.dice.sides);
  validateDiceResult(roll, request.dice);

  const modifiers = request.modifiers || [];
  if (modifiers.some(modifier => !Number.isFinite(modifier.value))) {
    throw new Error("Roll modifiers must be finite numbers.");
  }

  const modifierTotal = modifiers.reduce((total, modifier) => total + modifier.value, 0);
  const total = roll.total + modifierTotal;
  return {
    id: (options.createId || createRollId)(),
    timestamp: (options.now || (() => new Date()))().toISOString(),
    category: request.category,
    character: request.character,
    label: request.label,
    dice: roll,
    modifiers,
    modifierTotal,
    total,
    ...(request.target === undefined ? {} : { target: request.target }),
    ...(request.target === undefined ? {} : { outcome: resolveOutcome(request, roll, total) }),
  };
}

/** Parse the canonical, already-calculated weapon damage shown on the sheet. */
export function parseDamageExpression(expression: string): DamageExpression {
  const match = expression.match(/^\s*(\d{1,3})d(\d{1,6})(?:\s*([+-])\s*(\d+))?\s*$/iu);
  if (!match) {
    throw new Error(`Unsupported damage expression: ${expression}`);
  }

  const count = Number(match[1]);
  const sides = Number(match[2]);
  const rawModifier = Number(match[4] || 0);
  const modifier = match[3] === "-" ? -rawModifier : rawModifier;
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 2) {
    throw new Error(`Unsupported damage expression: ${expression}`);
  }
  return { dice: { count, sides }, modifier };
}

export function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function formatDiceExpression(dice: RollDice) {
  return `${dice.count}d${dice.sides}`;
}
