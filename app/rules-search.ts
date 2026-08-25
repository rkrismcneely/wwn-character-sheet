import { traditionInfo, traditionSpells } from "./class-data.ts";
import { foci, highMageArts, highMagic, weapons } from "./wwn-data.ts";

export type RuleEntry = {
  title: string;
  category: string;
  source: string;
  text: string;
  aliases?: string[];
  fullText?: string;
};

const coreRules: RuleEntry[] = [
  { title:"Skill Checks", category:"Core rule", source:"Rules of the Game · Skill Checks", text:"Roll 2d6, add the most relevant attribute modifier and skill level, and equal or exceed the difficulty. If the character lacks the skill, apply the untrained penalty.", aliases:["ability check","task check","2d6","difficulty"] },
  { title:"Initiative", category:"Combat", source:"Rules of the Game · Initiative", text:"At the start of combat, each side rolls initiative. The winning side acts first, and the members of each side may act in whatever order they choose. The GM may instead use individual initiative when appropriate.", aliases:["turn order","who goes first","combat order"] },
  { title:"Actions in Combat", category:"Combat", source:"Rules of the Game · Combat Actions", text:"On a turn, a combatant normally takes one Main Action and one Move Action. On Turn actions are quick and may be taken during the combatant’s turn; Instant actions may be used whenever their trigger permits.", aliases:["main action","move action","on turn","instant action","what can i do"] },
  { title:"Dropping to 0 Hit Points", category:"Injury", source:"Rules of the Game · Injury and Healing", text:"A character reduced to 0 hit points by a lethal injury is Mortally Wounded and will die unless stabilized in time. Further injury can kill them outright, and recovering from a mortal wound can leave them Frail.", aliases:["zero hp","0 hp","dying","death","mortally wounded","stabilize"] },
  { title:"Stabilizing a Mortally Wounded Character", category:"Injury", source:"Rules of the Game · Stabilizing", text:"An adjacent helper can attempt to stabilize a Mortally Wounded character with the Heal skill. Success prevents death, but the wounded character remains at 0 hit points until healing restores them and may suffer Frailty.", aliases:["first aid","heal dying","save from death","stabilisation"] },
  { title:"System Strain", category:"Injury", source:"Rules of the Game · System Strain", text:"System Strain measures the body’s accumulated stress from healing and deprivation. It cannot normally exceed Constitution; effects that would add Strain at the maximum cannot be accepted. A good night’s rest removes one point.", aliases:["strain maximum","healing limit","rest recovery"] },
  { title:"Falling", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"Most creatures take 1d6 damage per 10 full feet fallen, to a maximum of 20d6. Spikes or other hazardous terrain at the bottom add at least 1d6. An intentional leap or controlled skid allows a Dex/Exert or Str/Exert check at difficulty 7 plus 1 per 10 full feet; success halves the effective distance.", aliases:["fall","falls","fell","fallen","falling damage","fall damage","damage from a fall","drop damage","plunge"] },
  { title:"Suffocation", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"A creature can fight or act normally without air for one round per point of Constitution, or 10 rounds for most NPCs. Remaining still quadruples this time. After running out of air, it must make a Physical save each round or take 1 hit point of damage per Hit Die or level.", aliases:["suffocate","suffocating","drowning","drown","hold breath","holding breath","without air","underwater"] },
  { title:"Poisons", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"A typical dungeon poison forces a Physical save or costs half the victim’s maximum hit points; very potent poisons can kill outright. Poison deaths usually take at least 1d6 minutes, allowing an antidote or an Int/Heal check to counteract the toxin.", aliases:["poison","poisoned","toxin","venom","antidote"] },
  { title:"Natural Healing", category:"Injury", source:"Rules of the Game · Injury, Healing, and System Strain · p. 48", text:"After each night’s rest, a properly fed creature with decent sleep recovers lost hit points equal to its level or Hit Dice and loses one System Strain. Frail creatures receive neither benefit.", aliases:["heal naturally","natural recovery","recover hp","night rest","nightly healing","rest healing"] },
  { title:"First Aid", category:"Injury", source:"Rules of the Game · Injury, Healing, and System Strain · p. 48", text:"A few minutes of treatment restores 1d6 plus the healer’s Heal skill in hit points, with a -1 penalty if the healer is untrained. Each application adds 1 System Strain and can be repeated while the target can accept the Strain.", aliases:["mundane healing","heal skill","medical attention","bandage","treat wounds"] },
  { title:"Shock Damage", category:"Combat", source:"Rules of the Game · Shock", text:"Many melee weapons inflict Shock on a miss against targets with an Armor Class equal to or lower than the weapon’s listed Shock AC. A successful hit never inflicts less damage than the Shock it would have caused.", aliases:["damage on miss","shock ac","melee miss"] },
  { title:"Fighting Withdrawal", category:"Combat", source:"Rules of the Game · Fighting Withdrawal", text:"A Fighting Withdrawal uses the combatant’s Main Action to disengage safely and move away without allowing the usual free melee attack from engaged enemies.", aliases:["disengage","leave melee","parting attack","retreat"] },
  { title:"Total Defense", category:"Combat", source:"Rules of the Game · Total Defense", text:"A combatant who takes Total Defense focuses entirely on avoiding harm, gaining the action’s defensive benefit until their next turn but giving up their normal offensive Main Action.", aliases:["defend","dodge","defensive action"] },
  { title:"Execution Attacks", category:"Combat", source:"Rules of the Game · Execution Attacks", text:"An Execution Attack requires an unaware or helpless target and enough time to line up the attempt. If the attack hits, the victim must make a Physical save or suffer immediate mortal injury; a successful save still allows the attack’s normal damage.", aliases:["assassination","execute","helpless target","sniper"] },
  { title:"Effort", category:"Magic", source:"Magic · Effort", text:"Effort powers Arts and similar abilities. Effort committed for an effect remains unavailable while that effect continues; Effort committed for the scene returns when the scene ends, and Effort committed for the day returns after a night’s rest.", aliases:["commit effort","effort for scene","effort for day","refresh effort"] },
  { title:"Spellcasting and Armor", category:"Magic", source:"Magic · Casting Restrictions", text:"Ordinary Mage spellcasting and Arts are disrupted by armor, shields, or restrictive clothing unless the tradition or a special ability explicitly says otherwise. Each tradition’s entry states its exact restriction.", aliases:["cast in armor","shield","armored magic","mage armor"] },
];

