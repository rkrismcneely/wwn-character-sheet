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
    outline: "#fffaf0",
    texture: "twe-texture-ivory-gold",
    material: "none",
  },
  "obsidian-gold": {
    name: "twe-obsidian-gold",
    foreground: "#f4cb70",
    background: "#1e2028",
    outline: "#050608",
    texture: "twe-texture-obsidian-gold",
    material: "none",
  },
  "moonlit-marble": {
    name: "twe-moonlit-marble",
    foreground: "#1f3550",
    background: "#dce5ec",
    outline: "#ffffff",
    texture: "twe-texture-moonlit-marble",
    material: "none",
  },
  "arcane-glass": {
    name: "twe-arcane-glass",
    foreground: "#fff0c9",
    background: "#49206e",
    outline: "#160520",
    texture: "twe-texture-arcane-glass",
    material: "none",
  },
  "dragon-scale": {
    name: "twe-dragon-scale",
    foreground: "#fff1a8",
    background: "#285a3b",
    outline: "#11251d",
    texture: "twe-texture-dragon-scale",
    material: "none",
  },
  "ember-forge": {
    name: "twe-ember-forge",
    foreground: "#fff7d6",
    background: "#8f1f12",
    outline: "#2b0704",
    texture: "twe-texture-ember-forge",
    material: "none",
  },
  "winter-ice": {
    name: "twe-winter-ice",
    foreground: "#13324b",
    background: "#bdeeff",
    outline: "#ffffff",
    texture: "twe-texture-winter-ice",
    material: "none",
  },
  "tidal-water": {
    name: "twe-tidal-water",
    foreground: "#f3feff",
    background: "#00558f",
    outline: "#041923",
    texture: "twe-texture-tidal-water",
    material: "none",
  },
  "carved-wood": {
    name: "twe-carved-wood",
    foreground: "#fff4d6",
    background: "#65300e",
    outline: "#201005",
    texture: "twe-texture-carved-wood",
    material: "wood",
  },
  "forged-steel": {
    name: "twe-forged-steel",
    foreground: "#f4fbff",
    background: "#465460",
    outline: "#081016",
    texture: "twe-texture-forged-steel",
    material: "none",
  },
  "antique-bronze": {
    name: "twe-antique-bronze",
    foreground: "#fff3cc",
    background: "#803a00",
    outline: "#200802",
    texture: "twe-texture-antique-bronze",
    material: "none",
  },
  "starfall-glitter": {
    name: "twe-starfall-glitter",
    foreground: "#fff0a8",
    background: "#1b2169",
    outline: "#10071d",
    texture: "twe-texture-starfall-glitter",
    material: "none",
  },
  "starfield": {
    name: "twe-starfield",
    foreground: "#fff4c7",
    background: "#050a3a",
    outline: "#030817",
    texture: "twe-texture-starfield",
    material: "none",
  },
  "speckled-stone": {
    name: "twe-speckled-stone",
    foreground: "#182128",
    background: "#c2c1bb",
    outline: "#ffffff",
    texture: "twe-texture-speckled-stone",
    material: "none",
  },
  "skull-reliquary": {
    name: "twe-skull-reliquary",
    foreground: "#4b0f18",
    background: "#d4c09a",
    outline: "#fffaf0",
    texture: "twe-texture-skull-reliquary",
    material: "none",
  },
  "leopard-pattern": {
    name: "twe-leopard-pattern",
    foreground: "#2b1a0c",
    background: "#e4b44f",
    outline: "#fff0c4",
    texture: "twe-texture-leopard-pattern",
    material: "wood",
  },
  "tiger-stripe": {
    name: "twe-tiger-stripe",
    foreground: "#fff8de",
    background: "#963400",
    outline: "#211005",
    texture: "twe-texture-tiger-stripe",
    material: "wood",
  },
  "cheetah-spot": {
    name: "twe-cheetah-spot",
    foreground: "#2a180d",
    background: "#efcb72",
    outline: "#fff9e8",
    texture: "twe-texture-cheetah-spot",
    material: "wood",
  },
  "lizard-scale": {
    name: "twe-lizard-scale",
    foreground: "#f1ffe4",
    background: "#315608",
    outline: "#102319",
    texture: "twe-texture-lizard-scale",
    material: "none",
  },
  "feathered": {
    name: "twe-feathered",
    foreground: "#26344a",
    background: "#b4c9dd",
    outline: "#e7f0f5",
    texture: "twe-texture-feathered",
    material: "none",
  },
  "storm-clouds": {
    name: "twe-storm-clouds",
    foreground: "#f7fbff",
    background: "#3f4750",
    outline: "#080a0d",
    texture: "twe-texture-storm-clouds",
    material: "none",
  },
  "astral-nebula": {
    name: "twe-astral-nebula",
    foreground: "#fff6dc",
    background: "#7f1457",
    outline: "#16081f",
    texture: "twe-texture-astral-nebula",
    material: "none",
  },
};

