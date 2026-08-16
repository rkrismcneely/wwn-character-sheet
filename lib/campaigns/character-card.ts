export type CampaignCharacterCardData = {
  name?: string;
  level?: number;
  classMode?: "full" | "adventurer";
  classOne?: string;
  classTwo?: string;
  attrs?: Partial<Record<"DEX" | "CON", number>>;
  armor?: string;
  shield?: string;
  armorBonus?: number;
  hpCurrent?: number;
  hpMax?: number;
  hpRolls?: number[];
  focusPicks?: Array<{ name?: string }>;
  artPicks?: string[];
  artEffort?: boolean[];
};

const ARMOR_AC: Record<string, { ac: number; enc: number }> = {
  "No Armor": { ac: 10, enc: 0 },
  "War Shirt": { ac: 11, enc: 0 },
  "Buff Coat": { ac: 12, enc: 0 },
  Linothorax: { ac: 13, enc: 1 },
  "War Robe": { ac: 14, enc: 3 },
  "Pieced Armor": { ac: 14, enc: 2 },
  "Mail Shirt": { ac: 14, enc: 1 },
  "Cuirass and Greaves": { ac: 15, enc: 2 },
  "Scaled Armor": { ac: 16, enc: 3 },
  "Mail Hauberk": { ac: 16, enc: 2 },
  "Plate Armor": { ac: 17, enc: 2 },
  "Great Armor": { ac: 19, enc: 3 },
  "Grand Plate": { ac: 16, enc: 3 },
};

function modifier(score: unknown): number {
  const value = Number(score);
  return Number.isFinite(value) ? Math.floor((value - 10) / 2) : 0;
}

function selectedClasses(data: CampaignCharacterCardData): string[] {
  return (data.classMode === "adventurer"
    ? [data.classOne, data.classTwo]
    : [data.classOne]
  ).filter((value): value is string => Boolean(value));
}

export function campaignCardClassLabel(data: CampaignCharacterCardData, fallback: string): string {
  const classes = selectedClasses(data);
  if (!classes.length) return fallback;
  return data.classMode === "adventurer"
    ? `${classes[0]}${classes[1] ? ` / ${classes[1]}` : ""} Adventurer`
    : classes[0];
}

export function campaignCardArmorClass(data: CampaignCharacterCardData): number {
  const armor = ARMOR_AC[data.armor || "No Armor"] || ARMOR_AC["No Armor"];
  const shield = data.shield === "Small Shield" ? 13 : data.shield === "Large Shield" ? 14 : 0;
  const armorBase = shield ? Math.max(armor.ac, shield) + (armor.ac >= shield ? 1 : 0) : armor.ac;
  const focusNames = new Set((data.focusPicks || []).map(pick => pick.name));
  const classes = selectedClasses(data);
  const level = Math.min(10, Math.max(1, Number(data.level) || 1));
  const impervious = focusNames.has("Impervious Defense") ? 15 + Math.ceil(level / 2) + (data.shield ? 1 : 0) : 0;
  const vowed = classes.includes("Vowed") && (data.armor || "No Armor") === "No Armor" && !data.shield ? 13 + Math.floor(level / 2) : 0;
  const coldFlesh = (data.artPicks || []).includes("Cold Flesh") ? 12 + Math.floor(level / 2) + (data.shield ? 1 : 0) : 0;
  const base = Math.max(armorBase, impervious, vowed, coldFlesh);
  const pavisIndex = (data.artPicks || []).indexOf("Pavis of Elements");
  const pavis = pavisIndex >= 0 && Boolean(data.artEffort?.[pavisIndex]);
  return pavis ? Math.min(18, base + modifier(data.attrs?.DEX) + Number(data.armorBonus || 0) + 4)
    : base + modifier(data.attrs?.DEX) + Number(data.armorBonus || 0);
}

export function campaignCardHpMax(data: CampaignCharacterCardData): number {
  const level = Math.min(10, Math.max(1, Number(data.level) || 1));
  const rolls = Array.isArray(data.hpRolls) ? data.hpRolls.slice(0, level) : [];
  const classes = selectedClasses(data);
  const classBonus = classes.includes("Warrior") && !classes.includes("Duelist")
    ? 2
    : classes.includes("Expert") || classes.includes("Vowed") ? 0 : -1;
  const dieHard = (data.focusPicks || []).some(pick => pick.name === "Die Hard");
  let total = 0;
  let complete = Boolean(data.level) && rolls.length >= level;
  for (let index = 0; index < level; index += 1) {
    const raw = Number(rolls[index]);
    if (!raw) {
      complete = false;
      break;
    }
    const perDie = modifier(data.attrs?.CON) + classBonus + (dieHard ? 2 : 0);
    const rolled = Math.max(index + 1, raw + perDie * (index + 1));
    total = index === 0 ? rolled : Math.max(total + 1, rolled);
  }
  return complete ? total : Math.max(0, Number(data.hpMax) || 0);
}
