import type { CampaignNpcAttack } from "./npc-combat.ts";

export interface NpcWeaponStarter {
  name: string;
  damage: string;
  shock: string;
  note: string;
}

/**
 * The rollable entries from the existing `app/wwn-data.ts` weapon catalog.
 * Keep this small client-facing starter list independent of that large,
 * all-purpose dataset so the GM Console does not pull its unrelated SRD text
 * into the encounter-management bundle. Each selected value is copied into a
 * campaign-owned attack and has no continuing source relationship.
 */
export const npcWeaponStarters: readonly NpcWeaponStarter[] = Object.freeze([
  { name: "Axe, Hand", damage: "1d6", shock: "1/AC 15", note: "Range 10/30 · Traits T" },
  { name: "Axe, War", damage: "1d10", shock: "3/AC 15", note: "Traits 2H" },
  { name: "Blackjack", damage: "1d4", shock: "", note: "Traits S, LL" },
  { name: "Bow, Large", damage: "1d8", shock: "", note: "Range 100/600 · Traits 2H, R, PM" },
  { name: "Bow, Small", damage: "1d6", shock: "", note: "Range 50/300 · Traits 2H, R, PM" },
  { name: "Claw Blades", damage: "1d6", shock: "2/AC 13", note: "Traits S" },
  { name: "Club", damage: "1d4", shock: "", note: "Range 10/30 · Traits T, LL" },
  { name: "Club, Great", damage: "1d10", shock: "2/AC 15", note: "Traits 2H" },
  { name: "Crossbow", damage: "1d10", shock: "", note: "Range 100/300 · Traits 2H, SR, PM" },
  { name: "Dagger", damage: "1d4", shock: "1/AC 15", note: "Range 30/60 · Traits S, T, PM" },
  { name: "Halberd", damage: "1d10", shock: "2/AC 15", note: "Traits 2H, L" },
  { name: "Hammer, Great", damage: "1d10", shock: "2/AC 18", note: "Traits 2H" },
  { name: "Hammer, War", damage: "1d8", shock: "1/AC 18", note: "" },
  { name: "Hurlant, Great", damage: "3d10", shock: "", note: "Range 600/2,400 · Traits FX, SS, AP" },
  { name: "Hurlant, Hand", damage: "1d12", shock: "", note: "Range 30/60 · Traits SS, AP" },
  { name: "Hurlant, Long", damage: "2d8", shock: "", note: "Range 200/600 · Traits 2H, SS, AP, PM" },
  { name: "Mace", damage: "1d6", shock: "1/AC 18", note: "Traits LL" },
  { name: "Pike", damage: "1d8", shock: "1/AC 18", note: "Traits 2H, L" },
  { name: "Shield Bash, Large", damage: "1d6", shock: "1/AC 13", note: "Traits LL" },
  { name: "Shield Bash, Small", damage: "1d4", shock: "", note: "Traits LL" },
  { name: "Spear, Heavy", damage: "1d10", shock: "2/AC 15", note: "Traits 2H" },
  { name: "Spear, Light", damage: "1d6", shock: "2/AC 13", note: "Range 30/60 · Traits T" },
  { name: "Throwing Blade", damage: "1d4", shock: "", note: "Range 30/60 · Traits S, T, N" },
  { name: "Staff", damage: "1d6", shock: "1/AC 13", note: "Traits 2H, LL" },
  { name: "Stiletto", damage: "1d4", shock: "1/AC 18", note: "Traits S, PM" },
  { name: "Sword, Great", damage: "1d12", shock: "2/AC 15", note: "Traits 2H" },
  { name: "Sword, Long", damage: "1d8", shock: "2/AC 13", note: "" },
  { name: "Sword, Short", damage: "1d6", shock: "2/AC 15", note: "" },
]);

export function npcAttackFromWeapon(name: string): CampaignNpcAttack | null {
  const weapon = npcWeaponStarters.find(candidate => candidate.name === name);
  return weapon ? { name: weapon.name, attackBonus: 0, damage: weapon.damage, ...(weapon.shock ? { shock: weapon.shock } : {}), description: weapon.note } : null;
}
