import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`${label}: expected source anchor not found`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`${label}: source anchor is not unique`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceRendererStyle(section, id, block) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`  "${escaped}": \\{[\\s\\S]*?\\n  \\},`);
  const matches = section.match(new RegExp(pattern.source, "g"));
  if (!matches || matches.length !== 1) {
    throw new Error(`${id}: expected exactly one renderer style block`);
  }
  return section.replace(pattern, block);
}

const stylePath = "app/virtual-dice-style.ts";
let styleSource = await readFile(stylePath, "utf8");
const textureMarker = "\n// The renderer caches custom colours by name and material canvases by texture name.";
const markerIndex = styleSource.indexOf(textureMarker);
if (markerIndex < 0) throw new Error("dice style texture marker not found");
let rendererSection = styleSource.slice(0, markerIndex);
let textureSection = styleSource.slice(markerIndex);

const rendererBlocks = {
  "obsidian-gold": `  "obsidian-gold": {\n    name: "twe-obsidian-gold",\n    foreground: "#f4cb70",\n    background: "#1e2028",\n    outline: "#050608",\n    texture: "twe-texture-obsidian-gold",\n    material: "none",\n  },`,
  "dragon-scale": `  "dragon-scale": {\n    name: "twe-dragon-scale",\n    foreground: "#fff1a8",\n    background: "#244236",\n    outline: "#11251d",\n    texture: "twe-texture-dragon-scale",\n    material: "none",\n  },`,
  "ember-forge": `  "ember-forge": {\n    name: "twe-ember-forge",\n    foreground: "#fff7d6",\n    background: "#8f1f12",\n    outline: "#2b0704",\n    texture: "twe-texture-ember-forge",\n    material: "none",\n  },`,
  "tidal-water": `  "tidal-water": {\n    name: "twe-tidal-water",\n    foreground: "#062f45",\n    background: "#85d9ea",\n    outline: "#f3fdff",\n    texture: "twe-texture-tidal-water",\n    material: "glass",\n  },`,
  "carved-wood": `  "carved-wood": {\n    name: "twe-carved-wood",\n    foreground: "#24140a",\n    background: "#d7a25f",\n    outline: "#f4dfbd",\n    texture: "twe-texture-carved-wood",\n    material: "wood",\n  },`,
  "forged-steel": `  "forged-steel": {\n    name: "twe-forged-steel",\n    foreground: "#162631",\n    background: "#d6e0e5",\n    outline: "#ffffff",\n    texture: "twe-texture-forged-steel",\n    material: "none",\n  },`,
  "antique-bronze": `  "antique-bronze": {\n    name: "twe-antique-bronze",\n    foreground: "#231307",\n    background: "#d49a46",\n    outline: "#ffe9bd",\n    texture: "twe-texture-antique-bronze",\n    material: "none",\n  },`,
  "starfall-glitter": `  "starfall-glitter": {\n    name: "twe-starfall-glitter",\n    foreground: "#fff0a8",\n    background: "#3b1b6b",\n    outline: "#10071d",\n    texture: "twe-texture-starfall-glitter",\n    material: "none",\n  },`,
  "starfield": `  "starfield": {\n    name: "twe-starfield",\n    foreground: "#fff4c7",\n    background: "#163b80",\n    outline: "#071631",\n    texture: "twe-texture-starfield",\n    material: "none",\n  },`,
  "tiger-stripe": `  "tiger-stripe": {\n    name: "twe-tiger-stripe",\n    foreground: "#21130a",\n    background: "#f58a2c",\n    outline: "#ffd6a6",\n    texture: "twe-texture-tiger-stripe",\n    material: "wood",\n  },`,
  "lizard-scale": `  "lizard-scale": {\n    name: "twe-lizard-scale",\n    foreground: "#f1ffe4",\n    background: "#28583a",\n    outline: "#102319",\n    texture: "twe-texture-lizard-scale",\n    material: "none",\n  },`,
  "storm-clouds": `  "storm-clouds": {\n    name: "twe-storm-clouds",\n    foreground: "#172330",\n    background: "#c4d0da",\n    outline: "#f7fbff",\n    texture: "twe-texture-storm-clouds",\n    material: "none",\n  },`,
  "astral-nebula": `  "astral-nebula": {\n    name: "twe-astral-nebula",\n    foreground: "#fff6dc",\n    background: "#542276",\n    outline: "#16081f",\n    texture: "twe-texture-astral-nebula",\n    material: "none",\n  },`,
};

for (const [id, block] of Object.entries(rendererBlocks)) {
  rendererSection = replaceRendererStyle(rendererSection, id, block);
}

