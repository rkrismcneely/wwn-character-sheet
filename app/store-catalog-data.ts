import {
  armors,
  formatEquipmentCost,
  inventoryWeapons,
  purchasableEquipment,
} from "./equipment-data.ts";
import { highMagic } from "./wwn-data.ts";
import { equipmentEmporiumStoreSeedsA } from "./store-catalog-equipment-emporium-a.ts";
import { equipmentEmporiumStoreSeedsB } from "./store-catalog-equipment-emporium-b.ts";
import { tidalStoreSeeds } from "./store-catalog-tidal.ts";
import {
  storeCatalogCategories,
  type StoreCatalogCategory,
  type StoreCatalogItem,
  type StoreCatalogSeed,
} from "./store-catalog-types.ts";

export { storeCatalogCategories };
export type { StoreCatalogCategory, StoreCatalogItem } from "./store-catalog-types.ts";

const WWN_SOURCE_URL = "https://wwn.quadrifons.com/";

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function categoryForSrdEquipment(
  item: (typeof purchasableEquipment)[number],
): StoreCatalogCategory {
  if (item.kind === "weapon") return "Weapons & Ammunition";
  if (item.kind === "armor" || item.kind === "shield") return "Armor & Shields";
  if (item.kind === "bundle") return "Equipment Packs";
  if (["Arrows, 20", "Hurlant bolts, 20"].includes(item.name)) return "Weapons & Ammunition";
  if (["Boots", "Clothes, common", "Clothes, fine", "Clothes, noble"].includes(item.name)) return "Clothing & Personal";
  if (item.name === "Cart, one-horse") return "Vehicles & Transport";
  if (item.name === "Healer's pouch") return "Health & Personal Care";
  if (["Paper, 10 sheets", "Writing kit"].includes(item.name)) return "Tools & Kits";
  if (["Rations, one week", "Firewood, one night's fire"].includes(item.name)) return "Food & Drink";
  if (["Backpack", "Flask, metal, one pint", "Sack", "Waterskin, one gallon"].includes(item.name)) return "Containers & Storage";
  return "Adventuring Gear";
}

const baseSrdCatalog: StoreCatalogItem[] = purchasableEquipment.map(item => ({
  id: item.id,
  name: item.name,
  kind: item.kind,
  category: categoryForSrdEquipment(item),
  description: "",
  details: item.details,
  defaultCost: formatEquipmentCost(item.costCopper),
  source: "WWN SRD",
  license: "CC0 1.0",
  sourceUrl: WWN_SOURCE_URL,
  priceBasis: "WWN SRD listed price.",
}));

const additionalSrdRaw = String.raw`Animals & Tack|Horse, riding|200 sp
Animals & Tack|Horse, draft|150 sp
Animals & Tack|Horse, battle-trained|2000 sp
Animals & Tack|Mule|30 sp
Animals & Tack|Cow|10 sp
Animals & Tack|Ox, plow-trained|15 sp
Animals & Tack|Chicken|5 cp
Animals & Tack|Pig|3 sp
Animals & Tack|Dog, working|20 sp
Animals & Tack|Sheep or goat|5 sp
Services|River ferry, per passenger|5 cp
Services|Ship passage, per expected day|2 sp
Services|Carriage travel, per mile|2 cp
Vehicles & Transport|Rowboat|30 sp
Vehicles & Transport|Small fishing boat|200 sp
Vehicles & Transport|Merchant ship|5000 sp
Vehicles & Transport|War galleon|50000 sp
Services|Bard of Small Repute|2 sp/day
Services|Common Prostitute|2 sp/day
Services|Dragoman or Skilled Interpreter|10 sp/day
Services|Elite Courtesan|100 sp/day
Services|Farmer|1 sp/day
Services|Guard, ordinary|2 sp/day
Services|Guard, sergeant, for every ten guards|10 sp/day
Services|Lawyer or Pleader|10 sp/day
Services|Mage of Minor Abilities|200 sp/day
Services|Mundane Physician|10 sp/day
Services|Porter willing to go into the wilds|5 sp/day
Services|Porter only for relatively safe roads|1 sp/day
Services|Navigator|5 sp/day
Services|Sage, per question answered|200 sp
Services|Sailor|1 sp/day
Services|Scribe or Clerk|3 sp/day
Services|Skilled Artisan|5 sp/day
Services|Unskilled Laborer|1 sp/day
Services|Veteran Sellsword|10 sp/day
Services|Wilderness Guide|10 sp/day
Services|Impoverished lifestyle, per week|5 sp
Services|Common lifestyle, per week|20 sp
Services|Rich lifestyle, per week|200 sp
Services|Noble lifestyle, per week|1000 sp
Services|Magical healing of wounds|10 sp/hp
Services|Magical curing of a disease|500 sp
Services|Lifting a curse or undoing magic|1000 sp
Services|Casting a minor spell|250 sp
Services|Bribe to overlook a minor crime|10 sp
Services|Bribe to overlook a major crime|500 sp
Services|Bribe to overlook a capital crime|10000 sp
Services|Hire someone for a minor crime|50 sp
Services|Hire someone for a major crime|1000 sp
Services|Hire someone for an infamous crime|25000 sp`;

