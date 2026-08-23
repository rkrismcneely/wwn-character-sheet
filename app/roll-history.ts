import type { RollResult } from "./rolls.ts";

export const ROLL_HISTORY_STORAGE_KEY = "wwn-roll-history-v1";
export const MAX_ROLL_HISTORY_ENTRIES = 75;

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageOrNull(): SessionStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function validHistoryEntry(value: unknown): value is RollResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RollResult>;
  return typeof candidate.id === "string"
    && typeof candidate.timestamp === "string"
    && typeof candidate.label === "string"
    && typeof candidate.total === "number"
    && Boolean(candidate.character && typeof candidate.character.name === "string")
    && Boolean(candidate.dice && Array.isArray(candidate.dice.results));
}

export function readRollHistory(storage = storageOrNull()): RollResult[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(ROLL_HISTORY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validHistoryEntry).slice(0, MAX_ROLL_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

export function prependRollHistory(history: RollResult[], result: RollResult): RollResult[] {
  return [result, ...history.filter(entry => entry.id !== result.id)].slice(0, MAX_ROLL_HISTORY_ENTRIES);
}

export function persistRollHistory(history: RollResult[], storage = storageOrNull()) {
  if (!storage) return;
  try {
    storage.setItem(ROLL_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ROLL_HISTORY_ENTRIES)));
  } catch {
    // Storage can be unavailable in restrictive browser modes. Rolling still works.
  }
}

export function clearRollHistory(storage = storageOrNull()) {
  if (!storage) return;
  try {
    storage.removeItem(ROLL_HISTORY_STORAGE_KEY);
  } catch {
    // Keep a failed local clear from affecting the current page state.
  }
}
