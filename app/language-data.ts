/** The language names available in the character sheet's standard catalog. */
export const officialLanguages = [
  "Abased", "Amikwag", "Anak Speech", "Ancient Khalan", "Ancient Lin", "Ancient Olok",
  "Ancient Osrin", "Ancient Vothian", "Brass Speech", "Common", "Deep Speech", "Emedian",
  "Llaigisan", "Modern Vothian", "Old Vothian", "Predecessant", "Recurrent", "Thurian",
  "Trade Cant",
] as const;

/**
 * WWN gives every starting character a lingua franca and a native tongue.
 * Know-0 and Connect-0 each add one language; rank 1 or better adds two.
 */
export function startingLanguageAllowance(knowRank: number, connectRank: number) {
  const bonus = (rank: number) => rank >= 1 ? 2 : rank === 0 ? 1 : 0;
  return 2 + bonus(knowRank) + bonus(connectRank);
}

export function normalizeLanguages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value
      .filter((language): language is string => typeof language === "string" && Boolean(language.trim()))
      .map(language => language.trim()))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[,;\n]/).map(language => language.trim()).filter(Boolean))];
  }
  return [];
}
