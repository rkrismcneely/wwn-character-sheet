import { rollDice, type DiceRoll } from "./dice.ts";

export type RollCategory = "generic" | "skill" | "attack" | "damage" | "save" | "initiative";
export const SHARED_ROLL_CATEGORIES = ["skill", "attack", "damage", "save", "initiative"] as const;

export function isSharedRollCategory(category: RollCategory): category is (typeof SHARED_ROLL_CATEGORIES)[number] {
  return category !== "generic";
}

export type RollModifier = {
  label: string;
  value: number;
};

export type RollDice = {
  count: number;
  sides: number;
};

export type ShockMinimum = {
  damage: number;
  armorClass?: number;
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
  /** Roll all dice but only total the highest N (e.g. Specialist skill checks). */
  keepHighest?: number;
  /** Reroll each initial skill die showing 1 once (Diplomatic Grace). */
  rerollOnes?: boolean;
  modifiers?: RollModifier[];
  target?: number;
  /** Shock damage is a floor when the target AC is at or below the listed threshold. */
  shockMinimum?: ShockMinimum;
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
  keepHighest?: number;
  modifiers: RollModifier[];
  modifierTotal: number;
  total: number;
  target?: number;
  shockMinimum?: ShockMinimum;
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
  const diceSource = options.roll || rollDice;
  const firstRoll = diceSource(request.dice.count, request.dice.sides);
  validateDiceResult(firstRoll, request.dice);
  if (request.rerollOnes && (request.category !== "skill" || request.dice.sides !== 6)) {
    throw new Error("Rerolling ones is only valid on skill dice.");
  }
  // Replacements are rolled once, even if another 1 appears. Keep all other
  // dice untouched, including dice that may later be discarded by keepHighest.
  const results = [...firstRoll.results];
  if (request.rerollOnes) {
    for (let index = 0; index < results.length; index++) {
      if (results[index] !== 1) continue;
      const replacement = diceSource(1, request.dice.sides);
      validateDiceResult(replacement, { count: 1, sides: request.dice.sides });
      results[index] = replacement.results[0];
    }
  }
  const roll: DiceRoll = { count: firstRoll.count, sides: firstRoll.sides, results, total: results.reduce((a, b) => a + b, 0) };

  const modifiers = request.modifiers || [];
  if (modifiers.some(modifier => !Number.isFinite(modifier.value))) {
    throw new Error("Roll modifiers must be finite numbers.");
  }

  const keepHighest = request.keepHighest;
  if (keepHighest !== undefined && (!Number.isInteger(keepHighest) || keepHighest < 1 || keepHighest > request.dice.count)) {
    throw new Error("The number of kept dice must be within the dice count.");
  }
  const diceTotal = keepHighest === undefined
    ? roll.total
    : [...roll.results].sort((a, b) => b - a).slice(0, keepHighest).reduce((sum, value) => sum + value, 0);
  const modifierTotal = modifiers.reduce((total, modifier) => total + modifier.value, 0);
  const total = diceTotal + modifierTotal;
  return {
    id: (options.createId || createRollId)(),
    timestamp: (options.now || (() => new Date()))().toISOString(),
    category: request.category,
    character: request.character,
    label: request.label,
    dice: roll,
    ...(keepHighest === undefined ? {} : { keepHighest }),
    modifiers,
    modifierTotal,
    total,
    ...(request.target === undefined ? {} : { target: request.target }),
    ...(request.shockMinimum ? { shockMinimum: { ...request.shockMinimum } } : {}),
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

/** Parse a weapon's Shock value such as "3/AC 15", "3/15", or "6/-". */
export function parseShockMinimum(value: unknown): ShockMinimum | null {
  const match = String(value ?? "").match(/(?:shock\s*)?(\d{1,4})\s*\/\s*(?:AC\s*)?(\d{1,3}|-)(?=\s|$)/iu);
  if (!match) return null;
  const damage = Number(match[1]);
  if (!Number.isInteger(damage) || damage < 0) return null;
  if (match[2] === "-") return { damage };
  const armorClass = Number(match[2]);
  return Number.isInteger(armorClass) ? { damage, armorClass } : null;
}

export function formatShockMinimumReminder(shock: ShockMinimum): string {
  return shock.armorClass === undefined
    ? `Shock minimum: ${shock.damage} damage when Shock applies.`
    : `Shock minimum: ${shock.damage} damage if target AC is ${shock.armorClass} or lower.`;
}

export function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function formatDiceExpression(dice: RollDice) {
  return `${dice.count}d${dice.sides}`;
}
