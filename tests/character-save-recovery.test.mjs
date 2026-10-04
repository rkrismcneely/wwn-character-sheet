import assert from "node:assert/strict";
import test from "node:test";
import {
  canRestoreRecoveryToOriginal,
  characterIdFromPathname,
  characterRecoveryStorageKey,
  clearCharacterRecoveryDraft,
  parseCharacterRecoveryDraft,
  readCharacterRecoveryDraft,
  writeCharacterRecoveryDraft,
} from "../app/character-save-recovery.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const characterId = `chr_${"A".repeat(22)}`;
const draft = {
  schema: 1,
  characterId,
  ownerUserId: "user-a",
  baseVersion: 7,
  savedAt: "2026-10-04T21:00:00.000Z",
  character: { name: "Recovered Hero", hpCurrent: 3 },
};

test("character recovery keys and routes stay scoped to canonical character ids", () => {
  assert.equal(characterRecoveryStorageKey(characterId), `twe:character-recovery:${characterId}`);
  assert.equal(characterIdFromPathname(`/character/${characterId}`), characterId);
  assert.equal(characterIdFromPathname(`/character/${characterId}/`), characterId);
  assert.equal(characterIdFromPathname(`/campaigns/cmp_${"B".repeat(22)}/characters/${characterId}`), null);
  assert.equal(characterIdFromPathname("/character/not-a-character"), null);
});

test("recovery drafts round-trip and are account-scoped", () => {
  const storage = memoryStorage();
  writeCharacterRecoveryDraft(storage, draft);

  assert.deepEqual(readCharacterRecoveryDraft(storage, characterId, "user-a"), draft);
  assert.equal(readCharacterRecoveryDraft(storage, characterId, "different-user"), null);

  clearCharacterRecoveryDraft(storage, characterId);
  assert.equal(readCharacterRecoveryDraft(storage, characterId, "user-a"), null);
});

test("malformed recovery data is ignored", () => {
  assert.equal(parseCharacterRecoveryDraft(null), null);
  assert.equal(parseCharacterRecoveryDraft("not-json"), null);
  assert.equal(parseCharacterRecoveryDraft(JSON.stringify({ ...draft, schema: 2 })), null);
  assert.equal(parseCharacterRecoveryDraft(JSON.stringify({ ...draft, baseVersion: 0 })), null);
  assert.equal(parseCharacterRecoveryDraft(JSON.stringify({ ...draft, character: [] })), null);
});

test("original recovery is allowed only against the exact unchanged server version", () => {
  assert.equal(canRestoreRecoveryToOriginal(draft, 7), true);
  assert.equal(canRestoreRecoveryToOriginal(draft, 8), false);
  assert.equal(canRestoreRecoveryToOriginal({ ...draft, baseVersion: null }, 7), false);
  assert.equal(canRestoreRecoveryToOriginal(draft, null), false);
});