const optionRules: RuleEntry[] = [
  ...foci.flatMap(focus => [
    { title:focus.name, category:"Focus", source:`Foci · ${focus.name}`, text:focus.intro },
    { title:`${focus.name} · Level 1`, category:"Focus", source:`Foci · ${focus.name}`, text:focus.level1 },
    ...(focus.level2 ? [{ title:`${focus.name} · Level 2`, category:"Focus", source:`Foci · ${focus.name}`, text:focus.level2 }] : []),
  ]),
  ...highMagic.map(spell => ({ title:spell.name, category:`Spell · Level ${spell.level}`, source:`High Magic · Level ${spell.level}`, text:spell.text })),
  ...Object.entries(traditionSpells).flatMap(([tradition, spells]) => spells.map(spell => ({ title:spell.name, category:`${tradition} spell · Level ${spell.level}`, source:`${tradition} spells · Level ${spell.level}`, text:spell.text }))),
  ...highMageArts.map(art => ({ title:art.name, category:"High Mage Art", source:"High Mage Arts", text:art.text })),
  ...Object.entries(traditionInfo).flatMap(([tradition, info]) => [
    { title:`${tradition} armor restrictions`, category:"Class rule", source:`${tradition} · Restrictions`, text:info.armor, aliases:["armor","shield","casting"] },
    ...info.arts.map(art => ({ title:art.name, category:`${tradition} Art`, source:`${tradition} Arts`, text:art.text })),
  ]),
  ...weapons.map(weapon => ({ title:weapon.name, category:"Weapon", source:"Equipment · Weapons", text:`${weapon.name}: damage ${weapon.damage}; Shock ${weapon.shock || "none"}; range ${weapon.range || "melee"}; traits ${weapon.traits || "none"}.`, aliases:[weapon.traits] })),
];

