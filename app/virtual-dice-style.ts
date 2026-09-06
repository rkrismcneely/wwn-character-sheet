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
    foreground: "#2d1c0c",
    background: "#f2e4c6",
    outline: "#fffaf0",
    texture: "twe-texture-ivory-gold",
    material: "none",
  },
  "obsidian-gold": {
    name: "twe-obsidian-gold",
    foreground: "#fff0a8",
    background: "#343946",
    outline: "#050608",
    texture: "twe-texture-obsidian-gold",
    material: "none",
  },
  "moonlit-marble": {
    name: "twe-moonlit-marble",
    foreground: "#193652",
    background: "#e7edf3",
    outline: "#ffffff",
    texture: "twe-texture-moonlit-marble",
    material: "none",
  },
  "arcane-glass": {
    name: "twe-arcane-glass",
    foreground: "#21072f",
    background: "#c795eb",
    outline: "#fff6ff",
    texture: "twe-texture-arcane-glass",
    material: "none",
  },
  "dragon-scale": {
    name: "twe-dragon-scale",
    foreground: "#102718",
    background: "#6fbd9c",
    outline: "#f4fff0",
    texture: "twe-texture-dragon-scale",
    material: "none",
  },
  "ember-forge": {
    name: "twe-ember-forge",
    foreground: "#280b04",
    background: "#ee985f",
    outline: "#fff2df",
    texture: "twe-texture-ember-forge",
    material: "none",
  },
  "winter-ice": {
    name: "twe-winter-ice",
    foreground: "#12314a",
    background: "#d8f6ff",
    outline: "#ffffff",
    texture: "twe-texture-winter-ice",
    material: "none",
  },
  "tidal-water": {
    name: "twe-tidal-water",
    foreground: "#052d46",
    background: "#70c0ef",
    outline: "#ecfbff",
    texture: "twe-texture-tidal-water",
    material: "none",
  },
  "carved-wood": {
    name: "twe-carved-wood",
    foreground: "#1e0b02",
    background: "#e0a464",
    outline: "#fff3d8",
    texture: "twe-texture-carved-wood",
    material: "wood",
  },
  "forged-steel": {
    name: "twe-forged-steel",
    foreground: "#111f29",
    background: "#bdc6cf",
    outline: "#f4fbff",
    texture: "twe-texture-forged-steel",
    material: "none",
  },
  "antique-bronze": {
    name: "twe-antique-bronze",
    foreground: "#251005",
    background: "#e4bd63",
    outline: "#fff0d1",
    texture: "twe-texture-antique-bronze",
    material: "none",
  },
  "starfall-glitter": {
    name: "twe-starfall-glitter",
    foreground: "#15183d",
    background: "#b1b2ee",
    outline: "#f5f3ff",
    texture: "twe-texture-starfall-glitter",
    material: "none",
  },
  "starfield": {
    name: "twe-starfield",
    foreground: "#fff4c7",
    background: "#161d60",
    outline: "#030817",
    texture: "twe-texture-starfield",
    material: "none",
  },
  "speckled-stone": {
    name: "twe-speckled-stone",
    foreground: "#182128",
    background: "#d5d4cd",
    outline: "#ffffff",
    texture: "twe-texture-speckled-stone",
    material: "none",
  },
  "skull-reliquary": {
    name: "twe-skull-reliquary",
    foreground: "#4b0f18",
    background: "#ead8b3",
    outline: "#fffaf0",
    texture: "twe-texture-skull-reliquary",
    material: "none",
  },
  "leopard-pattern": {
    name: "twe-leopard-pattern",
    foreground: "#2b1a0c",
    background: "#f0c96c",
    outline: "#fff0c4",
    texture: "twe-texture-leopard-pattern",
    material: "wood",
  },
  "tiger-stripe": {
    name: "twe-tiger-stripe",
    foreground: "#251005",
    background: "#f0a24e",
    outline: "#fff1d6",
    texture: "twe-texture-tiger-stripe",
    material: "wood",
  },
  "cheetah-spot": {
    name: "twe-cheetah-spot",
    foreground: "#2a180d",
    background: "#f4d98e",
    outline: "#fff9e8",
    texture: "twe-texture-cheetah-spot",
    material: "wood",
  },
  "lizard-scale": {
    name: "twe-lizard-scale",
    foreground: "#0d2a06",
    background: "#82c95a",
    outline: "#edffe5",
    texture: "twe-texture-lizard-scale",
    material: "none",
  },
  "feathered": {
    name: "twe-feathered",
    foreground: "#26344a",
    background: "#d1e0ec",
    outline: "#f7fcff",
    texture: "twe-texture-feathered",
    material: "none",
  },
  "storm-clouds": {
    name: "twe-storm-clouds",
    foreground: "#10181f",
    background: "#9ea8aa",
    outline: "#f6fbff",
    texture: "twe-texture-storm-clouds",
    material: "none",
  },
  "astral-nebula": {
    name: "twe-astral-nebula",
    foreground: "#240820",
    background: "#e18abc",
    outline: "#fff3fa",
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
  "arcane-glass": { name: "twe-texture-arcane-glass", composite: "screen", source: "textures/stainedglass.webp", source_bump: "textures/stainedglass-bump.webp", material: "none" },
  "dragon-scale": { name: "twe-texture-dragon-scale", composite: "screen", source: "textures/dragon.webp", source_bump: "textures/dragon-bump.webp", material: "none" },
  "ember-forge": { name: "twe-texture-ember-forge", composite: "screen", source: "textures/fire.webp", source_bump: "textures/fire.webp", material: "none" },
  "winter-ice": { name: "twe-texture-winter-ice", composite: "screen", source: "textures/ice.webp", source_bump: "textures/ice.webp", material: "none" },
  "tidal-water": { name: "twe-texture-tidal-water", composite: "screen", source: "textures/water.webp", source_bump: "textures/water.webp", material: "none" },
  "carved-wood": { name: "twe-texture-carved-wood", composite: "multiply", source: "textures/wood.webp", source_bump: "textures/wood.webp", material: "wood" },
  "forged-steel": { name: "twe-texture-forged-steel", composite: "screen", source: "textures/metal.webp", source_bump: "textures/metal-bump.webp", material: "none" },
  "antique-bronze": { name: "twe-texture-antique-bronze", composite: "screen", source: "textures/bronze03.webp", source_bump: "", material: "none" },
  "starfall-glitter": { name: "twe-texture-starfall-glitter", composite: "screen", source: "textures/stars.webp", source_bump: "textures/stars.webp", material: "none" },
  "starfield": { name: "twe-texture-starfield", composite: "screen", source: "textures/glitter.webp", source_bump: "textures/glitter-bump.webp", material: "none" },
  "speckled-stone": { name: "twe-texture-speckled-stone", composite: "multiply", source: "textures/speckles.webp", source_bump: "textures/speckles.webp", material: "none" },
  "skull-reliquary": { name: "twe-texture-skull-reliquary", composite: "screen", source: "textures/skulls.webp", source_bump: "textures/skulls.webp", material: "none" },
  "leopard-pattern": { name: "twe-texture-leopard-pattern", composite: "multiply", source: "textures/leopard.webp", source_bump: "textures/leopard.webp", material: "wood" },
  "tiger-stripe": { name: "twe-texture-tiger-stripe", composite: "multiply", source: "textures/tiger.webp", source_bump: "textures/tiger.webp", material: "wood" },
  "cheetah-spot": { name: "twe-texture-cheetah-spot", composite: "multiply", source: "textures/cheetah.webp", source_bump: "textures/cheetah.webp", material: "wood" },
  "lizard-scale": { name: "twe-texture-lizard-scale", composite: "screen", source: "textures/lizard.webp", source_bump: "textures/lizard.webp", material: "none" },
  "feathered": { name: "twe-texture-feathered", composite: "screen", source: "textures/feather.webp", source_bump: "textures/feather-bump.webp", material: "none" },
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
