export const DICE_STYLE_IDS = [
  "ivory-gold",
  "obsidian-gold",
  "moonlit-marble",
  "arcane-glass",
  "dragon-scale",
] as const;

export type DiceStyleId = typeof DICE_STYLE_IDS[number];

export const DEFAULT_DICE_STYLE: DiceStyleId = "ivory-gold";

export const DICE_STYLE_OPTIONS: ReadonlyArray<{ id: DiceStyleId; label: string }> = [
  { id: "ivory-gold", label: "Ivory & Gold" },
  { id: "obsidian-gold", label: "Obsidian & Gold" },
  { id: "moonlit-marble", label: "Moonlit Marble" },
  { id: "arcane-glass", label: "Arcane Glass" },
  { id: "dragon-scale", label: "Dragon Scale" },
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
};

export function rendererConfigForDiceStyle(style: DiceStyleId): DiceStyleRendererConfig {
  return DICE_STYLE_RENDERER_CONFIG[style];
}
