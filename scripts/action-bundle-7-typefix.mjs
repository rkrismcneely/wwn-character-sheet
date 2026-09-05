import fs from 'node:fs';
const path = 'lib/campaigns/bestiary.ts';
let s = fs.readFileSync(path, 'utf8');
const from = 'export function builtInBestiaryEncounterSeed(id: string): { name: string; initiative: number; hpCurrent: number; hpMax: number; armorClass: number; notes: string; combatStats: CampaignNpcCombatStats } | null {';
const to = 'export function builtInBestiaryEncounterSeed(id: string): { name: string; initiative: number; hpCurrent: number; hpMax: number; armorClass: number; notes: string; friendly: boolean; combatStats: CampaignNpcCombatStats } | null {';
if (!s.includes(from)) throw new Error('Bestiary encounter seed signature not found');
s = s.replace(from, to);
fs.writeFileSync(path, s);
