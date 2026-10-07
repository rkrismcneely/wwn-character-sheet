import { traditionInfo, traditionSpells } from "./class-data.ts";
import { ruleConcepts, type RuleConcept } from "./rules-search-concepts.ts";
import { foci, highMageArts, highMagic, weapons } from "./wwn-data.ts";

export type RuleReference = {
  title: string;
  category: string;
  source: string;
};

export type RuleContextSection = RuleReference & {
  text: string;
};

export type RuleContext = {
  parents: RuleContextSection[];
  children: RuleContextSection[];
  nearby: RuleReference[];
};

export type RuleEntry = {
  title: string;
  category: string;
  source: string;
  text: string;
  aliases?: string[];
  fullText?: string;
  detailTitle?: string;
  detailSource?: string;
  matchKind?: "controlling" | "supporting" | "match";
  confidence?: "high" | "medium" | "low";
  ambiguous?: boolean;
  context?: RuleContext;
  relatedRules?: RuleReference[];
};

const coreRules: RuleEntry[] = [
  { title:"Skill Checks", category:"Core rule", source:"Rules of the Game · Skill Checks", text:"Roll 2d6, add the most relevant attribute modifier and skill level, and equal or exceed the difficulty. If the character lacks the skill, apply the untrained penalty.", aliases:["ability check","task check","2d6","difficulty"] },
  { title:"Initiative", category:"Combat", source:"Rules of the Game · Initiative", text:"At the start of combat, each side rolls initiative. The winning side acts first, and the members of each side may act in whatever order they choose. The GM may instead use individual initiative when appropriate.", aliases:["turn order","who goes first","combat order"] },
  { title:"Actions in Combat", category:"Combat", source:"Rules of the Game · Combat Actions", text:"On a turn, a combatant normally takes one Main Action and one Move Action. On Turn actions are quick and may be taken during the combatant’s turn; Instant actions may be used whenever their trigger permits.", aliases:["main action","move action","on turn","instant action","what can i do"], detailTitle:"Common Combat Actions" },
  { title:"Dropping to 0 Hit Points", category:"Injury", source:"Rules of the Game · Injury and Healing", text:"A character reduced to 0 hit points by a lethal injury is Mortally Wounded and will die unless stabilized in time. Further injury can kill them outright, and recovering from a mortal wound can leave them Frail.", aliases:["zero hp","0 hp","dying","death","mortally wounded","stabilize"], detailTitle:"Mortal Injury and Stabilization" },
  { title:"Stabilizing a Mortally Wounded Character", category:"Injury", source:"Rules of the Game · Stabilizing", text:"An adjacent helper can attempt to stabilize a Mortally Wounded character with the Heal skill. Success prevents death, but the wounded character remains at 0 hit points until healing restores them and may suffer Frailty.", aliases:["first aid","heal dying","save from death","stabilisation"], detailTitle:"Mortal Injury and Stabilization" },
  { title:"System Strain", category:"Injury", source:"Rules of the Game · System Strain", text:"System Strain measures the body’s accumulated stress from healing and deprivation. It cannot normally exceed Constitution; effects that would add Strain at the maximum cannot be accepted. A good night’s rest removes one point.", aliases:["strain maximum","healing limit","rest recovery"] },
  { title:"Falling", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"Most creatures take 1d6 damage per 10 full feet fallen, to a maximum of 20d6. Spikes or other hazardous terrain at the bottom add at least 1d6. An intentional leap or controlled skid allows a Dex/Exert or Str/Exert check at difficulty 7 plus 1 per 10 full feet; success halves the effective distance.", aliases:["fall","falls","fell","fallen","falling damage","fall damage","damage from a fall","drop damage","plunge"] },
  { title:"Suffocation", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"A creature can fight or act normally without air for one round per point of Constitution, or 10 rounds for most NPCs. Remaining still quadruples this time. After running out of air, it must make a Physical save each round or take 1 hit point of damage per Hit Die or level.", aliases:["suffocate","suffocating","drowning","drown","hold breath","holding breath","without air","underwater"] },
  { title:"Poisons", category:"Hazard", source:"Rules of the Game · Falling and Other Hazards · p. 49", text:"A typical dungeon poison forces a Physical save or costs half the victim’s maximum hit points; very potent poisons can kill outright. Poison deaths usually take at least 1d6 minutes, allowing an antidote or an Int/Heal check to counteract the toxin.", aliases:["poison","poisoned","toxin","venom","antidote"], detailTitle:"Poisons and Diseases" },
  { title:"Natural Healing", category:"Injury", source:"Rules of the Game · Injury, Healing, and System Strain · p. 48", text:"After each night’s rest, a properly fed creature with decent sleep recovers lost hit points equal to its level or Hit Dice and loses one System Strain. Frail creatures receive neither benefit.", aliases:["heal naturally","natural recovery","recover hp","night rest","nightly healing","rest healing"] },
  { title:"First Aid", category:"Injury", source:"Rules of the Game · Injury, Healing, and System Strain · p. 48", text:"A few minutes of treatment restores 1d6 plus the healer’s Heal skill in hit points, with a -1 penalty if the healer is untrained. Each application adds 1 System Strain and can be repeated while the target can accept the Strain.", aliases:["mundane healing","heal skill","medical attention","bandage","treat wounds"] },
  { title:"Shock Damage", category:"Combat", source:"Rules of the Game · Shock", text:"Many melee weapons inflict Shock on a miss against targets with an Armor Class equal to or lower than the weapon’s listed Shock AC. A successful hit never inflicts less damage than the Shock it would have caused.", aliases:["damage on miss","shock ac","melee miss"], detailTitle:"Shock" },
  { title:"Fighting Withdrawal", category:"Combat", source:"Rules of the Game · Fighting Withdrawal", text:"A Fighting Withdrawal uses the combatant’s Main Action to disengage safely and move away without allowing the usual free melee attack from engaged enemies.", aliases:["disengage","leave melee","parting attack","retreat"], detailTitle:"Common Combat Actions" },
  { title:"Ranged Attacks in Melee", category:"Combat", source:"Rules of the Game · Common Combat Actions", text:"If an enemy attacker is in melee range, one-handed ranged weapons and thrown weapons take a -4 penalty to hit. Bows and other two-handed ranged weapons cannot normally be fired while an enemy is in melee range.", aliases:["shoot in melee","shoot while engaged","bow in melee","ranged attack beside enemy","enemy next to me"], detailTitle:"Common Combat Actions" },
  { title:"Reloading Weapons", category:"Combat", source:"Rules of the Game · Common Combat Actions", text:"Reloading a crossbow from Readied ammunition is normally a Main Action. A bow or crossbow can be reloaded as an On Turn action if the shooter has Shoot-1 or better; otherwise nocking a new arrow in a bow is a Move Action.", aliases:["reload","reload and attack","nock arrow","crossbow reload"], detailTitle:"Common Combat Actions" },
  { title:"Prone in Combat", category:"Combat", source:"Rules of the Game · Common Combat Actions", text:"Going prone is an On Turn action. While prone, ranged attacks against you take a -2 penalty, melee-range attacks against you gain a +2 bonus, and your normal movement rate is halved.", aliases:["prone","go prone","lying down","harder to shoot"], detailTitle:"Common Combat Actions" },
  { title:"Total Defense", category:"Combat", source:"Rules of the Game · Total Defense", text:"A combatant who takes Total Defense focuses entirely on avoiding harm, gaining the action’s defensive benefit until their next turn but giving up their normal offensive Main Action.", aliases:["defend","dodge","defensive action"], detailTitle:"Common Combat Actions" },
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
let rulesIndexPromise: Promise<IndexedRule[]> | null = null;

function loadCompleteSrdRules() {
  completeSrdRulesPromise ||= import("./srd-search-data.ts");
  return completeSrdRulesPromise;
}

type IndexedRule = RuleEntry & {
  sectionNumber?: string;
  documentTitle?: string;
  parentSectionNumber?: string;
  sortIndex?: number;
};

const sectionHeadingPattern = /(?:^|(?<=[.!?·])\s+)(\d+(?:\.\d+){2,})\s+([A-Z][^.]{2,90}?)\s+\.\s+/gu;

function parentSectionNumber(sectionNumber: string) {
  const parts = sectionNumber.split(".");
  return parts.length > 3 ? parts.slice(0, -1).join(".") : parts.slice(0, -1).join(".");
}

function segmentSrdEntry(entry: RuleEntry): IndexedRule[] {
  const matches = [...entry.text.matchAll(sectionHeadingPattern)];
  if (!matches.length) return [{ ...entry, documentTitle: entry.title }];

  const sections: IndexedRule[] = [];
  const firstIndex = matches[0].index ?? 0;
  const introduction = entry.text.slice(0, firstIndex).trim();
  if (introduction) sections.push({ ...entry, text: introduction, documentTitle: entry.title, sortIndex: -1 });

  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? entry.text.length) : entry.text.length;
    const text = entry.text.slice(start, end).trim();
    const title = match[2]?.trim();
    const sectionNumber = match[1]?.trim();
    if (!title || !sectionNumber || !text) return;
    sections.push({
      title,
      category: entry.category,
      source: `${entry.source} · ${sectionNumber}`,
      text,
      sectionNumber,
      parentSectionNumber: parentSectionNumber(sectionNumber),
      documentTitle: entry.title,
      sortIndex: index,
    });
  });

  return sections.length ? sections : [{ ...entry, documentTitle: entry.title }];
}