let completeSrdRulesPromise: Promise<typeof import("./srd-search-data.ts")> | null = null;
let rulesIndexPromise: Promise<RuleEntry[]> | null = null;

function loadCompleteSrdRules() {
  completeSrdRulesPromise ||= import("./srd-search-data.ts");
  return completeSrdRulesPromise;
}

function loadRulesIndex() {
  rulesIndexPromise ||= loadCompleteSrdRules().then(
    ({ completeSrdRules }) => [...coreRules, ...completeSrdRules, ...optionRules],
  );
  return rulesIndexPromise;
}

// The full SRD corpus is large and only needed after someone asks a rules
// question. Keep the familiar local answers available immediately, but load
// the complete search corpus on demand instead of in every character sheet.
export function preloadRulesSearch() {
  void loadRulesIndex();
}
const stopWords = new Set(["a","an","and","are","at","can","do","does","for","happen","happens","how","i","if","in","is","it","my","of","on","or","the","to","what","when","with"]);
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9+\- ]/g, " ").replace(/\s+/g, " ").trim();
const canonicalTerm = (term: string) => {
  const irregular: Record<string,string> = {
    fell:"fall", fallen:"fall", falling:"fall", falls:"fall",
    died:"die", dying:"die", dead:"die",
    healed:"heal", healing:"heal", heals:"heal",
  };
  if (irregular[term]) return irregular[term];
  if (term.length > 5 && term.endsWith("ing")) return term.slice(0, -3);
  if (term.length > 4 && term.endsWith("ed")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("s")) return term.slice(0, -1);
  return term;
};
const termsFor = (value: string) =>
  normalize(value).split(" ").filter(term => term.length > 1 && !/^\d+$/.test(term) && !stopWords.has(term)).map(canonicalTerm);
const containsPhrase = (text: string, phrase: string) =>
  phrase.length > 0 && (` ${text} `).includes(` ${phrase} `);
const excerptFor = (text: string, terms: string[]) => {
  const excerptLength = 280;
  if (text.length <= excerptLength) return text;
  const lower = text.toLowerCase();
  const hits = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const hit = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, hit - 70);
  const end = Math.min(text.length, start + excerptLength);
  const excerpt = text.slice(start, end).trim();
  return `${start ? "… " : ""}${excerpt}${end < text.length ? " …" : ""}`;
};

export async function searchRules(question: string, limit = 4) {
  const normalizedQuestion = normalize(question);
  const terms = termsFor(question);
  if (!terms.length) return [];
  const rulesIndex = await loadRulesIndex();
  return rulesIndex.map(entry => {
    const title = normalize(entry.title);
    const aliases = (entry.aliases || []).map(normalize);
    const haystack = normalize(`${entry.title} ${entry.category} ${entry.source} ${entry.text} ${(entry.aliases || []).join(" ")}`);
    const haystackTerms = new Set(termsFor(haystack));
    let score = title === normalizedQuestion ? 100 : title.includes(normalizedQuestion) ? 40 : 0;
    if (aliases.some(alias => containsPhrase(normalizedQuestion, alias))) score += 60;
    if (aliases.some(alias => {
      const aliasTerms = termsFor(alias);
      return aliasTerms.length > 1 && aliasTerms.every(term => terms.includes(term));
    })) score += 50;
    const titleTerms = new Set(termsFor(title));
    if (titleTerms.size === new Set(terms).size && terms.every(term => titleTerms.has(term))) score += 25;
    for (const term of terms) score += titleTerms.has(term) ? 10 : haystackTerms.has(term) ? 3 : 0;
    if (terms.every(term => haystackTerms.has(term))) score += 10;
    return { entry, score };
  }).filter(result => result.score > 0)
    .sort((a,b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0,limit)
    .map(result => ({
      ...result.entry,
      fullText: result.entry.text,
      text: excerptFor(result.entry.text, terms),
    }));
}