for (const id of ["obsidian-gold", "ember-forge", "forged-steel", "antique-bronze"]) {
  const before = new RegExp(`("${id}": \\{[^\\n]*material: )"metal"( \\},)`);
  if (!before.test(textureSection)) {
    if (!new RegExp(`"${id}": \\{[^\\n]*material: "none"`).test(textureSection)) {
      throw new Error(`${id}: texture material anchor not found`);
    }
    continue;
  }
  textureSection = textureSection.replace(before, '$1"none"$2');
}

styleSource = rendererSection + textureSection;
await writeFile(stylePath, styleSource);

const adapterPath = "app/virtual-dice-adapter.ts";
let adapterSource = await readFile(adapterPath, "utf8");
adapterSource = replaceOnce(
  adapterSource,
  `type DiceBoxWithTextureRegistry = DiceBox & {\n  DiceColors: DiceTextureRegistry;\n};`,
  `type DiceBoxWithTextureRegistry = DiceBox & {\n  DiceColors: DiceTextureRegistry;\n};\ntype DiceBoxRendererInternals = DiceBoxWithTextureRegistry & {\n  scene: { add: (object: unknown) => void };\n};`,
  "renderer internals type",
);
adapterSource = replaceOnce(
  adapterSource,
  `      const { DiceBox } = await loadDiceBoxModule();`,
  `      const [{ DiceBox }, { HemisphereLight }] = await Promise.all([\n        loadDiceBoxModule(),\n        import("three"),\n      ]);`,
  "lazy renderer imports",
);
adapterSource = replaceOnce(
  adapterSource,
  `      installStyleTextureRegistry(box);\n      await box.initialize();\n      this.box = box;`,
  `      installStyleTextureRegistry(box);\n      await box.initialize();\n      // dice-box-threejs predates Three.js' physically-correct lighting default.\n      // A neutral hemispheric fill keeps textured faces and numerals readable at\n      // every resting angle while the renderer's spotlight retains direction.\n      const fillLight = new HemisphereLight(0xffffff, 0xb8c1cb, 1.05);\n      fillLight.name = "twe-dice-fill-light";\n      (box as DiceBoxRendererInternals).scene.add(fillLight);\n      this.box = box;`,
  "hemisphere fill light",
);
await writeFile(adapterPath, adapterSource);

const testPath = "tests/roll-ui.test.mjs";
let testSource = await readFile(testPath, "utf8");
const testMarker = `test("curated dice styles keep readable face-label contrast", () => {`;
if (!testSource.includes(testMarker)) {
  testSource += `\n\nfunction diceStyleRelativeLuminance(hex) {\n  const channel = pair => {\n    const value = Number.parseInt(pair, 16) / 255;\n    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;\n  };\n  const r = channel(hex.slice(1, 3));\n  const g = channel(hex.slice(3, 5));\n  const b = channel(hex.slice(5, 7));\n  return 0.2126 * r + 0.7152 * g + 0.0722 * b;\n}\n\nfunction diceStyleContrastRatio(foreground, background) {\n  const foregroundLuminance = diceStyleRelativeLuminance(foreground);\n  const backgroundLuminance = diceStyleRelativeLuminance(background);\n  const lighter = Math.max(foregroundLuminance, backgroundLuminance);\n  const darker = Math.min(foregroundLuminance, backgroundLuminance);\n  return (lighter + 0.05) / (darker + 0.05);\n}\n\ntest("curated dice styles keep readable face-label contrast", () => {\n  for (const style of DICE_STYLE_IDS) {\n    const config = DICE_STYLE_RENDERER_CONFIG[style];\n    assert.match(config.foreground, /^#[0-9a-f]{6}$/i);\n    assert.match(config.background, /^#[0-9a-f]{6}$/i);\n    assert.ok(\n      diceStyleContrastRatio(config.foreground, config.background) >= 7,\n      \`${'${style}'} face labels keep at least 7:1 base contrast\`,\n    );\n  }\n});\n\ntest("virtual dice lighting keeps every resting face legible", () => {\n  assert.match(adapterSource, /import\\("three"\\)/);\n  assert.match(adapterSource, /HemisphereLight/);\n  assert.match(adapterSource, /twe-dice-fill-light/);\n  assert.match(adapterSource, /scene\\.add\\(fillLight\\)/);\n});\n\ntest("metal-look dice avoid unlit PBR metal while retaining their textures", () => {\n  for (const style of ["obsidian-gold", "ember-forge", "forged-steel", "antique-bronze"]) {\n    assert.equal(DICE_STYLE_RENDERER_CONFIG[style].material, "none");\n    assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS[style].material, "none");\n  }\n});\n`;
}
await writeFile(testPath, testSource);
