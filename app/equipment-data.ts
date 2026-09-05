import { weapons } from "./wwn-data.ts";

export type EquipmentKind = "weapon" | "armor" | "shield" | "gear" | "bundle";

export type PurchasableEquipment = {
  id: string;
  name: string;
  kind: EquipmentKind;
  costCopper: number;
  details: string;
};

export const armors = [
  { name: "No Armor", ac: 10, enc: 0, costCopper: 0 },
  { name: "War Shirt", ac: 11, enc: 0, costCopper: 50 },
  { name: "Buff Coat", ac: 12, enc: 0, costCopper: 500 },
  { name: "Linothorax", ac: 13, enc: 1, costCopper: 200 },
  { name: "War Robe", ac: 14, enc: 3, costCopper: 500 },
  { name: "Pieced Armor", ac: 14, enc: 2, costCopper: 1_000 },
  { name: "Mail Shirt", ac: 14, enc: 1, costCopper: 2_500 },
  { name: "Cuirass and Greaves", ac: 15, enc: 2, costCopper: 2_500 },
  { name: "Scaled Armor", ac: 16, enc: 3, costCopper: 5_000 },
  { name: "Mail Hauberk", ac: 16, enc: 2, costCopper: 7_500 },
  { name: "Plate Armor", ac: 17, enc: 2, costCopper: 10_000 },
  { name: "Great Armor", ac: 19, enc: 3, costCopper: 20_000 },
  { name: "Grand Plate", ac: 16, enc: 3, costCopper: 20_000 },
] as const;

export const shields = [
  { name: "", costCopper: 0 },
  { name: "Small Shield", costCopper: 200 },
  { name: "Large Shield", costCopper: 100 },
] as const;

export const adventuringGear = [
  { name: "Arrows, 20", costCopper: 20 },
  { name: "Backpack", costCopper: 20 },
  { name: "Boots", costCopper: 20 },
  { name: "Candle", costCopper: 1 },
  { name: "Cart, one-horse", costCopper: 500 },
  { name: "Clothes, common", costCopper: 250 },
  { name: "Clothes, fine", costCopper: 1_000 },
  { name: "Clothes, noble", costCopper: 5_000 },
  { name: "Cooking utensils", costCopper: 40 },
  { name: "Crowbar", costCopper: 40 },
  { name: "Firewood, one night's fire", costCopper: 2 },
  { name: "Flask, metal, one pint", costCopper: 30 },
  { name: "Grappling hook", costCopper: 50 },
  { name: "Hammer or small tool", costCopper: 20 },
  { name: "Healer's pouch", costCopper: 50 },
  { name: "Hurlant bolts, 20", costCopper: 200 },
  { name: "Iron spikes, 10", costCopper: 10 },
  { name: "Lantern", costCopper: 100 },
  { name: "Mirror, hand", costCopper: 100 },
  { name: "Oil, one pint", costCopper: 10 },
  { name: "Paper, 10 sheets", costCopper: 10 },
  { name: "Rations, one week", costCopper: 50 },
  { name: "Rope, 50'", costCopper: 20 },
  { name: "Sack", costCopper: 10 },
  { name: "Shovel, pick, or similar tool", costCopper: 40 },
  { name: "Tinder box", costCopper: 10 },
  { name: "Torch", costCopper: 2 },
  { name: "Waterskin, one gallon", costCopper: 10 },
  { name: "Writing kit", costCopper: 30 },
] as const;

export const gearBundles = [
  { name: "Artisan’s Equipment", costCopper: 500 },
  { name: "Criminal Tools", costCopper: 1_000 },
  { name: "Dungeoneering Kit", costCopper: 2_000 },
  { name: "Noble Courtier Outfit", costCopper: 10_000 },
  { name: "Performer’s Implements", costCopper: 1_000 },
  { name: "Wilderness Travel Gear", costCopper: 1_000 },
] as const;

const costCopper = (cost: string) => {
  if (cost === "-") return 0;
  const match = cost.match(/^([\d,]+)\s+(sp|cp)$/);
  if (!match) throw new Error(`Unsupported equipment cost: ${cost}`);
  const amount = Number(match[1].replaceAll(",", ""));
  return match[2] === "sp" ? amount * 10 : amount;
};

export const inventoryWeapons = weapons.filter(
  (weapon) =>
    !["Unarmed Attack", "Shield Bash, Large", "Shield Bash, Small"].includes(
      weapon.name,
    ),
);
export const inventoryArmors = armors
  .filter((armor) => armor.name !== "No Armor")
  .map((armor) => armor.name);

