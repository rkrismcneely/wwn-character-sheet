export const storeCatalogCategories = [
  "Weapons & Ammunition",
  "Armor & Shields",
  "Adventuring Gear",
  "Tools & Kits",
  "Health & Personal Care",
  "Clothing & Personal",
  "Food & Drink",
  "Containers & Storage",
  "Animals & Tack",
  "Vehicles & Transport",
  "Services",
  "Equipment Packs",
  "Games & Entertainment",
  "Jewelry & Valuables",
  "Trade Goods & Valuables",
  "Siege Equipment",
  "Magic Items",
  "Magic Weapons & Armor",
  "Potions",
  "Scrolls",
] as const;

export type StoreCatalogCategory = typeof storeCatalogCategories[number];

export type StoreCatalogItemKind =
  | "weapon"
  | "armor"
  | "shield"
  | "gear"
  | "bundle"
  | "mundane"
  | "magical";

export type StoreCatalogSource =
  | "WWN SRD"
  | "Equipment Emporium r33"
  | "d100+ Magic Items";

export interface StoreCatalogSeed {
  name: string;
  kind: StoreCatalogItemKind;
  category: StoreCatalogCategory;
  description: string;
  details: string;
  defaultCost: string;
  source: StoreCatalogSource;
  license: string;
  sourceUrl: string;
  priceBasis: string;
}

export interface StoreCatalogItem extends StoreCatalogSeed {
  id: string;
}
