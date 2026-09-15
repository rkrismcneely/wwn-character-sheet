export type SpellCastingPick = {
  name?: string;
  cast?: boolean;
  casts?: number;
};

export function spellCastCount(pick: SpellCastingPick): number {
  const numeric = Number(pick.casts);
  const explicit = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  return explicit > 0 ? explicit : pick.cast ? 1 : 0;
}

export function spellCastingUse(
  picks: readonly SpellCastingPick[],
  isInvoker: boolean,
  spellLevel: (name: string) => number,
): number {
  return picks.reduce((total, pick) => {
    if (!pick.name) return total;
    const count = spellCastCount(pick);
    if (count === 0) return total;
    if (!isInvoker) return total + count;
    return total + count * Math.max(0, spellLevel(pick.name));
  }, 0);
}

export function spellCastCost(isInvoker: boolean, level: number): number {
  return isInvoker ? Math.max(0, level) : 1;
}

export function canRecordSpellCast({
  prepared,
  castingBlocked,
  used,
  limit,
  cost,
}: {
  prepared: boolean;
  castingBlocked: boolean;
  used: number;
  limit: number;
  cost: number;
}): boolean {
  return prepared && !castingBlocked && cost > 0 && used + cost <= limit;
}