export const purchasableEquipment: readonly PurchasableEquipment[] = [
  ...inventoryWeapons.map((weapon) => ({
    id: `weapon:${weapon.name}`,
    name: weapon.name,
    kind: "weapon" as const,
    costCopper: costCopper(weapon.cost),
    details: `${weapon.damage} damage · Shock ${weapon.shock} · ${weapon.attribute} · Range ${weapon.range} · Enc ${weapon.enc}${weapon.traits ? ` · ${weapon.traits}` : ""}`,
  })),
  ...armors
    .filter((armor) => armor.name !== "No Armor")
    .map((armor) => ({
      id: `armor:${armor.name}`,
      name: armor.name,
      kind: "armor" as const,
      costCopper: armor.costCopper,
      details: `AC ${armor.ac} · Enc ${armor.enc}`,
    })),
  ...shields
    .filter((shield) => shield.name)
    .map((shield) => ({
      id: `shield:${shield.name}`,
      name: shield.name,
      kind: "shield" as const,
      costCopper: shield.costCopper,
      details: `${shield.name === "Large Shield" ? "AC 14" : "AC 13"} base · adds +1 AC when it improves your worn armor`,
    })),
  ...adventuringGear.map((item) => ({
    id: `gear:${item.name}`,
    name: item.name,
    kind: "gear" as const,
    costCopper: item.costCopper,
    details: "Adventuring gear",
  })),
  ...gearBundles.map((item) => ({
    id: `bundle:${item.name}`,
    name: item.name,
    kind: "bundle" as const,
    costCopper: item.costCopper,
    details: "A bundled set of adventuring gear",
  })),
];

export const purchasableEquipmentById = new Map(
  purchasableEquipment.map((item) => [item.id, item]),
);

export function equipmentDetailsForName(name: string) {
  const item = purchasableEquipment.find((candidate) => candidate.name === name);
  if (item) return item.details;
  if (name === "Mule and small cart") return "Pack animal and cart";
  return "Starting gear";
}

export const formatEquipmentCost = (costInCopper: number) => {
  if (costInCopper === 0) return "Free";
  const silver = Math.floor(costInCopper / 10);
  const copper = costInCopper % 10;
  if (!silver) return `${copper} cp`;
  return copper ? `${silver} sp ${copper} cp` : `${silver} sp`;
};

export type StartingEquipmentPackage = {
  id: string;
  name: string;
  armor: string;
  shield: string;
  weapons: readonly string[];
  stowed: readonly string[];
  silver: number;
};

/** The six premade packages in the WWN Free Edition starting-equipment table. */
export const startingEquipmentPackages: readonly StartingEquipmentPackage[] = [
  {
    id: "adventuring-peasant",
    name: "Adventuring Peasant",
    armor: "War Shirt",
    shield: "Large Shield",
    weapons: ["Spear, Light", "Dagger"],
    stowed: [
      "Backpack",
      "Rations, one week",
      "Mule and small cart",
      "Tinder box",
      "Torch",
      "Torch",
      "Torch",
    ],
    silver: 0,
  },
  {
    id: "ranger-or-archer",
    name: "Ranger or Archer",
    armor: "Buff Coat",
    shield: "",
    weapons: ["Bow, Large", "Dagger", "Axe, Hand"],
    stowed: [
      "Arrows, 20",
      "Backpack",
      "Cooking utensils",
      "Rations, one week",
      "Waterskin, one gallon",
      "Tinder box",
      "Torch",
      "Torch",
      "Torch",
    ],
    silver: 20,
  },
  {
    id: "armored-warrior",
    name: "Armored Warrior",
    armor: "Pieced Armor",
    shield: "Large Shield",
    weapons: ["Sword, Short", "Dagger"],
    stowed: ["Backpack", "Tinder box", "Torch", "Torch", "Torch"],
    silver: 0,
  },
  {
    id: "roguish-wanderer",
    name: "Roguish Wanderer",
    armor: "Buff Coat",
    shield: "Small Shield",
    weapons: [
      "Sword, Short",
      "Throwing Blade",
      "Throwing Blade",
      "Throwing Blade",
      "Throwing Blade",
      "Throwing Blade",
    ],
    stowed: [
      "Backpack",
      "Rations, one week",
      "Waterskin, one gallon",
      "Tinder box",
      "Torch",
      "Torch",
      "Torch",
      "Grappling hook",
      "Rope, 50'",
    ],
    silver: 0,
  },
  {
    id: "gentry-wayfarer",
    name: "Gentry Wayfarer",
    armor: "Buff Coat",
    shield: "Small Shield",
    weapons: ["Sword, Short"],
    stowed: [
      "Backpack",
      "Rations, one week",
      "Waterskin, one gallon",
      "Clothes, fine",
      "Writing kit",
      "Paper, 10 sheets",
      "Paper, 10 sheets",
    ],
    silver: 20,
  },
  {
    id: "mage-healer-or-scholar",
    name: "Mage, Healer, or Scholar",
    armor: "",
    shield: "",
    weapons: ["Dagger", "Dagger", "Staff"],
    stowed: [
      "Backpack",
      "Lantern",
      "Tinder box",
      "Oil, one pint",
      "Oil, one pint",
      "Writing kit",
      "Paper, 10 sheets",
      "Paper, 10 sheets",
      "Rations, one week",
      "Waterskin, one gallon",
      "Healer's pouch",
    ],
    silver: 80,
  },
] as const;

export const startingEquipmentPackageById = new Map(
  startingEquipmentPackages.map((item) => [item.id, item]),
);

export const officialInventoryItems = [
  ...inventoryWeapons.map((weapon) => weapon.name),
  ...inventoryArmors,
  ...shields.map((shield) => shield.name).filter(Boolean),
  ...adventuringGear.map((item) => item.name),
  ...gearBundles.map((item) => item.name),
];
