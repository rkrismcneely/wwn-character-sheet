export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 60;

const CONTROL_OR_INVISIBLE_PATTERN = /[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/u;

export class DisplayNameValidationError extends Error {}

export function normalizeDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new DisplayNameValidationError("Enter a username.");
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  if (
    length < DISPLAY_NAME_MIN_LENGTH
    || length > DISPLAY_NAME_MAX_LENGTH
    || CONTROL_OR_INVISIBLE_PATTERN.test(normalized)
  ) {
    throw new DisplayNameValidationError(
      `Usernames must be between ${DISPLAY_NAME_MIN_LENGTH} and ${DISPLAY_NAME_MAX_LENGTH} visible characters.`,
    );
  }
  return normalized;
}

export function effectiveDisplayName(
  customDisplayName: string | null | undefined,
  providerName: string,
): string {
  const custom = customDisplayName?.trim();
  return custom || providerName.trim() || "Adventurer";
}
