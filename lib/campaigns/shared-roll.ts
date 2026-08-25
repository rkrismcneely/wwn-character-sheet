import type { CampaignSharedRoll } from "./live-session.ts";
import { isSharedRollCategory, SHARED_ROLL_CATEGORIES, type RollRequest, type RollResult } from "../../app/rolls.ts";
import { CampaignServiceError } from "./service.ts";

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${field} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError(`${field} is invalid.`, 422);
  }
  return text;
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new CampaignServiceError(`${field} is invalid.`, 422);
  }
  return value as number;
}

/** Validate the semantic request; character identity is always supplied by trusted D1 state. */
export function normalizeSharedRollRequest(value: unknown, character: RollRequest["character"]): RollRequest {
  if (!value || typeof value !== "object") throw new CampaignServiceError("A roll request is required.", 422);
  const candidate = value as Partial<RollRequest>;
  if (typeof candidate.category !== "string" || !SHARED_ROLL_CATEGORIES.includes(candidate.category as never)) {
    throw new CampaignServiceError("Only contextual rolls can be shared.", 422);
  }
  if (!candidate.dice || typeof candidate.dice !== "object") throw new CampaignServiceError("Roll dice are required.", 422);
  const dice = {
    count: boundedInteger(candidate.dice.count, "Dice count", 1, 20),
    sides: boundedInteger(candidate.dice.sides, "Die sides", 2, 100),
  };
  if (!Array.isArray(candidate.modifiers) || candidate.modifiers.length > 10) {
    if (candidate.modifiers !== undefined) throw new CampaignServiceError("Roll modifiers are invalid.", 422);
  }
  const modifiers = (candidate.modifiers || []).map(modifier => ({
    label: boundedText(modifier?.label, "Modifier label", 80),
    value: boundedInteger(modifier?.value, "Modifier value", -1000, 1000),
  }));
  const target = candidate.target === undefined
    ? undefined
    : boundedInteger(candidate.target, "Roll target", -1000, 1000);
  if (candidate.targetKind !== undefined && (candidate.targetKind !== "saving-throw" || candidate.category !== "save")) {
    throw new CampaignServiceError("Roll target type is invalid.", 422);
  }
  return {
    category: candidate.category as RollRequest["category"],
    character,
    label: boundedText(candidate.label, "Roll label", 120),
    dice,
    modifiers,
    ...(target === undefined ? {} : { target }),
    ...(candidate.targetKind === undefined ? {} : { targetKind: candidate.targetKind }),
  };
}

export function isCampaignSharedRoll(result: RollResult): boolean {
  return isSharedRollCategory(result.category);
}

export function toCampaignSharedRoll(result: RollResult): CampaignSharedRoll {
  if (!isSharedRollCategory(result.category)) throw new CampaignServiceError("Generic rolls remain private.", 422);
  return result as CampaignSharedRoll;
}
