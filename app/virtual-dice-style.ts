export const DICE_STYLE_IDS = [
  "ivory-gold",
  "obsidian-gold",
  "moonlit-marble",
  "arcane-glass",
  "dragon-scale",
  "ember-forge",
  "winter-ice",
  "tidal-water",
  "carved-wood",
  "forged-steel",
  "antique-bronze",
  "starfall-glitter",
  "starfield",
  "speckled-stone",
  "skull-reliquary",
  "leopard-pattern",
  "tiger-stripe",
  "cheetah-spot",
  "lizard-scale",
  "feathered",
  "storm-clouds",
  "astral-nebula",
] as const;

export type DiceStyleId = typeof DICE_STYLE_IDS[number];

export const DEFAULT_DICE_STYLE: DiceStyleId = "ivory-gold";

export const DICE_STYLE_OPTIONS: ReadonlyArray<{ id: DiceStyleId; label: string }> = [
  { id: "ivory-gold", label: "Ivory & Gold" },
  { id: "obsidian-gold", label: "Obsidian & Gold" },
  { id: "moonlit-marble", label: "Moonlit Marble" },
  { id: "arcane-glass", label: "Arcane Glass" },
  { id: "dragon-scale", label: "Dragon Scale" },
  { id: "ember-forge", label: "Ember Forge" },
  { id: "winter-ice", label: "Winter Ice" },
  { id: "tidal-water", label: "Tidal Water" },
  { id: "carved-wood", label: "Carved Wood" },
  { id: "forged-steel", label: "Forged Steel" },
  { id: "antique-bronze", label: "Antique Bronze" },
  { id: "starfall-glitter", label: "Starfall Glitter" },
  { id: "starfield", label: "Starfield" },
  { id: "speckled-stone", label: "Speckled Stone" },
  { id: "skull-reliquary", label: "Skull Reliquary" },
  { id: "leopard-pattern", label: "Leopard Pattern" },
  { id: "tiger-stripe", label: "Tiger Stripe" },
  { id: "cheetah-spot", label: "Cheetah Spot" },
  { id: "lizard-scale", label: "Lizard Scale" },
  { id: "feathered", label: "Feathered" },
  { id: "storm-clouds", label: "Storm Clouds" },
  { id: "astral-nebula", label: "Astral Nebula" },
];

export const STANDARD_RPG_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;

export function isDiceStyleId(value: string): value is DiceStyleId {
  return DICE_STYLE_IDS.some(style => style === value);
}

type DiceStyleRendererConfig = {
  name: string;
  foreground: string;
  background: string;
  outline: string;
  texture: string;
  material: "none" | "metal" | "wood" | "glass" | "plastic";
};

// These renderer details intentionally live beside the virtual-dice adapter.
// Browser storage contains only the friendly, stable DiceStyleId above.
export const DICE_STYLE_RENDERER_CONFIG: Record<DiceStyleId, DiceStyleRendererConfig> = {
  "ivory-gold": {
    name: "twe-ivory-gold",
    foreground: "#3a2816",
    background: "#ead8ad",
    outline: "#9b7333",
    texture: "paper",
    material: "wood",
  },
  "obsidian-gold": {
    name: "twe-obsidian-gold",
    foreground: "#f4cb70",
    background: "#1e2028",
    outline: "#9b7333",
    texture: "metal",
    material: "metal",
  },
  "moonlit-marble": {
    name: "twe-moonlit-marble",
    foreground: "#1f3550",
    background: "#dce5ec",
    outline: "#6f8da8",
    texture: "marble",
    material: "glass",
  },
  "arcane-glass": {
    name: "twe-arcane-glass",
    foreground: "#f5df9b",
    background: "#4d356e",
    outline: "#9871ba",
    texture: "stainedglass",
    material: "glass",
  },
  "dragon-scale": {
    name: "twe-dragon-scale",
    foreground: "#f7df8a",
    background: "#314f42",
    outline: "#9f7c32",
    texture: "dragon",
    material: "none",
  },
  "ember-forge": {
    name: "twe-ember-forge",
    foreground: "#fff3c4",
    background: "#b52a16",
    outline: "#ff9e3d",
    texture: "fire",
    material: "metal",
  },
  "winter-ice": {
    name: "twe-winter-ice",
    foreground: "#13324b",
    background: "#bdeeff",
    outline: "#eefeff",
    texture: "ice",
    material: "glass",
  },
  "tidal-water": {
    name: "twe-tidal-water",
    foreground: "#eefcff",
    background: "#176f9c",
    outline: "#9ce7f2",
    texture: "water",
    material: "glass",
  },
  "carved-wood": {
    name: "twe-carved-wood",
    foreground: "#2f190c",
    background: "#b87c43",
    outline: "#5a3218",
    texture: "wood",
    material: "wood",
  },
  "forged-steel": {
    name: "twe-forged-steel",
    foreground: "#f2f6f8",
    background: "#58636d",
    outline: "#b5c2c9",
    texture: "metal",
    material: "metal",
  },
  "antique-bronze": {
    name: "twe-antique-bronze",
    foreground: "#fff0bc",
    background: "#8b5619",
    outline: "#d8a24e",
    texture: "bronze03",
    material: "metal",
  },
  "starfall-glitter": {
    name: "twe-starfall-glitter",
    foreground: "#fff4bd",
    background: "#4a286d",
    outline: "#c797ea",
    texture: "glitter",
    material: "none",
  },
  "starfield": {
    name: "twe-starfield",
    foreground: "#ffeeb8",
    background: "#14264c",
    outline: "#7998d0",
    texture: "stars",
    material: "none",
  },
  "speckled-stone": {
    name: "twe-speckled-stone",
    foreground: "#241b14",
    background: "#d6b38a",
    outline: "#816246",
    texture: "speckles",
    material: "none",
  },
  "skull-reliquary": {
    name: "twe-skull-reliquary",
    foreground: "#fff0cf",
    background: "#54252c",
    outline: "#aa7375",
    texture: "skulls",
    material: "none",
  },
  "leopard-pattern": {
    name: "twe-leopard-pattern",
    foreground: "#2b1a0c",
    background: "#d0a34b",
    outline: "#754213",
    texture: "leopard",
    material: "wood",
  },
  "tiger-stripe": {
    name: "twe-tiger-stripe",
    foreground: "#21130a",
    background: "#d87021",
    outline: "#873e10",
    texture: "tiger",
    material: "wood",
  },
  "cheetah-spot": {
    name: "twe-cheetah-spot",
    foreground: "#2a180d",
    background: "#ddbd6d",
    outline: "#8e6726",
    texture: "cheetah",
    material: "wood",
  },
  "lizard-scale": {
    name: "twe-lizard-scale",
    foreground: "#ecffd8",
    background: "#3e7650",
    outline: "#9bc978",
    texture: "lizard",
    material: "none",
  },
  "feathered": {
    name: "twe-feathered",
    foreground: "#26344a",
    background: "#b4c9dd",
    outline: "#e7f0f5",
    texture: "bird",
    material: "wood",
  },
  "storm-clouds": {
    name: "twe-storm-clouds",
    foreground: "#f0f7ff",
    background: "#556576",
    outline: "#a8bdcf",
    texture: "cloudy_2",
    material: "none",
  },
  "astral-nebula": {
    name: "twe-astral-nebula",
    foreground: "#fff4d0",
    background: "#7c4da5",
    outline: "#d1a6ec",
    texture: "astral",
    material: "none",
  },
};

export function rendererConfigForDiceStyle(style: DiceStyleId): DiceStyleRendererConfig {
  return DICE_STYLE_RENDERER_CONFIG[style];
}
