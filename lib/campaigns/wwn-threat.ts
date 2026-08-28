/**
 * A small, data-source-neutral implementation of the Worlds Without Number
 * encounter comparison procedure. The procedure itself is informed by the
 * Worlds Without Number Free Edition's "Judging Combat Challenges" guidance;
 * the Bestiary's creature stat lines remain separately CC0 SRD-derived.
 */

export const wwnThreatBands = ["trivial", "favorable", "risky", "deadly", "overwhelming"] as const;
export type WwnThreatBand = typeof wwnThreatBands[number];

/** Shared presentation copy for every UI that uses this already-approved estimate. */
export const wwnThreatEstimateMethod = "Based on encounter-comparison guidance in Worlds Without Number.";
export const wwnThreatEstimateCaveat = "It compares linked character levels with creature Hit Dice and attacks per Main Action. It is only a rough guide: special abilities, spells, unusually strong damage or defenses, terrain, tactics, surprise, positioning, party composition, low-level fragility, and other circumstances can change actual danger substantially.";
export const wwnThreatEstimateProvenance = "The estimate is a derived mechanic informed by the Worlds Without Number Free Edition. Creature stat lines remain attributed to the CC0 SRD.";

export const wwnThreatBandDetails: Readonly<Record<WwnThreatBand, { label: string; summary: string }>> = Object.freeze({
  trivial: { label: "Trivial", summary: "Strongly in the party's favor." },
  favorable: { label: "Favorable", summary: "The party is generally favored to win without severe losses." },
  risky: { label: "Risky", summary: "The party has a reasonable chance, but characters may be seriously threatened." },
  deadly: { label: "Deadly", summary: "There is a substantial risk of characters being taken down or the party being wiped out." },
  overwhelming: { label: "Overwhelming", summary: "The party is likely badly overmatched without significant advantages." },
});

export interface WwnEnemyThreatInput {
  readonly hitDice: number;
  readonly attacksPerMainAction: number;
  readonly quantity?: number;
}

export interface WwnPartyScore {
  readonly levels: readonly number[];
  readonly characterCount: number;
  readonly totalLevels: number;
  readonly score: number;
}

export interface WwnEnemyScore {
  readonly totalHitDice: number;
  readonly totalAttacks: number;
  readonly score: number;
}

export interface WwnThreatEstimate {
  readonly party: WwnPartyScore;
  readonly enemy: WwnEnemyScore;
  readonly ratio: number;
  readonly band: WwnThreatBand;
}

function isPositiveWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Party Score = the sum of linked PC levels multiplied by the number of linked
 * PCs. A malformed level makes the whole estimate unavailable rather than
 * inventing a level or silently changing the party's composition.
 */
export function calculateWwnPartyScore(levels: readonly unknown[]): WwnPartyScore | null {
  if (!levels.length || !levels.every(isPositiveWholeNumber)) return null;
  const validLevels = Object.freeze([...levels]);
  const totalLevels = validLevels.reduce((total, level) => total + level, 0);
  return Object.freeze({ levels: validLevels, characterCount: validLevels.length, totalLevels, score: totalLevels * validLevels.length });
}

/**
 * Enemy Score = total enemy HD multiplied by total enemy attacks. For a group,
 * both totals are accumulated before multiplication, as in the approved WWN
 * encounter-comparison procedure.
 */
export function calculateWwnEnemyScore(enemies: readonly WwnEnemyThreatInput[]): WwnEnemyScore | null {
  if (!enemies.length) return null;
  let totalHitDice = 0;
  let totalAttacks = 0;
  for (const enemy of enemies) {
    const quantity = enemy.quantity ?? 1;
    if (!isPositiveWholeNumber(enemy.hitDice) || !isPositiveWholeNumber(enemy.attacksPerMainAction) || !isPositiveWholeNumber(quantity)) return null;
    totalHitDice += enemy.hitDice * quantity;
    totalAttacks += enemy.attacksPerMainAction * quantity;
  }
  return Object.freeze({ totalHitDice, totalAttacks, score: totalHitDice * totalAttacks });
}

export function wwnThreatBandForRatio(ratio: number): WwnThreatBand | null {
  if (!Number.isFinite(ratio) || ratio < 0) return null;
  if (ratio < 0.5) return "trivial";
  if (ratio <= 1) return "favorable";
  if (ratio < 2) return "risky";
  if (ratio <= 4) return "deadly";
  return "overwhelming";
}

export function calculateWwnThreatEstimate(partyLevels: readonly unknown[], enemies: readonly WwnEnemyThreatInput[]): WwnThreatEstimate | null {
  const party = calculateWwnPartyScore(partyLevels);
  const enemy = calculateWwnEnemyScore(enemies);
  if (!party || !enemy || party.score <= 0) return null;
  const ratio = enemy.score / party.score;
  const band = wwnThreatBandForRatio(ratio);
  return band ? Object.freeze({ party, enemy, ratio, band }) : null;
}
