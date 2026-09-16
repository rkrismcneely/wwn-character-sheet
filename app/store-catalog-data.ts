import { formatEquipmentCost, purchasableEquipment, type EquipmentKind } from "./equipment-data.ts";
import { highMagic } from "./wwn-data.ts";
import { equipmentEmporiumCore } from "./store-catalog/equipment-emporium-core.ts";
import { equipmentEmporiumLifestyle } from "./store-catalog/equipment-emporium-lifestyle.ts";
import { equipmentEmporiumTrade } from "./store-catalog/equipment-emporium-trade.ts";
import { equipmentEmporiumWorld } from "./store-catalog/equipment-emporium-world.ts";

export const storeCatalogCategories = [
  "Weapons",
  "Armor & Shields",
  "Adventuring Gear",
  "Tools & Kits",
  "Clothing",
  "Food & Drink",
  "Containers & Storage",
  "Animals & Mounts",
  "Animal Gear",
  "Vehicles & Transport",
  "Trade Goods & Materials",
  "Household Goods",
  "Jewelry & Valuables",
  "Services & Hirelings",
  "Potions",
  "Scrolls",
  "Magic Items",
  "Siege Equipment",
] as const;

export type StoreCatalogCategory = typeof storeCatalogCategories[number];
export type StoreCatalogKind = EquipmentKind | "mundane" | "magical";
export type StoreCatalogSource = "wwn-srd" | "equipment-emporium" | "tidal";

export interface StoreCatalogItem {
  id: string;
  name: string;
  kind: StoreCatalogKind;
  category: StoreCatalogCategory;
  subcategory: string;
  details: string;
  defaultCost: string;
  source: StoreCatalogSource;
  sourceLabel: string;
  license: string;
  priceBasis: string;
  sourceCost?: string;
}

/**
 * Store-only content catalog. This intentionally does not extend
 * `purchasableEquipment`, so importing merchant inventory does not change the
 * character Equipment page.
 *
 * Sources and licensing:
 * - Worlds Without Number SRD / Free Edition, Kevin Crawford: CC0.
 * - Equipment Emporium, First Edition Release 33, Joe Ludlum, R. Kevin Smoot,
 *   and Alan Vetter: textual material, charts, and tables CC BY-SA 4.0.
 * - Tidal Wave Games, d100+ Magic Items: public domain.
 *
 * Equipment Emporium pricing is normalized to the WWN silver economy using
 * the old-school conversion recommended for WWN: source gp becomes the same
 * numeric number of WWN sp and source sp becomes the same number of WWN cp.
 * Source-cp values below 1 WWN cp are rounded up to 1 cp. Exact-name matches
 * with WWN are removed so the canonical WWN price always wins.
 */

const slug = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-+|-+$/gu, "");

export const normalizeStoreCatalogName = (value: string) => value
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/gu, " ")
  .trim();

function officialCategory(item: { name: string; kind: EquipmentKind }): StoreCatalogCategory {
  if (item.kind === "weapon") return "Weapons";
  if (item.kind === "armor" || item.kind === "shield") return "Armor & Shields";
  if (item.kind === "bundle") return "Adventuring Gear";
  if (/^(Arrows|Hurlant bolts)/u.test(item.name)) return "Weapons";
  if (/^(Boots|Clothes)/u.test(item.name)) return "Clothing";
  if (/^Cart/u.test(item.name)) return "Vehicles & Transport";
  if (/^(Cooking utensils|Firewood|Rations)/u.test(item.name)) return "Food & Drink";
  if (/^(Backpack|Flask|Sack|Waterskin)/u.test(item.name)) return "Containers & Storage";
  return "Tools & Kits";
}

const officialWwnCatalog: StoreCatalogItem[] = purchasableEquipment.map(item => ({
  id: item.id,
  name: item.name,
  kind: item.kind,
  category: officialCategory(item),
  subcategory: "",
  details: item.details,
  defaultCost: formatEquipmentCost(item.costCopper),
  source: "wwn-srd",
  sourceLabel: "Worlds Without Number SRD",
  license: "CC0",
  priceBasis: "WWN SRD listed price",
}));

type StoreOnlyRow = readonly [string, StoreCatalogCategory, string, string];