function loadRulesIndex(): Promise<IndexedRule[]> {
  rulesIndexPromise ||= loadCompleteSrdRules().then(({ completeSrdRules }) => [
    ...coreRules.map(entry => ({ ...entry, documentTitle: entry.title })),
    ...completeSrdRules.flatMap(segmentSrdEntry),
    ...optionRules.map(entry => ({ ...entry, documentTitle: entry.title })),
  ]);
  return rulesIndexPromise as Promise<IndexedRule[]>;
}

// The full SRD corpus is large and only needed after someone asks a rules
// question. Keep the familiar local answers available immediately, but load
// the complete search corpus on demand instead of in every character sheet.
export function preloadRulesSearch() {
  void loadRulesIndex();
}

const stopWords = new Set([
  "a", "an", "and", "are", "at", "be", "can", "do", "does", "for", "from", "happen", "happens", "how", "i", "if",
  "in", "into", "is", "it", "me", "much", "my", "of", "on", "or", "somebody", "someone", "that", "the", "them", "they",
  "this", "to", "what", "when", "where", "which", "while", "who", "why", "with",
]);

const normalize = (value: string) => value
  .toLowerCase()
  .replace(/[’']/g, "")
  .replace(/\bhit[\s-]?points?\b/gu, "hp")
  .replace(/\barmour\b/gu, "armor")
  .replace(/\bstabilisation\b/gu, "stabilization")
  .replace(/\bstabilise\b/gu, "stabilize")
  .replace(/[^a-z0-9+\- ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const canonicalTerm = (term: string) => {
  const irregular: Record<string, string> = {
    classes:"class",
    committed:"commit",
    committing:"commit",
    died:"die",
    dying:"die",
    dead:"die",
    fell:"fall",
    fallen:"fall",
    falling:"fall",
    falls:"fall",
    healed:"heal",
    healing:"heal",
    heals:"heal",
    misses:"miss",
    modifiers:"modifier",
    returned:"return",
    returning:"return",
    returns:"return",
    skills:"skill",
    starting:"start",
    wounded:"wound",
  };
  if (irregular[term]) return irregular[term];
  if (term.length > 5 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith("ing")) {
    const base = term.slice(0, -3);
    return base.length > 2 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
  }
  if (term.length > 4 && term.endsWith("ed")) {
    const base = term.slice(0, -2);
    return base.length > 2 && base.at(-1) === base.at(-2) ? base.slice(0, -1) : base;
  }
  if (term.length > 5 && term.endsWith("sses")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("s")) return term.slice(0, -1);
  return term;
};

const termsFor = (value: string) => [...new Set(
  normalize(value)
    .split(" ")
    .filter(term => term.length > 1 && !/^\d+$/u.test(term) && !stopWords.has(term))
    .map(canonicalTerm),
)];

const containsPhrase = (text: string, phrase: string) =>
  phrase.length > 0 && (` ${text} `).includes(` ${phrase} `);

const excerptFor = (text: string, terms: string[]) => {
  const excerptLength = 280;
  if (text.length <= excerptLength) return text;
  const lower = normalize(text);
  const hits = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
  const hit = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, hit - 70);
  const end = Math.min(text.length, start + excerptLength);
  const excerpt = text.slice(start, end).trim();
  return `${start ? "… " : ""}${excerpt}${end < text.length ? " …" : ""}`;
};

type ConceptMatch = {
  concept: RuleConcept;
  strength: number;
};

function matchedConcepts(normalizedQuestion: string, terms: string[]): ConceptMatch[] {
  const queryTerms = new Set(terms);
  return ruleConcepts.map(concept => {
    let strength = 0;
    for (const phrase of concept.phrases) {
      const normalizedPhrase = normalize(phrase);
      if (containsPhrase(normalizedQuestion, normalizedPhrase)) {
        strength = Math.max(strength, 120 + Math.min(32, termsFor(normalizedPhrase).length * 8));
      }
    }

    const conceptTerms = new Set(concept.terms.flatMap(termsFor));
    const hits = [...conceptTerms].filter(term => queryTerms.has(term)).length;
    if (hits >= 2) strength = Math.max(strength, 44 + hits * 15);
    return { concept, strength };
  }).filter(match => match.strength > 0)
    .sort((left, right) => right.strength - left.strength);
}

function conceptBoost(entry: RuleEntry, matches: ConceptMatch[]) {
  const title = normalize(entry.title);
  let boost = 0;
  for (const { concept, strength } of matches) {
    const controllingIndex = concept.controllingTitles.findIndex(candidate => normalize(candidate) === title);
    if (controllingIndex >= 0) {
      boost = Math.max(boost, 180 + strength - controllingIndex * 10);
      continue;
    }
    if (concept.relatedTitles?.some(candidate => normalize(candidate) === title)) {
      boost = Math.max(boost, 45 + Math.round(strength * 0.4));
    }
  }
  return boost;
}

function lexicalScore(entry: RuleEntry, normalizedQuestion: string, terms: string[]) {
  const title = normalize(entry.title);
  const aliases = (entry.aliases || []).filter(Boolean).map(normalize);
  const titleTerms = new Set(termsFor(title));
  const aliasTerms = new Set(termsFor(aliases.join(" ")));
  const categoryTerms = new Set(termsFor(entry.category));
  const sourceTerms = new Set(termsFor(entry.source));
  const bodyTerms = new Set(termsFor(entry.text));
  const queryTermSet = new Set(terms);

  let score = 0;
  if (title === normalizedQuestion) score += 220;
  else if (normalizedQuestion.length > 2 && title.includes(normalizedQuestion)) score += 100;
  else if (titleTerms.size > 1 && containsPhrase(normalizedQuestion, title)) score += 90;

  if (titleTerms.size === queryTermSet.size && terms.every(term => titleTerms.has(term))) score += 90;
  else if (terms.length > 1 && terms.every(term => titleTerms.has(term))) score += 45;

  for (const alias of aliases) {
    if (alias === normalizedQuestion) score += 130;
    else if (containsPhrase(normalizedQuestion, alias)) score += termsFor(alias).length > 1 ? 90 : 65;
  }

  for (const term of terms) {
    if (titleTerms.has(term)) score += 22;
    if (aliasTerms.has(term)) score += 12;
    if (sourceTerms.has(term)) score += 6;
    if (categoryTerms.has(term)) score += 4;
    if (bodyTerms.has(term)) score += 2;
  }

  if (terms.length > 1 && terms.every(term => titleTerms.has(term) || aliasTerms.has(term) || sourceTerms.has(term))) score += 30;
  if (terms.length > 1 && terms.every(term => bodyTerms.has(term))) score += 8;
  if (entry.text.length > 3000 && score < 100) score -= Math.min(18, Math.floor(entry.text.length / 3000) * 3);
  return score;
}

const referenceFor = (entry: RuleEntry): RuleReference => ({
  title: entry.title,
  category: entry.category,
  source: entry.source,
});

function exactTitleCandidates(title: string, rulesIndex: IndexedRule[]) {
  const wanted = normalize(title);
  return rulesIndex.filter(entry => normalize(entry.title) === wanted);
}

function bestDetailedEntry(entry: RuleEntry, rulesIndex: IndexedRule[]): IndexedRule {
  const requestedTitles = [entry.detailTitle, entry.title].filter((title): title is string => Boolean(title));
  for (const requestedTitle of requestedTitles) {
    const candidates = exactTitleCandidates(requestedTitle, rulesIndex);
    if (!candidates.length) continue;
    return [...candidates].sort((left, right) => {
      const leftScore = (left.sectionNumber ? 100000 : 0) + (left.category === "SRD rule" ? 10000 : 0) + Math.min(left.text.length, 9000);
      const rightScore = (right.sectionNumber ? 100000 : 0) + (right.category === "SRD rule" ? 10000 : 0) + Math.min(right.text.length, 9000);
      return rightScore - leftScore;
    })[0];
  }
  return entry as IndexedRule;
}

function contextFor(detail: IndexedRule, rulesIndex: IndexedRule[]): RuleContext {
  const sameDocument = rulesIndex.filter(candidate => candidate.documentTitle && candidate.documentTitle === detail.documentTitle);
  const parents: RuleContextSection[] = [];
  let parentNumber = detail.parentSectionNumber;
  while (parentNumber && parents.length < 2) {
    const parent = sameDocument.find(candidate => candidate.sectionNumber === parentNumber);
    if (!parent) break;
    parents.push({ ...referenceFor(parent), text: parent.text });
    parentNumber = parent.parentSectionNumber;
  }

  const documentIntroduction = sameDocument.find(candidate =>
    !candidate.sectionNumber &&
    candidate.title === detail.documentTitle &&
    candidate.text.trim().length > 0 &&
    candidate.title !== detail.title
  );
  if (documentIntroduction && parents.length < 2) {
    parents.push({ ...referenceFor(documentIntroduction), text: documentIntroduction.text });
  }

  const children = detail.sectionNumber
    ? sameDocument
      .filter(candidate => candidate.parentSectionNumber === detail.sectionNumber)
      .slice(0, 6)
      .map(child => ({ ...referenceFor(child), text: child.text }))
    : [];

  let nearby: RuleReference[] = [];
  if (detail.sectionNumber) {
    const siblings = sameDocument
      .filter(candidate => candidate.sectionNumber && candidate.parentSectionNumber === detail.parentSectionNumber)
      .sort((left, right) => (left.sortIndex ?? 0) - (right.sortIndex ?? 0));
    const currentIndex = siblings.findIndex(candidate => candidate.sectionNumber === detail.sectionNumber);
    nearby = [siblings[currentIndex - 1], siblings[currentIndex + 1]]
      .filter((candidate): candidate is IndexedRule => Boolean(candidate))
      .map(referenceFor);
  }

  return { parents, children, nearby };
}

function matchKindFor(entry: RuleEntry, matches: ConceptMatch[]): RuleEntry["matchKind"] {
  const title = normalize(entry.title);
  if (matches.some(({ concept }) => concept.controllingTitles.some(candidate => normalize(candidate) === title))) return "controlling";
  if (matches.some(({ concept }) => concept.relatedTitles?.some(candidate => normalize(candidate) === title))) return "supporting";
  return "match";
}

function relatedReferences(entry: RuleEntry, matches: ConceptMatch[], rulesIndex: IndexedRule[]) {
  const currentTitles = new Set([normalize(entry.title), normalize(entry.detailTitle || "")]);
  const titles = matches.flatMap(({ concept }) => [...concept.controllingTitles, ...(concept.relatedTitles || [])]);
  const seen = new Set<string>();
  const references: RuleReference[] = [];
  for (const title of titles) {
    const key = normalize(title);
    if (!key || currentTitles.has(key) || seen.has(key)) continue;
    const candidate = exactTitleCandidates(title, rulesIndex)[0];
    if (!candidate) continue;
    seen.add(key);
    references.push(referenceFor(candidate));
    if (references.length >= 6) break;
  }
  return references;
}

function confidenceFor(score: number, matchKind: RuleEntry["matchKind"]): RuleEntry["confidence"] {
  if (matchKind === "controlling" || score >= 160) return "high";
  if (matchKind === "supporting" || score >= 55) return "medium";
  return "low";
}

function enrichedRule(
  entry: RuleEntry,
  rulesIndex: IndexedRule[],
  matches: ConceptMatch[],
  terms: string[],
  metadata?: { score?: number; ambiguous?: boolean },
): RuleEntry {
  const detail = bestDetailedEntry(entry, rulesIndex);
  const matchKind = matchKindFor(entry, matches);
  return {
    ...entry,
    text: excerptFor(entry.text, terms),
    fullText: detail.text,
    detailTitle: detail.title,
    detailSource: detail.source,
    matchKind,
    confidence: confidenceFor(metadata?.score ?? 160, matchKind),
    ambiguous: metadata?.ambiguous,
    context: contextFor(detail, rulesIndex),
    relatedRules: relatedReferences(entry, matches, rulesIndex),
  };
}

export async function getRuleDetail(title: string, question = ""): Promise<RuleEntry | null> {
  const rulesIndex = await loadRulesIndex();
  const candidates = exactTitleCandidates(title, rulesIndex);
  if (!candidates.length) return null;
  const sourceEntry = candidates[0];
  const query = question.trim() || title;
  const normalizedQuestion = normalize(query);
  const terms = termsFor(query);
  const concepts = matchedConcepts(normalizedQuestion, terms);
  const score = lexicalScore(sourceEntry, normalizedQuestion, terms) + conceptBoost(sourceEntry, concepts);
  return enrichedRule(sourceEntry, rulesIndex, concepts, terms, { score });
}

export async function searchRules(question: string, limit = 4) {
  const normalizedQuestion = normalize(question);
  const terms = termsFor(question);
  if (!terms.length) return [];

  const rulesIndex = await loadRulesIndex();
  const concepts = matchedConcepts(normalizedQuestion, terms);
  const ranked = rulesIndex.map((entry, index) => ({
    entry,
    index,
    score: lexicalScore(entry, normalizedQuestion, terms) + conceptBoost(entry, concepts),
  })).filter(result => result.score >= 6)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title) || left.index - right.index);

  const uniqueRanked: typeof ranked = [];
  const seenTitles = new Set<string>();
  for (const result of ranked) {
    const titleKey = normalize(result.entry.title);
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    uniqueRanked.push(result);
    if (uniqueRanked.length >= Math.max(limit, 4)) break;
  }

  const top = uniqueRanked[0];
  const second = uniqueRanked[1];
  const topKind = top ? matchKindFor(top.entry, concepts) : undefined;
  const scoreGap = top && second ? top.score - second.score : Number.POSITIVE_INFINITY;
  const ambiguous = Boolean(
    top &&
    topKind !== "controlling" &&
    second &&
    (top.score < 80 || scoreGap <= Math.max(14, top.score * 0.12))
  );

  return uniqueRanked.slice(0, limit).map((result, index) =>
    enrichedRule(result.entry, rulesIndex, concepts, terms, {
      score: result.score,
      ambiguous: index === 0 ? ambiguous : false,
    })
  );
}
