export const CHARACTER_VISIBILITIES = [
  "private",
  "unlisted",
  "public",
] as const;

export type CharacterVisibility = (typeof CHARACTER_VISIBILITIES)[number];

export interface CharacterAccessRecord {
  ownerUserId: string | null;
  visibility: CharacterVisibility;
}

export interface CharacterActor {
  userId: string;
}

export type WriteAuthorization =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 404 };

export function isCharacterVisibility(
  value: unknown,
): value is CharacterVisibility {
  return (
    typeof value === "string" &&
    CHARACTER_VISIBILITIES.includes(value as CharacterVisibility)
  );
}

export function isCharacterOwner(
  actor: CharacterActor | null,
  character: CharacterAccessRecord,
): boolean {
  return Boolean(
    actor &&
      character.ownerUserId &&
      actor.userId === character.ownerUserId,
  );
}

export function canReadCharacter(
  actor: CharacterActor | null,
  character: CharacterAccessRecord,
): boolean {
  if (isCharacterOwner(actor, character)) return true;
  return character.visibility === "public" || character.visibility === "unlisted";
}

export function authorizeCharacterWrite(
  actor: CharacterActor | null,
  character: CharacterAccessRecord,
): WriteAuthorization {
  if (!actor) return { allowed: false, status: 401 };
  if (isCharacterOwner(actor, character)) return { allowed: true };
  if (character.visibility === "private") {
    return { allowed: false, status: 404 };
  }
  return { allowed: false, status: 403 };
}

export function isPubliclyDiscoverable(
  character: Pick<CharacterAccessRecord, "visibility">,
): boolean {
  return character.visibility === "public";
}