const additionalSrdCatalog: StoreCatalogItem[] = additionalSrdRaw
  .trim()
  .split("\n")
  .map(line => {
    const [category, name, defaultCost] = line.split("|");
    return {
      id: `srd:${slug(name)}`,
      name,
      kind: "mundane" as const,
      category: category as StoreCatalogCategory,
      description: "",
      details: `WWN SRD · ${category}`,
      defaultCost,
      source: "WWN SRD" as const,
      license: "CC0 1.0",
      sourceUrl: WWN_SOURCE_URL,
      priceBasis: "WWN SRD listed price.",
    };
  });

const scrollCatalog: StoreCatalogItem[] = highMagic.map(spell => ({
  id: `srd:scroll:${slug(spell.name)}`,
  name: `Scroll of ${spell.name}`,
  kind: "magical",
  category: "Scrolls",
  description: spell.text,
  details: `Level ${spell.level} High Magic spell · single use`,
  defaultCost: `${spell.level * 1_000} sp`,
  source: "WWN SRD",
  license: "CC0 1.0",
  sourceUrl: WWN_SOURCE_URL,
  priceBasis: "WWN SRD scroll creation expense: 1,000 sp per spell level.",
}));

const magicPremiumSp = [12_500, 50_000, 250_000] as const;

const enchantedWeaponCatalog: StoreCatalogItem[] = inventoryWeapons.flatMap(weapon => {
  const base = purchasableEquipment.find(item => item.id === `weapon:${weapon.name}`);
  return magicPremiumSp.map((premium, index): StoreCatalogItem => {
    const bonus = index + 1;
    return {
      id: `srd:magic-weapon:${bonus}:${weapon.name}`,
      name: `${weapon.name} +${bonus}`,
      kind: "weapon",
      category: "Magic Weapons & Armor",
      description: "",
      details: `Magical +${bonus} weapon · +${bonus} to hit, damage, and Shock · ${base?.details ?? ""}`,
      defaultCost: formatEquipmentCost((base?.costCopper ?? 0) + premium * 10),
      source: "WWN SRD",
      license: "CC0 1.0",
      sourceUrl: WWN_SOURCE_URL,
      priceBasis: `Mundane WWN price plus the ${premium.toLocaleString("en-US")} sp permanent-magic tier.`,
    };
  });
});

const enchantedArmorCatalog: StoreCatalogItem[] = armors
  .filter(armor => armor.name !== "No Armor")
  .flatMap(armor => magicPremiumSp.map((premium, index): StoreCatalogItem => ({
    id: `srd:magic-armor:${index + 1}:${armor.name}`,
    name: `${armor.name} +${index + 1}`,
    kind: "armor",
    category: "Magic Weapons & Armor",
    description: "",
    details: `Magical +${index + 1} armor · AC ${armor.ac + index + 1} · Enc ${armor.enc}`,
    defaultCost: formatEquipmentCost(armor.costCopper + premium * 10),
    source: "WWN SRD",
    license: "CC0 1.0",
    sourceUrl: WWN_SOURCE_URL,
    priceBasis: `Mundane WWN price plus the ${premium.toLocaleString("en-US")} sp permanent-magic tier.`,
  })));

function externalCatalog(prefix: string, seeds: readonly StoreCatalogSeed[]): StoreCatalogItem[] {
  return seeds.map(item => ({
    ...item,
    id: `${prefix}:${slug(item.name)}`,
  }));
}

const equipmentEmporiumCatalog = externalCatalog("ee", [
  ...equipmentEmporiumStoreSeedsA,
  ...equipmentEmporiumStoreSeedsB,
]);
const tidalCatalog = externalCatalog("tidal", tidalStoreSeeds);

const categoryIndex = new Map<StoreCatalogCategory, number>(
  storeCatalogCategories.map((category, index) => [category, index]),
);

/**
 * This catalog is intentionally broader than the character Equipment page.
 * The category metadata is ready for the planned Category → Item store UI,
 * but that UI is not changed in this import.
 */
const assembledCatalog = [
  ...baseSrdCatalog,
  ...additionalSrdCatalog,
  ...scrollCatalog,
  ...enchantedWeaponCatalog,
  ...enchantedArmorCatalog,
  ...equipmentEmporiumCatalog,
  ...tidalCatalog,
];

const uniqueByName = new Map<string, StoreCatalogItem>();
for (const item of assembledCatalog) {
  const key = item.name.trim().toLocaleLowerCase("en-US");
  if (!uniqueByName.has(key)) uniqueByName.set(key, item);
}

export const storeCatalog: readonly StoreCatalogItem[] = [...uniqueByName.values()]
  .sort((left, right) => {
    const categoryDifference =
      (categoryIndex.get(left.category) ?? 999) - (categoryIndex.get(right.category) ?? 999);
    return categoryDifference || left.name.localeCompare(right.name);
  });

export const storeCatalogById = new Map(storeCatalog.map(item => [item.id, item]));
