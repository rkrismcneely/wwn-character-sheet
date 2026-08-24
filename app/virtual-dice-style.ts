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

type DiceStyleMaterial = "none" | "metal" | "wood" | "glass" | "plastic";
type DiceStyleTextureComposite = "multiply" | "screen";

export type DiceStyleRendererConfig = {
  name: string;
  foreground: string;
  background: string;
  outline: string;
  texture: string;
  material: DiceStyleMaterial;
};

export type DiceStyleTextureDefinition = {
  name: string;
  composite: DiceStyleTextureComposite;
  source: string;
  source_bump: string;
  material: DiceStyleMaterial;
};

// These renderer details intentionally live beside the virtual-dice adapter.
// Browser storage contains only the friendly, stable DiceStyleId above.
export const DICE_STYLE_RENDERER_CONFIG: Record<DiceStyleId, DiceStyleRendererConfig> = {
  "ivory-gold": {
    name: "twe-ivory-gold",
    foreground: "#3a2816",
    background: "#ead8ad",
    outline: "#9b7333",
    texture: "twe-texture-ivory-gold",
    material: "wood",
  },
  "obsidian-gold": {
    name: "twe-obsidian-gold",
    foreground: "#f4cb70",
    background: "#1e2028",
    outline: "#9b7333",
    texture: "twe-texture-obsidian-gold",
    material: "metal",
  },
  "moonlit-marble": {
    name: "twe-moonlit-marble",
    foreground: "#1f3550",
    background: "#dce5ec",
    outline: "#6f8da8",
    texture: "twe-texture-moonlit-marble",
    material: "glass",
  },
  "arcane-glass": {
    name: "twe-arcane-glass",
    foreground: "#f5df9b",
    background: "#4d356e",
    outline: "#9871ba",
    texture: "twe-texture-arcane-glass",
    material: "glass",
  },
  "dragon-scale": {
    name: "twe-dragon-scale",
    foreground: "#f7df8a",
    background: "#314f42",
    outline: "#9f7c32",
    texture: "twe-texture-dragon-scale",
    material: "none",
  },
  "ember-forge": {
    name: "twe-ember-forge",
    foreground: "#fff3c4",
    background: "#b52a16",
    outline: "#ff9e3d",
    texture: "twe-texture-ember-forge",
    material: "metal",
  },
  "winter-ice": {
    name: "twe-winter-ice",
    foreground: "#13324b",
    background: "#bdeeff",
    outline: "#eefeff",
    texture: "twe-texture-winter-ice",
    material: "glass",
  },
  "tidal-water": {
    name: "twe-tidal-water",
    foreground: "#eefcff",
    background: "#176f9c",
    outline: "#9ce7f2",
    texture: "twe-texture-tidal-water",
    material: "glass",
  },
  "carved-wood": {
    name: "twe-carved-wood",
    foreground: "#2f190c",
    background: "#d39b56",
    outline: "#5a3218",
    texture: "twe-texture-carved-wood",
    material: "wood",
  },
  "forged-steel": {
    name: "twe-forged-steel",
    foreground: "#f2f6f8",
    background: "#6e8290",
    outline: "#b5c2c9",
    texture: "twe-texture-forged-steel",
    material: "metal",
  },
  "antique-bronze": {
    name: "twe-antique-bronze",
    foreground: "#fff0bc",
    background: "#b46d26",
    outline: "#d8a24e",
    texture: "twe-texture-antique-bronze",
    material: "metal",
  },
  "starfall-glitter": {
    name: "twe-starfall-glitter",
    foreground: "#fff4bd",
    background: "#4a286d",
    outline: "#c797ea",
    texture: "twe-texture-starfall-glitter",
    material: "none",
  },
  "starfield": {
    name: "twe-starfield",
    foreground: "#ffeeb8",
    background: "#284e9b",
    outline: "#7998d0",
    texture: "twe-texture-starfield",
    material: "none",
  },
  "speckled-stone": {
    name: "twe-speckled-stone",
    foreground: "#241b14",
    background: "#d6b38a",
    outline: "#816246",
    texture: "twe-texture-speckled-stone",
    material: "none",
  },
  "skull-reliquary": {
    name: "twe-skull-reliquary",
    foreground: "#fff0cf",
    background: "#742e3d",
    outline: "#aa7375",
    texture: "twe-texture-skull-reliquary",
    material: "none",
  },
  "leopard-pattern": {
    name: "twe-leopard-pattern",
    foreground: "#2b1a0c",
    background: "#e4b44f",
    outline: "#754213",
    texture: "twe-texture-leopard-pattern",
    material: "wood",
  },
  "tiger-stripe": {
    name: "twe-tiger-stripe",
    foreground: "#21130a",
    background: "#ec7a1b",
    outline: "#873e10",
    texture: "twe-texture-tiger-stripe",
    material: "wood",
  },
  "cheetah-spot": {
    name: "twe-cheetah-spot",
    foreground: "#2a180d",
    background: "#efcb72",
    outline: "#8e6726",
    texture: "twe-texture-cheetah-spot",
    material: "wood",
  },
  "lizard-scale": {
    name: "twe-lizard-scale",
    foreground: "#ecffd8",
    background: "#3e7650",
    outline: "#9bc978",
    texture: "twe-texture-lizard-scale",
    material: "none",
  },
  "feathered": {
    name: "twe-feathered",
    foreground: "#26344a",
    background: "#b4c9dd",
    outline: "#e7f0f5",
    texture: "twe-texture-feathered",
    material: "wood",
  },
  "storm-clouds": {
    name: "twe-storm-clouds",
    foreground: "#f0f7ff",
    background: "#668fb3",
    outline: "#a8bdcf",
    texture: "twe-texture-storm-clouds",
    material: "none",
  },
  "astral-nebula": {
    name: "twe-astral-nebula",
    foreground: "#fff4d0",
    background: "#7c4da5",
    outline: "#d1a6ec",
    texture: "twe-texture-astral-nebula",
    material: "none",
  },
};