// The renderer caches custom colours by name and material canvases by texture name.
// Keep both identities stable and style-scoped so changing a style in one DiceBox
// cannot reuse a previous style's loaded texture or material.
export const DICE_STYLE_TEXTURE_DEFINITIONS: Record<DiceStyleId, DiceStyleTextureDefinition> = {
  "ivory-gold": { name: "twe-texture-ivory-gold", composite: "screen", source: "textures/paper.webp", source_bump: "textures/paper-bump.webp", material: "none" },
  "obsidian-gold": { name: "twe-texture-obsidian-gold", composite: "multiply", source: "textures/metal.webp", source_bump: "textures/metal-bump.webp", material: "none" },
  "moonlit-marble": { name: "twe-texture-moonlit-marble", composite: "screen", source: "textures/marble.webp", source_bump: "", material: "none" },
  "arcane-glass": { name: "twe-texture-arcane-glass", composite: "multiply", source: "textures/stainedglass.webp", source_bump: "textures/stainedglass-bump.webp", material: "none" },
  "dragon-scale": { name: "twe-texture-dragon-scale", composite: "multiply", source: "textures/dragon.webp", source_bump: "textures/dragon-bump.webp", material: "none" },
  "ember-forge": { name: "twe-texture-ember-forge", composite: "multiply", source: "textures/fire.webp", source_bump: "textures/fire.webp", material: "none" },
  "winter-ice": { name: "twe-texture-winter-ice", composite: "multiply", source: "textures/ice.webp", source_bump: "textures/ice.webp", material: "none" },
  "tidal-water": { name: "twe-texture-tidal-water", composite: "multiply", source: "textures/water.webp", source_bump: "textures/water.webp", material: "none" },
  "carved-wood": { name: "twe-texture-carved-wood", composite: "multiply", source: "textures/wood.webp", source_bump: "textures/wood.webp", material: "wood" },
  "forged-steel": { name: "twe-texture-forged-steel", composite: "multiply", source: "textures/metal.webp", source_bump: "textures/metal-bump.webp", material: "none" },
  "antique-bronze": { name: "twe-texture-antique-bronze", composite: "multiply", source: "textures/bronze03.webp", source_bump: "", material: "none" },
  "starfall-glitter": { name: "twe-texture-starfall-glitter", composite: "multiply", source: "textures/stars.webp", source_bump: "textures/stars.webp", material: "none" },
  "starfield": { name: "twe-texture-starfield", composite: "screen", source: "textures/glitter.webp", source_bump: "textures/glitter-bump.webp", material: "none" },
  "speckled-stone": { name: "twe-texture-speckled-stone", composite: "multiply", source: "textures/speckles.webp", source_bump: "textures/speckles.webp", material: "none" },
  "skull-reliquary": { name: "twe-texture-skull-reliquary", composite: "screen", source: "textures/skulls.webp", source_bump: "textures/skulls.webp", material: "none" },
  "leopard-pattern": { name: "twe-texture-leopard-pattern", composite: "multiply", source: "textures/leopard.webp", source_bump: "textures/leopard.webp", material: "wood" },
  "tiger-stripe": { name: "twe-texture-tiger-stripe", composite: "multiply", source: "textures/tiger.webp", source_bump: "textures/tiger.webp", material: "wood" },
  "cheetah-spot": { name: "twe-texture-cheetah-spot", composite: "multiply", source: "textures/cheetah.webp", source_bump: "textures/cheetah.webp", material: "wood" },
  "lizard-scale": { name: "twe-texture-lizard-scale", composite: "multiply", source: "textures/lizard.webp", source_bump: "textures/lizard.webp", material: "none" },
  "feathered": { name: "twe-texture-feathered", composite: "screen", source: "textures/feather.webp", source_bump: "textures/feather-bump.webp", material: "none" },
  "storm-clouds": { name: "twe-texture-storm-clouds", composite: "multiply", source: "textures/cloudy.alt.webp", source_bump: "textures/cloudy.alt.webp", material: "none" },
  "astral-nebula": { name: "twe-texture-astral-nebula", composite: "multiply", source: "textures/astral.webp", source_bump: "textures/stars.webp", material: "none" },
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
