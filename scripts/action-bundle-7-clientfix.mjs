import fs from 'node:fs';
const path = 'app/campaigns/gm-console.tsx';
let s = fs.readFileSync(path, 'utf8');
s = s.replace('import { rollNpcHitPoints } from "@/lib/campaigns/npc-combat";\n', '');
const marker = 'const blankMagic = (): CampaignNpcMagicReference => ({ name: "", summary: "" });';
if (!s.includes(marker)) throw new Error('blankMagic marker not found');
const helper = `${marker}\nfunction rollNpcHitPoints(hitDice: number): number {\n  const whole = Math.floor(hitDice);\n  const fraction = hitDice - whole;\n  let hp = 0;\n  for (let i = 0; i < whole; i += 1) hp += Math.floor(Math.random() * 8) + 1;\n  if (fraction > 0) {\n    const sides = Math.max(1, Math.round(8 * fraction));\n    hp += Math.floor(Math.random() * sides) + 1;\n  }\n  return Math.max(1, hp);\n}`;
s = s.replace(marker, helper);
fs.writeFileSync(path, s);
