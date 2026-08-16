export type DuplicateCharacterSummary = {
  name: string;
  player: string;
  classLabel: string;
  level: number;
};

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function duplicateCharacterSummary(
  value: unknown,
): DuplicateCharacterSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const character = value as Record<string, unknown>;
  const name = typeof character.name === "string" ? character.name.trim() : "";
  const player = typeof character.player === "string" ? character.player.trim() : "";
  const level = Number(character.level);
  const classLabel = character.classMode === "adventurer"
    ? (
        typeof character.classOne === "string"
        && typeof character.classTwo === "string"
        && character.classOne.trim()
        && character.classTwo.trim()
          ? `${character.classOne.trim()} / ${character.classTwo.trim()}`
          : ""
      )
    : typeof character.classOne === "string" && character.classOne.trim()
      ? character.classOne.trim()
      : typeof character.className === "string"
        ? character.className.trim()
        : "";

  if (
    !name
    || !player
    || !classLabel
    || !Number.isInteger(level)
    || level < 1
    || level > 10
  ) {
    return null;
  }
  return { name, player, classLabel, level };
}

export function duplicateSummariesMatch(
  incoming: DuplicateCharacterSummary,
  existing: DuplicateCharacterSummary,
): boolean {
  return normalizedText(incoming.name) === normalizedText(existing.name)
    && normalizedText(incoming.player) === normalizedText(existing.player)
    && normalizedText(incoming.classLabel) === normalizedText(existing.classLabel)
    && incoming.level === existing.level;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, canonicalize(record[key])]),
  );
}

export function characterContentFingerprint(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.stringify(canonicalize({
    ...(value as Record<string, unknown>),
    portrait: "",
  }));
}

export function isLikelyDuplicateCharacter(
  incoming: unknown,
  existing: unknown,
): boolean {
  const incomingSummary = duplicateCharacterSummary(incoming);
  const existingSummary = duplicateCharacterSummary(existing);
  if (
    !incomingSummary
    || !existingSummary
    || !duplicateSummariesMatch(incomingSummary, existingSummary)
  ) {
    return false;
  }

  const incomingFingerprint = characterContentFingerprint(incoming);
  const existingFingerprint = characterContentFingerprint(existing);
  return Boolean(
    incomingFingerprint
    && existingFingerprint
    && incomingFingerprint === existingFingerprint,
  );
}
