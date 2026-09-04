export type BeastmasterBond = "" | "bind-companion" | "chosen-friend";

export const beastmasterBondOptions = ["bind-companion", "chosen-friend"] as const;
export const chosenFriendBenefitArts = ["Mind Call", "Shared Vitality"] as const;

const vulgarFractions: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
};

export function parseBeastmasterHitDice(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(/\s*HD\s*$/iu, "").trim();
  if (!text) return null;
  if (text in vulgarFractions) return vulgarFractions[text];
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/u);
  if (fraction) {
    const denominator = Number(fraction[2]);
    const result = denominator ? Number(fraction[1]) / denominator : 0;
    return Number.isFinite(result) && result > 0 ? result : null;
  }
  const result = Number(text);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function parseBeastmasterHitBonus(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^[+-]?\d+$/u.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

export function formatBeastmasterHitDice(value: number | null): string {
  if (value === null) return "—";
  if (value === 0.5) return "½ HD";
  if (value === 0.25) return "¼ HD";
  if (value === 0.75) return "¾ HD";
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/u, "").replace(/\.$/u, "")} HD`;
}

export function formatBeastmasterHitBonus(value: number | null): string {
  if (value === null) return "—";
  return value >= 0 ? `+${value}` : String(value);
}

export function beastmasterCompanionRules({
  level,
  bond,
  hasSharedVitalityArt,
  hasMindCallArt,
  hitDice,
  attackBonus,
}: {
  level: number;
  bond: BeastmasterBond;
  hasSharedVitalityArt: boolean;
  hasMindCallArt: boolean;
  hitDice: unknown;
  attackBonus: unknown;
}) {
  const beastmasterLevel = Math.max(1, Math.min(10, Math.floor(Number(level) || 1)));
  const baseHitDice = parseBeastmasterHitDice(hitDice);
  const baseHitBonus = parseBeastmasterHitBonus(attackBonus);
  const sharedVitality = bond === "chosen-friend" || hasSharedVitalityArt;
  const mindCall = bond === "chosen-friend" || hasMindCallArt;
  const maximumBaseHitDice = beastmasterLevel + 1;
  const effectiveHitDice = baseHitDice === null
    ? null
    : sharedVitality
      ? Math.max(baseHitDice, beastmasterLevel)
      : baseHitDice;
  const minimumHitBonus = sharedVitality && effectiveHitDice !== null
    ? Math.ceil(effectiveHitDice / 2)
    : null;
  const effectiveHitBonus = baseHitBonus === null
    ? minimumHitBonus
    : minimumHitBonus === null
      ? baseHitBonus
      : Math.max(baseHitBonus, minimumHitBonus);

  return {
    beastmasterLevel,
    baseHitDice,
    baseHitBonus,
    maximumBaseHitDice,
    eligibleHitDice: baseHitDice === null || baseHitDice <= maximumBaseHitDice,
    sharedVitality,
    mindCall,
    effectiveHitDice,
    minimumHitBonus,
    effectiveHitBonus,
  };
}
