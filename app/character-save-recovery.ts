export type CharacterRecoveryDraft = {
  schema: 1;
  characterId: string;
  ownerUserId: string;
  baseVersion: number | null;
  savedAt: string;
  character: Record<string, unknown>;
};

export type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const recoveryPrefix = "twe:character-recovery:";
const publicCharacterPattern = /^chr_[A-Za-z0-9_-]{22}$/u;

export function characterRecoveryStorageKey(characterId: string): string {
  return `${recoveryPrefix}${characterId}`;
}

export function characterIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/character\/(chr_[A-Za-z0-9_-]{22})\/?$/u);
  return match?.[1] ?? null;
}

export function parseCharacterRecoveryDraft(
  raw: string | null | undefined,
): CharacterRecoveryDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CharacterRecoveryDraft>;
    if (
      parsed.schema !== 1
      || typeof parsed.characterId !== "string"
      || !publicCharacterPattern.test(parsed.characterId)
      || typeof parsed.ownerUserId !== "string"
      || !parsed.ownerUserId
      || (parsed.baseVersion !== null && (!Number.isInteger(parsed.baseVersion) || Number(parsed.baseVersion) < 1))
      || typeof parsed.savedAt !== "string"
      || !parsed.savedAt
      || !parsed.character
      || typeof parsed.character !== "object"
      || Array.isArray(parsed.character)
    ) return null;
    return parsed as CharacterRecoveryDraft;
  } catch {
    return null;
  }
}

export function readCharacterRecoveryDraft(
  storage: RecoveryStorage,
  characterId: string,
  ownerUserId?: string | null,
): CharacterRecoveryDraft | null {
  const draft = parseCharacterRecoveryDraft(
    storage.getItem(characterRecoveryStorageKey(characterId)),
  );
  if (!draft || draft.characterId !== characterId) return null;
  if (ownerUserId && draft.ownerUserId !== ownerUserId) return null;
  return draft;
}

export function writeCharacterRecoveryDraft(
  storage: RecoveryStorage,
  draft: CharacterRecoveryDraft,
): void {
  storage.setItem(characterRecoveryStorageKey(draft.characterId), JSON.stringify(draft));
}

export function clearCharacterRecoveryDraft(
  storage: RecoveryStorage,
  characterId: string,
): void {
  storage.removeItem(characterRecoveryStorageKey(characterId));
}

export function canRestoreRecoveryToOriginal(
  draft: CharacterRecoveryDraft,
  currentVersion: number | null | undefined,
): boolean {
  return Number.isInteger(draft.baseVersion)
    && Number.isInteger(currentVersion)
    && draft.baseVersion === currentVersion;
}