const wwnStoreOnlyRaw: readonly StoreOnlyRow[] = [
  ["Horse, riding", "Animals & Mounts", "200 sp", "WWN riding horse"],
  ["Horse, draft", "Animals & Mounts", "150 sp", "WWN draft horse"],
  ["Horse, battle-trained", "Animals & Mounts", "2,000 sp", "WWN battle-trained horse"],
  ["Mule", "Animals & Mounts", "30 sp", "WWN pack animal"],
  ["Cow", "Animals & Mounts", "10 sp", "WWN livestock"],
  ["Ox, plow-trained", "Animals & Mounts", "15 sp", "WWN plow-trained ox"],
  ["Chicken", "Animals & Mounts", "5 cp", "WWN livestock"],
  ["Pig", "Animals & Mounts", "3 sp", "WWN livestock"],
  ["Dog, working", "Animals & Mounts", "20 sp", "WWN working dog"],
  ["Sheep or goat", "Animals & Mounts", "5 sp", "WWN livestock"],
  ["River ferry, per passenger", "Vehicles & Transport", "5 cp", "WWN passenger fare"],
  ["Ship passage, per expected day", "Vehicles & Transport", "2 sp", "WWN passenger fare"],
  ["Carriage travel, per mile", "Vehicles & Transport", "2 cp", "WWN passenger fare"],
  ["Rowboat", "Vehicles & Transport", "30 sp", "WWN boat"],
  ["Small fishing boat", "Vehicles & Transport", "200 sp", "WWN fishing boat"],
  ["Merchant ship", "Vehicles & Transport", "5,000 sp", "WWN merchant vessel"],
  ["War galleon", "Vehicles & Transport", "50,000 sp", "WWN warship"],
  ["Bard of Small Repute", "Services & Hirelings", "2 sp", "WWN hireling/day labor rate"],
  ["Common Prostitute", "Services & Hirelings", "2 sp", "WWN hireling/day labor rate"],
  ["Dragoman or Skilled Interpreter", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Elite Courtesan", "Services & Hirelings", "100 sp", "WWN hireling/day labor rate"],
  ["Farmer", "Services & Hirelings", "1 sp", "WWN hireling/day labor rate"],
  ["Guard, ordinary", "Services & Hirelings", "2 sp", "WWN hireling/day labor rate"],
  ["Guard, sergeant, for every ten guards", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Lawyer or Pleader", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Mage of Minor Abilities", "Services & Hirelings", "200 sp", "WWN hireling/day labor rate"],
  ["Mundane Physician", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Porter willing to go into the wilds", "Services & Hirelings", "5 sp", "WWN hireling/day labor rate"],
  ["Porter only for relatively safe roads", "Services & Hirelings", "1 sp", "WWN hireling/day labor rate"],
  ["Navigator", "Services & Hirelings", "5 sp", "WWN hireling/day labor rate"],
  ["Sage, per question answered", "Services & Hirelings", "200 sp", "WWN hireling/service rate"],
  ["Sailor", "Services & Hirelings", "1 sp", "WWN hireling/day labor rate"],
  ["Scribe or Clerk", "Services & Hirelings", "3 sp", "WWN hireling/day labor rate"],
  ["Skilled Artisan", "Services & Hirelings", "5 sp", "WWN hireling/day labor rate"],
  ["Unskilled Laborer", "Services & Hirelings", "1 sp", "WWN hireling/day labor rate"],
  ["Veteran Sellsword", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Wilderness Guide", "Services & Hirelings", "10 sp", "WWN hireling/day labor rate"],
  ["Impoverished lifestyle, per week", "Services & Hirelings", "5 sp", "WWN living expense"],
  ["Common lifestyle, per week", "Services & Hirelings", "20 sp", "WWN living expense"],
  ["Rich lifestyle, per week", "Services & Hirelings", "200 sp", "WWN living expense"],
  ["Noble lifestyle, per week", "Services & Hirelings", "1,000 sp", "WWN living expense"],
  ["Magical healing of wounds", "Services & Hirelings", "10 sp/hp", "WWN magical service"],
  ["Magical curing of a disease", "Services & Hirelings", "500 sp", "WWN magical service"],
  ["Lifting a curse or undoing magic", "Services & Hirelings", "1,000 sp", "WWN magical service"],
  ["Casting a minor spell", "Services & Hirelings", "250 sp", "WWN magical service"],
  ["Bribe to overlook a minor crime", "Services & Hirelings", "10 sp", "WWN illicit service"],
  ["Bribe to overlook a major crime", "Services & Hirelings", "500 sp", "WWN illicit service"],
  ["Bribe to overlook a capital crime", "Services & Hirelings", "10,000 sp", "WWN illicit service"],
  ["Hire someone for a minor crime", "Services & Hirelings", "50 sp", "WWN illicit service"],
  ["Hire someone for a major crime", "Services & Hirelings", "1,000 sp", "WWN illicit service"],
  ["Hire someone for an infamous crime", "Services & Hirelings", "25,000 sp", "WWN illicit service"],
  ["Enchanted Weapon +1", "Magic Items", "12,500 sp", "WWN enchanted weapon with a +1 bonus. Select the underlying mundane weapon when stocking it."],
  ["Enchanted Weapon +2", "Magic Items", "50,000 sp", "WWN enchanted weapon with a +2 bonus. Select the underlying mundane weapon when stocking it."],
  ["Enchanted Weapon +3", "Magic Items", "250,000 sp", "WWN enchanted weapon with a +3 bonus. Select the underlying mundane weapon when stocking it."],
  ["Enchanted Armor +1", "Magic Items", "12,500 sp", "WWN enchanted armor with a +1 AC bonus. Select the underlying mundane armor when stocking it."],
  ["Enchanted Armor +2", "Magic Items", "50,000 sp", "WWN enchanted armor with a +2 AC bonus. Select the underlying mundane armor when stocking it."],
  ["Enchanted Armor +3", "Magic Items", "250,000 sp", "WWN enchanted armor with a +3 AC bonus. Select the underlying mundane armor when stocking it."],
];

const wwnStoreOnlyCatalog: StoreCatalogItem[] = wwnStoreOnlyRaw.map(([name, category, defaultCost, details]) => ({
  id: `wwn:${slug(name)}`,
  name,
  kind: category === "Magic Items" ? "magical" : "mundane",
  category,
  subcategory: "",
  details,
  defaultCost,
  source: "wwn-srd",
  sourceLabel: "Worlds Without Number SRD",
  license: "CC0",
  priceBasis: category === "Magic Items"
    ? "TWE suggested value using WWN magic-item creation tiers"
    : "WWN SRD listed price",
}));

const spellScrollCatalog: StoreCatalogItem[] = highMagic.map(spell => ({
  id: `wwn:scroll:${slug(spell.name)}`,
  name: `Scroll of ${spell.name}`,
  kind: "magical",
  category: "Scrolls",
  subcategory: `Level ${spell.level}`,
  details: `Level ${spell.level} High Magic spell scroll. ${spell.text}`,
  defaultCost: `${(spell.level * 1_000).toLocaleString("en-US")} sp`,
  source: "wwn-srd",
  sourceLabel: "Worlds Without Number SRD",
  license: "CC0",
  priceBasis: "WWN scroll creation cost: 1,000 sp per spell level",
}));

type EeRow = readonly [StoreCatalogCategory, string, string, string];

function parseEquipmentEmporiumRows(input: string): EeRow[] {
  return input.split("\n").filter(Boolean).map(line => {
    const [category, name, sourceCost, defaultCost] = line.split("\t");
    if (!storeCatalogCategories.includes(category as StoreCatalogCategory) || !name || !sourceCost || !defaultCost) {
      throw new Error(`Invalid Equipment Emporium catalog row: ${line}`);
    }
    return [category as StoreCatalogCategory, name, sourceCost, defaultCost];
  });
}

const equipmentEmporiumRaw: EeRow[] = [
  ...parseEquipmentEmporiumRows(equipmentEmporiumCore),
  ...parseEquipmentEmporiumRows(equipmentEmporiumLifestyle),
  ...parseEquipmentEmporiumRows(equipmentEmporiumWorld),
  ...parseEquipmentEmporiumRows(equipmentEmporiumTrade),
];

const canonicalNames = new Set(
  [...officialWwnCatalog, ...wwnStoreOnlyCatalog].map(item => normalizeStoreCatalogName(item.name)),
);
const seenEeNames = new Set<string>();

const equipmentEmporiumCatalog: StoreCatalogItem[] = equipmentEmporiumRaw
  .filter(([, name]) => {
    const normalized = normalizeStoreCatalogName(name);
    if (canonicalNames.has(normalized) || seenEeNames.has(normalized)) return false;
    seenEeNames.add(normalized);
    return true;
  })
  .map(([category, name, sourceCost, defaultCost]) => ({
    id: `ee:${slug(name)}`,
    name,
    kind: "mundane",
    category,
    subcategory: "",
    details: `Equipment Emporium r33 · source price ${sourceCost}`,
    defaultCost,
    source: "equipment-emporium",
    sourceLabel: "Equipment Emporium r33",
    license: "CC BY-SA 4.0",
    priceBasis: "BFRPG price normalized to WWN silver economy",
    sourceCost,
  }));

const tidalRaw = [
  ["Amulet of Proof Against Detection", "Magic Items", "12,500 sp", "Cannot be targeted by crystal balls or other forms of scrying."],
  ["Bag of Holding", "Magic Items", "12,500 sp", "Extradimensional storage roughly 10′×5′×3′; can hold up to 100 ordinary items. Treat the bag itself as a normal carried container for WWN encumbrance."],
  ["Boots of Elvenkind", "Magic Items", "12,500 sp", "The wearer's ordinary footsteps make no sound, allowing silent movement where the terrain itself does not make stealth impossible."],
  ["Boots of Striding and Springing", "Magic Items", "12,500 sp", "Doubles ordinary walking speed and doubles jumping height and distance."],
  ["Candle of Invocation", "Magic Items", "2,500 sp", "Burns for up to four hours total and may be snuffed to conserve duration. While burning it sheds light and grants allies within 30′ a +1 bonus to hit and saving throws."],
  ["Chime of Opening", "Magic Items", "10,000 sp", "Ten uses. Each use loudly opens one mundane locked or barred portal that could be opened by conventional means; exceptionally secured or magical barriers may resist at the GM's discretion."],
  ["Cloak of Elvenkind", "Magic Items", "25,000 sp", "Makes the wearer difficult to notice, especially while still or moving carefully; it does not make the wearer literally invisible."],
  ["Dragon Slayer", "Magic Items", "50,000 sp", "A +1 enchanted weapon that functions as +3 against dragons; dragons also suffer +2d6 damage on a hit."],
  ["Drums of Panic", "Magic Items", "12,500 sp", "Creatures that hear the drums beyond 10′ must make a Mental save or immediately test Morale at a -2 penalty. Allies designated by the drummer are unaffected."],
  ["Dwarven Thrower", "Magic Items", "50,000 sp", "A +2 enchanted throwing weapon with a 60′ range that immediately returns to its wielder after the attack."],
  ["Elven Chain", "Magic Items", "50,000 sp", "Enchanted +1 mail of exceptionally light and flexible construction. Treat as a +1 Mail Shirt for WWN rules."],
  ["Eyes of Charming", "Magic Items", "12,500 sp", "Crystal lenses usable once per day. One intelligent creature that can see the wearer must make a Mental save or regard the wearer as a trusted friend for the scene; obviously hostile acts end the effect."],
  ["Eyes of the Eagle", "Magic Items", "12,500 sp", "Enhances long-distance vision by roughly one hundredfold."],
  ["Frostbrand", "Magic Items", "50,000 sp", "An enchanted weapon that can shed light, inflicts +1d6 cold damage on a hit, grants the wielder resistance to ordinary fire, and can extinguish a nonmagical flame once per hour."],
  ["Gem of Brightness", "Magic Items", "25,000 sp", "Contains 50 charges. It can shed bright light to 30′ for free, expend 1 charge to force one target within 60′ to make an Evasion save or be blinded for the scene, or expend 5 charges to affect all creatures in a 30′ cone."],
  ["Gem of Seeing", "Magic Items", "25,000 sp", "Has 1d6 charges when found. One charge grants ten minutes of supernatural sight to 120′, revealing secret doors, traps, invisible creatures, and magical concealment that sight could detect."],
  ["Giant Slayer", "Magic Items", "50,000 sp", "A +1 enchanted weapon that functions as +3 against giants; giants also suffer +2d6 damage on a hit."],
  ["Gloves of Swimming and Climbing", "Magic Items", "12,500 sp", "The wearer can swim and climb at their normal movement rate when the surface or medium is physically traversable."],
  ["Helm of Comprehend Languages", "Magic Items", "12,500 sp", "Allows the wearer to read mundane or magical writing. Each time the wearer takes a damaging hit in combat, the helm has a 10% chance to break."],
  ["Helm of Telepathy", "Magic Items", "50,000 sp", "Allows the wearer to perceive surface thoughts of creatures within 90′ and communicate telepathically. A resisted attempt to implant a simple suggestion allows the target a Mental save."],
  ["Horn of Blasting", "Magic Items", "25,000 sp", "A blast affects a 30′ cone for 3d6 damage; an Evasion save halves the damage and avoids being deafened for one round. Glass and crystal objects take double damage at the GM's discretion."],
  ["Immovable Rod", "Magic Items", "12,500 sp", "Pressing its button fixes the rod magically in place, even in midair, until the button is pressed again."],
  ["Javelin of Lightning", "Magic Items", "50,000 sp", "A +2 enchanted javelin. When thrown it becomes a 120′ line of lightning; creatures in the line take 4d6 damage, with an Evasion save for half."],
  ["Luckstone", "Magic Items", "50,000 sp", "The bearer gains +1 on saving throws and skill checks. This bonus does not stack with another general-purpose magical bonus to the same roll."],
  ["Mace of Disruption", "Magic Items", "50,000 sp", "A +2 enchanted mace. Undead and unholy creatures suffer +2d6 damage on a hit; weak undead reduced to near destruction may be destroyed outright at the GM's discretion."],
  ["Necklace of Adaptation", "Magic Items", "50,000 sp", "The wearer need not breathe and can survive underwater, in noxious gas, or in other airless environments."],
  ["Periapt of Wound Closure", "Magic Items", "50,000 sp", "When the wearer would be reduced to 0 HP, they remain at 1 HP instead. The periapt then requires one hour before it can function again."],
  ["Potion of Animal Control", "Potions", "1,000 sp", "For the scene, the drinker can command up to 3d6 small animals, 2d8 average-sized animals, or 1d6 very large beasts that fail a Mental save."],
  ["Potion of Fire Resistance", "Potions", "1,000 sp", "For the scene, the drinker gains strong resistance to ordinary fire and a +2 bonus on saves against fire or dragon breath."],
  ["Potion of Flying", "Potions", "2,500 sp", "For the scene, the drinker can fly at their normal movement rate."],
  ["Potion of Gaseous Form", "Potions", "1,000 sp", "For the scene, the drinker's body becomes gaseous while worn equipment does not; they can drift through non-airtight gaps but cannot make physical attacks."],
  ["Potion of Haste", "Potions", "2,500 sp", "For the scene, the drinker moves with supernatural speed. Once per round they may take an additional Move action; this does not grant an additional spell cast or Main Action."],
  ["Potion of Healing", "Potions", "250 sp", "Restores 2d4+2 HP. Magical healing still applies System Strain normally under WWN rules."],
  ["Potion of Heroism", "Potions", "2,500 sp", "For the scene, the drinker gains +2 to hit and 2 temporary hit points per character level. Temporary hit points vanish when the effect ends."],
  ["Potion of Invisibility", "Potions", "2,500 sp", "For the scene, the drinker becomes invisible until they make an attack, cast a spell, or take another overtly hostile action."],
  ["Potion of Water Breathing", "Potions", "500 sp", "For the scene, the drinker can breathe underwater."],
  ["Ring of Water Walking", "Magic Items", "12,500 sp", "The wearer can walk or stand on the surface of water and similar liquids without sinking."],
  ["Rope of Entanglement", "Magic Items", "12,500 sp", "The rope can animate to bind one creature in reach. The target may make an Evasion save to avoid the initial binding and can attempt an opposed Str/Exert check to escape. The rope has 20 HP and is destroyed at 0 HP."],
] as const satisfies readonly (readonly [string, "Magic Items" | "Potions", string, string])[];

const tidalCatalog: StoreCatalogItem[] = tidalRaw.map(([name, category, defaultCost, details]) => ({
  id: `tidal:${slug(name)}`,
  name,
  kind: "magical",
  category,
  subcategory: category === "Potions" ? "Potion" : "",
  details,
  defaultCost,
  source: "tidal",
  sourceLabel: "Tidal Wave Games d100+ Magic Items",
  license: "Public Domain",
  priceBasis: "TWE suggested WWN value using WWN magic-item creation tiers",
}));

const categoryRank = new Map<string, number>(
  storeCatalogCategories.map((category, index) => [category, index]),
);

export const storeCatalog: readonly StoreCatalogItem[] = [
  ...officialWwnCatalog,
  ...wwnStoreOnlyCatalog,
  ...spellScrollCatalog,
  ...equipmentEmporiumCatalog,
  ...tidalCatalog,
].sort((a, b) => {
  const categoryDifference = (categoryRank.get(a.category) ?? 999) - (categoryRank.get(b.category) ?? 999);
  return categoryDifference || a.name.localeCompare(b.name);
});

export const storeCatalogById = new Map(storeCatalog.map(item => [item.id, item]));

if (storeCatalogById.size !== storeCatalog.length) {
  throw new Error("Store catalog contains duplicate item IDs.");
}

export const storeCatalogSourceCounts = {
  wwn: storeCatalog.filter(item => item.source === "wwn-srd").length,
  equipmentEmporium: storeCatalog.filter(item => item.source === "equipment-emporium").length,
  tidal: storeCatalog.filter(item => item.source === "tidal").length,
} as const;