// The renderer caches custom colours by name and material canvases by texture name.
// Keep both identities stable and style-scoped so changing a style in one DiceBox
// cannot reuse a previous style's loaded texture or material.
export const DICE_STYLE_TEXTURE_DEFINITIONS: Record<DiceStyleId, DiceStyleTextureDefinition> = {
  "ivory-gold": { name: "twe-texture-ivory-gold", composite: "multiply", source: "textures/paper.webp", source_bump: "textures/paper-bump.webp", material: "wood" },
  "obsidian-gold": { name: "twe-texture-obsidian-gold", composite: "screen", source: "textures/metal.webp", source_bump: "textures/metal-bump.webp", material: "metal" },
  "moonlit-marble": { name: "twe-texture-moonlit-marble", composite: "multiply", source: "textures/marble.webp", source_bump: "", material: "glass" },
  "arcane-glass": { name: "twe-texture-arcane-glass", composite: "screen", source: "textures/stainedglass.webp", source_bump: "textures/stainedglass-bump.webp", material: "glass" },
  "dragon-scale": { name: "twe-texture-dragon-scale", composite: "screen", source: "textures/dragon.webp", source_bump: "textures/dragon-bump.webp", material: "none" },
  "ember-forge": { name: "twe-texture-ember-forge", composite: "screen", source: "textures/fire.webp", source_bump: "textures/fire.webp", material: "metal" },
  "winter-ice": { name: "twe-texture-winter-ice", composite: "screen", source: "textures/ice.webp", source_bump: "textures/ice.webp", material: "glass" },
  "tidal-water": { name: "twe-texture-tidal-water", composite: "screen", source: "textures/water.webp", source_bump: "textures/water.webp", material: "glass" },
  "carved-wood": { name: "twe-texture-carved-wood", composite: "multiply", source: "textures/wood.webp", source_bump: "textures/wood.webp", material: "wood" },
  "forged-steel": { name: "twe-texture-forged-steel", composite: "screen", source: "textures/metal.webp", source_bump: "textures/metal-bump.webp", material: "metal" },
  "antique-bronze": { name: "twe-texture-antique-bronze", composite: "screen", source: "textures/bronze03.webp", source_bump: "", material: "metal" },
  "starfall-glitter": { name: "twe-texture-starfall-glitter", composite: "screen", source: "textures/glitter.webp", source_bump: "textures/glitter-bump.webp", material: "none" },
  "starfield": { name: "twe-texture-starfield", composite: "screen", source: "textures/stars.webp", source_bump: "textures/stars.webp", material: "none" },
  "speckled-stone": { name: "twe-texture-speckled-stone", composite: "screen", source: "textures/speckles.webp", source_bump: "textures/speckles.webp", material: "none" },
  "skull-reliquary": { name: "twe-texture-skull-reliquary", composite: "screen", source: "textures/skulls.webp", source_bump: "textures/skulls.webp", material: "none" },
  "leopard-pattern": { name: "twe-texture-leopard-pattern", composite: "multiply", source: "textures/leopard.webp", source_bump: "textures/leopard.webp", material: "wood" },
  "tiger-stripe": { name: "twe-texture-tiger-stripe", composite: "multiply", source: "textures/tiger.webp", source_bump: "textures/tiger.webp", material: "wood" },
  "cheetah-spot": { name: "twe-texture-cheetah-spot", composite: "multiply", source: "textures/cheetah.webp", source_bump: "textures/cheetah.webp", material: "wood" },
  "lizard-scale": { name: "twe-texture-lizard-scale", composite: "screen", source: "textures/lizard.webp", source_bump: "textures/lizard.webp", material: "none" },
  "feathered": { name: "twe-texture-feathered", composite: "screen", source: "textures/feather.webp", source_bump: "textures/feather-bump.webp", material: "wood" },
  "storm-clouds": { name: "twe-texture-storm-clouds", composite: "screen", source: "textures/cloudy.alt.webp", source_bump: "textures/cloudy.alt.webp", material: "none" },
  "astral-nebula": { name: "twe-texture-astral-nebula", composite: "screen", source: "textures/astral.webp", source_bump: "textures/stars.webp", material: "none" },
};

export function rendererConfigForDiceStyle(style: DiceStyleId): DiceStyleRendererConfig {
  return DICE_STYLE_RENDERER_CONFIG[style];
}

export function rendererTextureForDiceStyle(style: DiceStyleId): DiceStyleTextureDefinition {
  return DICE_STYLE_TEXTURE_DEFINITIONS[style];
}

export function rendererTextureForKey(key: string): DiceStyleTextureDefinition | undefined {
  return Object.values(DICE_STYLE_TEXTURE_DEFINITIONS).find(texture => texture.name === key);
}
