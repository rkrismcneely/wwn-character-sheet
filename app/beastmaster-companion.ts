import {
  getBuiltInBestiaryCreature,
  sortBestiaryCreaturesByFamilyAndHitDice,
  type BuiltInBestiaryCreature,
} from "../lib/campaigns/bestiary.ts";

export type BeastmasterBond = "" | "bind-companion" | "chosen-friend";

/**
 * Curated animal-minded companions. This is deliberately an allow-list, not
 * a search across every low-HD Bestiary entry: humanoids and clever monsters
 * must never become selectable merely because their stat line is small.
 */
export const beastmasterCatalogCreatureIds = [
  "small-bird",
  "burrowing-herbivore",
  "small-omnivore",
  "small-pack-predator",
  "small-solitary-predator",
  "small-vicious-predator",
  "totw-stirge",
  "herd-beast",
  "swift-riding-beast",
  "aquatic-herbivore",
  "aquatic-predator",
  "constrictor",
  "giant-centipede",
  "totw-cockatrice",
  "totw-giant-spider",
  "giant-mantis",
  "giant-phase-spider",
  "giant-scorpion",
  "vicious-large-herbivore",
  "large-solitary-predator",
  "apex-predator",
  "elephantine-grazer",
  "totw-grick",
  "unnatural-swarm",
  "large-vicious-predator",
  "terrible-warbeast",
  "hulking-predator",
  "predator-hellbeast",
] as const;

const beastmasterCatalogCreatureIdSet = new Set<string>(beastmasterCatalogCreatureIds);

export function beastmasterCatalogCreature(id: unknown): BuiltInBestiaryCreature | null {
  const key = typeof id === "string" ? id : "";
  if (!beastmasterCatalogCreatureIdSet.has(key)) return null;
  return getBuiltInBestiaryCreature(key);
}

export function beastmasterCatalogCreatures(level: number): readonly BuiltInBestiaryCreature[] {
  const maximumHitDice = Math.max(1, Math.min(10, Math.floor(Number(level) || 1))) + 1;
  const creatures = beastmasterCatalogCreatureIds
    .map(id => beastmasterCatalogCreature(id))
    .filter((creature): creature is BuiltInBestiaryCreature => creature !== null)
    .filter(creature => creature.sourceStats.hitDice <= maximumHitDice);
  return Object.freeze(sortBestiaryCreaturesByFamilyAndHitDice(creatures));
}

export const beastmasterBondOptions = ["bind-companion", "chosen-friend"] as const;
export const chosenFriendBenefitArts = ["Mind Call", "Shared Vitality"] as const;

export function beastmasterArtAvailableForBond(
  artName: string,
  bond: BeastmasterBond | undefined,
) {
  return bond !== "chosen-friend" ||
    !(chosenFriendBenefitArts as readonly string[]).includes(artName);
}

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

export function feralToughnessBaseArmorClass(level: number) {
  const beastmasterLevel = Math.max(1, Math.min(10, Math.floor(Number(level) || 1)));
  return 13 + Math.ceil(beastmasterLevel / 2);
}

export function applyShieldToArmorBase(baseArmorClass: number, shieldArmorClass: number) {
  const base = Math.max(0, Number(baseArmorClass) || 0);
  const shield = Math.max(0, Number(shieldArmorClass) || 0);
  if (!shield) return base;
  return base >= shield ? base + 1 : shield;
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
