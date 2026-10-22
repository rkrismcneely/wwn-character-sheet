import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const sheetSource = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
const presentationSource = await readFile(new URL("../app/roll-presentation.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");
const preferenceSource = await readFile(new URL("../app/virtual-dice-preference.tsx", import.meta.url), "utf8");
const overlaySource = await readFile(new URL("../app/virtual-dice-overlay.tsx", import.meta.url), "utf8");
const diceStyleSource = await readFile(new URL("../app/virtual-dice-style.ts", import.meta.url), "utf8");
const accountSource = await readFile(new URL("../app/account/account-page.tsx", import.meta.url), "utf8");
const {
  DICE_STYLE_IDS,
  DICE_STYLE_RENDERER_CONFIG,
  DICE_STYLE_TEXTURE_DEFINITIONS,
} = await import(new URL("../app/virtual-dice-style.ts", import.meta.url));

function rgbFromHex(hex) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function relativeLuminance(hex) {
  const [red, green, blue] = rgbFromHex(hex).map(channel => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbDistance(first, second) {
  const firstRgb = rgbFromHex(first);
  const secondRgb = rgbFromHex(second);
  return Math.hypot(...firstRgb.map((channel, index) => (channel - secondRgb[index]) * 255));
}

function hueAndSaturation(hex) {
  const [red, green, blue] = rgbFromHex(hex);
  const highest = Math.max(red, green, blue);
  const lowest = Math.min(red, green, blue);
  const delta = highest - lowest;
  if (delta === 0) return { hue: 0, saturation: 0 };

  const rawHue = highest === red
    ? ((green - blue) / delta) % 6
    : highest === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return {
    hue: (rawHue * 60 + 360) % 360,
    saturation: delta / (1 - Math.abs(2 * ((highest + lowest) / 2) - 1)),
  };
}

test("all character-sheet dice affordances use the shared roll request pipeline", () => {
  assert.match(sheetSource, /if \(!preparedSharedRoll\) localResult = await resolveRoll\(request\)/);
  assert.match(sheetSource, /rawRoll = \(preparedSharedRoll \|\| localResult\)!\.dice/);
  assert.match(sheetSource, /label: `\$\{skill\} \(\$\{attribute\}\) Check\$\{sniperEyeBonus/);
  assert.match(sheetSource, /label: `\$\{name\} — Attack`/);
  assert.match(sheetSource, /label: `\$\{name\} — Damage`/);
  assert.match(sheetSource, /targetKind: "saving-throw"/);
  assert.match(sheetSource, /function rollInitiative\(\) \{[\s\S]*?category: "initiative",[\s\S]*?label: alertLevelTwo \? "Initiative \(Alert 2: act first unless another Alert 2 is present\)" : alert \? "Initiative \(Alert: take better die\)" : "Initiative",[\s\S]*?dice: \{ count: alert \? 2 : 1, sides: 8 \},[\s\S]*?value: calculatedInitiative/);
  assert.match(sheetSource, /function rollHeaderDice\(kind: "d20" \| "2d6"\) \{[\s\S]*?category: "generic"/);
});

test("virtual dice preserve one authoritative raw roll and fall back without rerolling", () => {
  assert.match(sheetSource, /const shouldAnimate = virtualDiceEnabled && !reducedMotion/);
  assert.match(sheetSource, /virtualDiceOverlay\.current\?\.roll/);
  assert.match(sheetSource, /virtualDiceOverlay\.current\?\.cancel/);
  assert.match(sheetSource, /setLatestRoll\(result\)/);
  assert.match(adapterSource, /import\("@drdreo\/dice-box-threejs"\)/);
  assert.match(adapterSource, /request\.dice\.map\(die => `1d\$\{die\.sides\}`\)\.join\("\+"\)/);
  assert.match(adapterSource, /request\.dice\.map\(die => die\.value\)\.join\(","\)/);
  assert.match(adapterSource, /theme_surface: "green-felt"/);
  assert.match(overlaySource, /createPortal/);
});

test("virtual dice retain the renderer-safe dynamic import boundary", () => {
  assert.match(adapterSource, /import\("@drdreo\/dice-box-threejs"\)/);
  assert.doesNotMatch(adapterSource, /(?:from\s*|import\()\s*["']three["']/);
});

test("virtual dice preference is browser-local and off by default", () => {
  assert.match(preferenceSource, /VIRTUAL_DICE_STORAGE_KEY/);
  assert.match(preferenceSource, /=== "on"/);
  assert.match(preferenceSource, /\(\) => false/);
  assert.match(preferenceSource, /localStorage/);
});

test("Dice Style is a typed browser-local preference with a safe default", () => {
  assert.match(preferenceSource, /DICE_STYLE_STORAGE_KEY = "wwn-dice-style"/);
  assert.match(preferenceSource, /localStorage\.getItem\(DICE_STYLE_STORAGE_KEY\)/);
  assert.match(preferenceSource, /localStorage\.setItem\(DICE_STYLE_STORAGE_KEY, style\)/);
  assert.match(preferenceSource, /useSyncExternalStore/);
  assert.match(diceStyleSource, /DEFAULT_DICE_STYLE: DiceStyleId = "ivory-gold"/);
  assert.match(diceStyleSource, /DICE_STYLE_RENDERER_CONFIG/);
  assert.doesNotMatch(preferenceSource, /theme_customColorset|theme_texture|theme_material/);
  for (const style of ["ivory-gold", "obsidian-gold", "moonlit-marble", "arcane-glass", "dragon-scale"]) {
    assert.ok(diceStyleSource.includes(`"${style}"`), `${style} remains a curated Dice Style`);
  }
});

test("Dice Style renderer configs have stable, style-scoped cache and texture identities", async () => {
  const addedStyles = [
    "ember-forge", "winter-ice", "tidal-water", "carved-wood", "forged-steel",
    "antique-bronze", "starfall-glitter", "starfield", "speckled-stone",
    "skull-reliquary", "leopard-pattern", "tiger-stripe", "cheetah-spot",
    "lizard-scale", "feathered", "storm-clouds", "astral-nebula",
  ];
  for (const style of addedStyles) {
    assert.ok(diceStyleSource.includes(`"${style}"`), `${style} is a curated Dice Style`);
  }
  const colorsetNames = new Set();
  const textureNames = new Set();
  const rendererSignatures = new Set();

  for (const style of DICE_STYLE_IDS) {
    const config = DICE_STYLE_RENDERER_CONFIG[style];
    const texture = DICE_STYLE_TEXTURE_DEFINITIONS[style];
    assert.equal(config.name, `twe-${style}`, `${style} has a stable colorset cache key`);
    assert.equal(config.texture, texture.name, `${style} applies its selected texture to the colorset`);
    assert.equal(config.material, texture.material, `${style} uses the texture's intended material`);
    assert.ok(texture.name.startsWith("twe-texture-"), `${style} has a renderer-scoped texture identity`);
    assert.ok(texture.source.startsWith("textures/"), `${style} has a renderer texture source`);
    assert.ok(["multiply", "screen"].includes(texture.composite), `${style} has an explicit texture blend mode`);
    assert.ok(!colorsetNames.has(config.name), `${style} cannot reuse a cached colorset`);
    assert.ok(!textureNames.has(texture.name), `${style} cannot reuse another style's material canvas`);
    colorsetNames.add(config.name);
    textureNames.add(texture.name);
    rendererSignatures.add(JSON.stringify({
      texture: config.texture,
      material: config.material,
      foreground: config.foreground,
      background: config.background,
      outline: config.outline,
    }));

    await access(new URL(`../public/assets/virtual-dice/${texture.source}`, import.meta.url));
    if (texture.source_bump) {
      await access(new URL(`../public/assets/virtual-dice/${texture.source_bump}`, import.meta.url));
    }
  }

  assert.equal(colorsetNames.size, DICE_STYLE_IDS.length);
  assert.equal(textureNames.size, DICE_STYLE_IDS.length);
  assert.equal(rendererSignatures.size, DICE_STYLE_IDS.length);
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["ember-forge"].source, "textures/fire.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["winter-ice"].source, "textures/ice.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["carved-wood"].source, "textures/wood.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS.starfield.source, "textures/glitter.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["antique-bronze"].source, "textures/bronze03.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS.starfield.composite, "screen");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["starfall-glitter"].composite, "screen");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["antique-bronze"].composite, "screen");
  assert.match(diceStyleSource, /rendererTextureForKey/);
  assert.match(adapterSource, /installStyleTextureRegistry\(box\)/);
  assert.match(adapterSource, /rendererTextureForKey\(texture\)/);
});

test("curated Dice Styles retain readable figure contrast and opposite-luminance outlines", () => {
  for (const style of DICE_STYLE_IDS) {
    const { foreground, background, outline } = DICE_STYLE_RENDERER_CONFIG[style];
    assert.ok(
      contrastRatio(foreground, background) >= 2.5,
      `${style} keeps enough numeral-to-face contrast before texture detail is applied`,
    );
    assert.ok(
      contrastRatio(foreground, outline) >= 10,
      `${style} has a pronounced outline that separates its numerals from busy faces`,
    );
    assert.notEqual(
      relativeLuminance(foreground) > 0.5,
      relativeLuminance(outline) > 0.5,
      `${style} uses an outline with the opposite luminance role from its numerals`,
    );
  }
});

test("curated Dice Styles keep bright face palettes outside their intentional dark identities", () => {
  const intentionalDarkStyles = new Set(["obsidian-gold", "starfield"]);
  for (const style of DICE_STYLE_IDS) {
    if (intentionalDarkStyles.has(style)) continue;
    assert.ok(
      relativeLuminance(DICE_STYLE_RENDERER_CONFIG[style].background) >= 0.35,
      `${style} keeps a bright enough face palette after texture shading`,
    );
  }
});

test("light-facing Dice Styles use bright texture compositing without flattening dark or natural patterns", () => {
  for (const style of [
    "arcane-glass", "dragon-scale", "ember-forge", "winter-ice", "tidal-water",
    "forged-steel", "antique-bronze", "starfall-glitter", "lizard-scale",
    "storm-clouds", "astral-nebula",
  ]) {
    assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS[style].composite, "screen", `${style} keeps its brightened texture treatment`);
  }
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS.starfield.composite, "screen", "starfield keeps bright pinpoints against its night-sky face");
  for (const style of ["obsidian-gold", "carved-wood", "leopard-pattern", "tiger-stripe", "cheetah-spot"]) {
    assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS[style].composite, "multiply", `${style} keeps its intentionally dark or natural texture treatment`);
  }
});

test("curated Dice Style palettes preserve distinct visual identities", () => {
  const backgrounds = DICE_STYLE_IDS.map(style => DICE_STYLE_RENDERER_CONFIG[style].background);
  for (let index = 0; index < backgrounds.length; index += 1) {
    for (let comparison = index + 1; comparison < backgrounds.length; comparison += 1) {
      assert.ok(
        rgbDistance(backgrounds[index], backgrounds[comparison]) >= 18,
        `${DICE_STYLE_IDS[index]} and ${DICE_STYLE_IDS[comparison]} cannot collapse into near-identical palettes`,
      );
    }
  }

  const keyPairs = [
    ["winter-ice", "tidal-water"],
    ["forged-steel", "moonlit-marble"],
    ["starfall-glitter", "starfield"],
    ["dragon-scale", "lizard-scale"],
    ["leopard-pattern", "tiger-stripe"],
    ["arcane-glass", "astral-nebula"],
  ];
  for (const [first, second] of keyPairs) {
    assert.ok(
      rgbDistance(DICE_STYLE_RENDERER_CONFIG[first].background, DICE_STYLE_RENDERER_CONFIG[second].background) >= 30,
      `${first} and ${second} retain intentionally different art directions`,
    );
  }
});

test("key Dice Styles stay inside their intended color families and avoid reflective washout", () => {
  const palette = Object.fromEntries(DICE_STYLE_IDS.map(style => [
    style,
    hueAndSaturation(DICE_STYLE_RENDERER_CONFIG[style].background),
  ]));

  assert.ok(palette["arcane-glass"].hue >= 245 && palette["arcane-glass"].hue <= 275);
  assert.ok(palette["arcane-glass"].saturation >= 0.5);
  assert.ok(palette["dragon-scale"].hue >= 140 && palette["dragon-scale"].hue <= 165);
  assert.ok(palette["ember-forge"].hue <= 30 || palette["ember-forge"].hue >= 345);
  assert.ok(palette["winter-ice"].hue >= 185 && palette["winter-ice"].hue <= 205);
  assert.ok(palette["tidal-water"].hue >= 200 && palette["tidal-water"].hue <= 220);
  assert.ok(palette["forged-steel"].saturation <= 0.2);
  assert.ok(palette.starfield.hue >= 220 && palette.starfield.hue <= 250);
  assert.ok(palette["astral-nebula"].hue >= 315 && palette["astral-nebula"].hue <= 345);

  for (const style of [
    "obsidian-gold", "arcane-glass", "ember-forge", "tidal-water",
    "forged-steel", "antique-bronze", "starfall-glitter", "starfield", "astral-nebula",
  ]) {
    assert.equal(DICE_STYLE_RENDERER_CONFIG[style].material, "none", `${style} avoids environment-reflection color washout`);
  }
});

test("virtual rolls use the chosen style while preserving authoritative notation", () => {
  assert.match(sheetSource, /const \{ style: diceStyle \} = useDiceStylePreference\(\)/);
  assert.match(sheetSource, /style: diceStyle/);
  assert.match(adapterSource, /initialize\(request\.style\)/);
  assert.match(adapterSource, /rendererConfigForDiceStyle\(style\)/);
  assert.match(adapterSource, /theme_surface: "green-felt"/);
  assert.match(adapterSource, /\$\{request\.dice\.map\(die => `1d\$\{die\.sides\}`\)\.join\("\+"\)\}@\$\{request\.dice\.map\(die => die\.value\)\.join\(","\)\}/);
});

test("Account provides a preview-only Test Dice action for every standard die", () => {
  assert.match(accountSource, /<DiceStyleSelect[\s\S]*id="account-dice-style"/);
  assert.match(accountSource, /Test Dice/);
  assert.match(accountSource, /STANDARD_RPG_DICE_SIDES\.map\(sides =>/);
  assert.match(accountSource, /rollDice\(1, sides\)/);
  assert.match(accountSource, /overlay\.current\?\.roll\(\{ dice, style \}\)/);
  assert.match(diceStyleSource, /STANDARD_RPG_DICE_SIDES = \[4, 6, 8, 10, 12, 20\]/);
  assert.doesNotMatch(accountSource, /setLatestRoll|prependRollHistory|persistRollHistory|setEnabled/);
  assert.match(accountSource, /reduced-motion/);
  assert.match(accountSource, /15_000/);
});

test("read-only sheets retain local rolling controls while edits remain separate", () => {
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*onClick=\{\(\) => rollSave/);
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*onClick=\{\(\) => rollWeaponAttack/);
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*aria-expanded=\{skillRollChooser === skill\}/);
  assert.match(sheetSource, /className="field calculated-field initiative-field"[\s\S]*?Roll Initiative/);
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*onClick=\{rollInitiative\}/);
  assert.match(cssSource, /\.initiative-field\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:stretch;gap:4px 6px\}/);
  assert.match(cssSource, /\.initiative-field>span\{grid-column:1\/-1\}/);
  assert.match(cssSource, /\.initiative-field \.roll-affordance\{align-self:stretch;margin-top:0;padding:5px 7px\}/);
});

test("the result tray and history keep all existing controls discoverable", () => {
  assert.match(sheetSource, /<RollResultTray result=\{latestRoll\}/);
  assert.match(sheetSource, /<RollHistoryPanel history=\{rollHistory\}/);
  assert.match(sheetSource, /Roll History/);
  assert.match(presentationSource, /Stored only in this browser session/);
  assert.match(presentationSource, /result\.character\.name/);
  assert.match(presentationSource, /\{result\.character\.name\} · \{result\.label\}/);
  assert.match(presentationSource, /<strong>\{result\.label\}<\/strong>/);
});

test("Phase 4E presentation controls have dedicated responsive layout hooks", () => {
  assert.match(sheetSource, /weapon-stat-cell weapon-roll-cell/);
  assert.match(sheetSource, /className="skill-roll-options"/);
  assert.match(sheetSource, /className="hero-roll-row"/);
  assert.match(sheetSource, /Roll Attack/);
  assert.match(sheetSource, /Roll Damage/);
  for (const attribute of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
    assert.ok(sheetSource.includes(attribute), `${attribute} remains available to the chooser`);
  }
});

test("character header keeps identity and play utilities in stable companion panels", () => {
  assert.match(sheetSource, /className="hero-identity-panel"/);
  assert.match(sheetSource, /className="hero-tools hero-play-panel"/);
  assert.match(sheetSource, /className="hero-roll-row"/);
  assert.match(sheetSource, /className="hero-latest-roll"/);
  assert.match(sheetSource, /className="hero-stat-card hero-ac-card"/);
  assert.match(sheetSource, /className="hero-stat-card hp-stat"/);
  assert.match(sheetSource, /sheet\.species/);
  assert.match(sheetSource, /sheet\.background/);
  assert.match(sheetSource, /sheet\.description/);
});

test("redesigned header does not retain the legacy three-track hero grid", () => {
  assert.doesNotMatch(cssSource, /grid-template-columns:132px minmax\(0,1fr\) minmax\(/);
  assert.doesNotMatch(cssSource, /\.hero>\.hero-identity/);
  assert.doesNotMatch(cssSource, /\.hero>\.portrait-frame/);
});

test("refined character header keeps only primary identity and matched play-card labels", () => {
  assert.doesNotMatch(sheetSource, /className="hero-summary">[\s\S]*Player:/);
  assert.doesNotMatch(sheetSource, /className="hero-identity-details"/);
  assert.doesNotMatch(sheetSource, /className="hero-description"/);
  assert.doesNotMatch(sheetSource, /className="dice-control-symbol"/);
  assert.doesNotMatch(sheetSource, /hero-stat-kicker">(?:AC|HP)/);
  assert.doesNotMatch(sheetSource, /dice-control-expression/);
  assert.match(sheetSource, /hero-card-label">ARMOR CLASS/);
  assert.match(sheetSource, /hero-card-label">HIT POINTS/);
  assert.match(cssSource, /\.hero-wealth input\{[\s\S]*width:70px[\s\S]*min-width:70px/);
  assert.match(cssSource, /\.hero-play-panel \.hero-stats\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)/);
  assert.match(cssSource, /\.hero\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(cssSource, /\.hero\{[\s\S]*align-items:stretch/);
  assert.match(cssSource, /\.hero-card-label,\n\.dice-control-action\{[\s\S]*font:700 9px\/1\.1 var\(--font-ui\)/);
  assert.match(cssSource, /\.hero-card-label\{[\s\S]*width:100%;[\s\S]*text-align:center/);
  assert.match(cssSource, /\.hero-stat-card>input,\n\.hero-stat-card\.hp-stat \.paired\{[\s\S]*transform:translateY\(5px\)/);
});

test("responsive identity header preserves portrait composition and contains the coin purse", () => {
  assert.match(sheetSource, /className="hero-wealth-values"/);
  assert.match(cssSource, /@media \(max-width:1280px\)\{[\s\S]*?\.hero-identity-panel \.portrait-frame\{[\s\S]*?align-self:start/);
  assert.match(cssSource, /\.hero-identity-panel \.portrait-frame>img\{[\s\S]*min-height:0;[\s\S]*max-height:100%;[\s\S]*object-position:center top/);
  assert.match(cssSource, /@media \(max-width:1280px\)\{[\s\S]*?\.hero-identity-copy\{min-height:0\}/);
  assert.match(cssSource, /@media \(max-width:1280px\) and \(min-width:901px\)\{[\s\S]*?\.hero-identity-panel\{padding:15px\}/);
  assert.match(cssSource, /\.hero-wealth-values\{[\s\S]*grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,84px\),1fr\)\)/);
  assert.match(cssSource, /\.hero-wealth-values input\{[\s\S]*width:100%;[\s\S]*min-width:0/);
});

test("Roll History is an out-of-flow accessible popout", () => {
  assert.match(sheetSource, /aria-haspopup="dialog"/);
  assert.match(sheetSource, /className="roll-history-popout"/);
  assert.match(presentationSource, /role="dialog"/);
  assert.match(presentationSource, /event\.key === "Escape"/);
  assert.match(presentationSource, /Stored only in this browser session/);
});

test("latest-roll presentation has a stable empty state and structured result state", () => {
  assert.match(presentationSource, /className="roll-result-tray roll-result-empty"/);
  assert.match(presentationSource, /className="roll-result-kicker">Latest Roll/);
  assert.match(presentationSource, /formatRollBreakdown\(result\)/);
  assert.match(presentationSource, /className="roll-result-total"/);
});

test("character-header CSS covers responsive, equal-panel, theme, and print requirements", () => {
  assert.match(cssSource, /\.hero\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(cssSource, /\.hero\{[\s\S]*align-items:stretch/);
  assert.match(cssSource, /\.hero-identity-panel \.portrait-frame\{[\s\S]*min-height:210px/);
  assert.match(cssSource, /@media \(max-width:900px\)\{[\s\S]*\.hero\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(cssSource, /@media \(max-width:720px\)\{[\s\S]*\.hero-play-panel \.hero-stats\{[\s\S]*repeat\(2,minmax\(0,1fr\)/);
  assert.match(cssSource, /\.roll-history-popout\{[\s\S]*position:absolute/);
  assert.match(cssSource, /@media \(max-width:720px\)\{[\s\S]*\.roll-history-popout\{[\s\S]*position:fixed/);
  assert.match(cssSource, /html\[data-theme="dark"\] \.hero-identity-panel/);
  assert.match(cssSource, /@media print\{[\s\S]*\.hero-latest-roll,\.hero-roll-history-control,\.roll-history-popout\{display:none!important\}/);
});

test("Roll History popout owns a stacking layer above Core Sheet panels", () => {
  assert.match(cssSource, /\.hero,\n\.hero:has\(\.rules-results\)\{[\s\S]*z-index:70;[\s\S]*isolation:isolate/);
  assert.match(cssSource, /\.sheet-section:has\(\.weapon-trait:hover\),\.sheet-section:has\(\.weapon-trait:focus\),\.sheet-section:has\(\.weapon-trait:focus-within\)\{z-index:60\}/);
  assert.match(cssSource, /\.roll-history-popout\{[\s\S]*z-index:100;[\s\S]*pointer-events:auto/);
  assert.match(cssSource, /\.topbar\{[\s\S]*z-index:80/);
});


function diceStyleRelativeLuminance(hex) {
  const channel = pair => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(hex.slice(1, 3));
  const g = channel(hex.slice(3, 5));
  const b = channel(hex.slice(5, 7));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function diceStyleContrastRatio(foreground, background) {
  const foregroundLuminance = diceStyleRelativeLuminance(foreground);
  const backgroundLuminance = diceStyleRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("curated dice styles keep readable face-label contrast", () => {
  for (const style of DICE_STYLE_IDS) {
    const config = DICE_STYLE_RENDERER_CONFIG[style];
    assert.match(config.foreground, /^#[0-9a-f]{6}$/i);
    assert.match(config.background, /^#[0-9a-f]{6}$/i);
    assert.ok(
      diceStyleContrastRatio(config.foreground, config.background) >= 7,
      `${style} face labels keep at least 7:1 base contrast`,
    );
  }
});

test("virtual dice readability uses renderer-native lighting without a runtime Three import", () => {
  assert.match(adapterSource, /color_spotlight: 0xffffff/);
  assert.match(adapterSource, /light_intensity: 2\.8/);
  assert.doesNotMatch(adapterSource, /const threeModuleName = "three"/);
  assert.doesNotMatch(adapterSource, /import\(threeModuleName\)|HemisphereLight|twe-dice-fill-light|scene\.add\(fillLight\)/);
  assert.match(adapterSource, /import\("@drdreo\/dice-box-threejs"\)/);
});

test("metal-look dice avoid unlit PBR metal while retaining their textures", () => {
  for (const style of ["obsidian-gold", "ember-forge", "forged-steel", "antique-bronze"]) {
    assert.equal(DICE_STYLE_RENDERER_CONFIG[style].material, "none");
    assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS[style].material, "none");
  }
});

test("Sniper’s Eye precision bonus requires explicit ranged execution or target-shooting context", async () => {
  const sheetSource = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
  assert.match(sheetSource, /sniperEyeBonus = skill === "Shoot" && sniperEyeContext/);
  assert.match(sheetSource, /specialist \|\| giftedChirurgeon \|\| sniperEyeBonus \? 3 : 2/);
  assert.match(sheetSource, /setSniperEyeContext\(false\)/);
  assert.match(sheetSource, /pick.name === "Sniper’s Eye"/);
  assert.match(sheetSource, /onChange=\{event => setSniperEyeContext\(event.target.checked\)\}/);
  assert.match(sheetSource, /sniperEyeBonus \? " — ranged execution \/ target shooting"/);
});

test("Nullifier's +2 saving throw modifier applies only when magical context is selected", () => {
  assert.match(sheetSource, /const nullifierBonus = magicalSaveContext && selectedFocusPicks\.some\(pick => pick\.name === "Nullifier"\)/u);
  assert.match(sheetSource, /nullifierBonus \? \{ modifiers: \[\{ label: "Nullifier vs magic", value: 2 \}\] \} : \{\}/u);
  assert.match(sheetSource, /checked=\{magicalSaveContext\} onChange=\{event => setMagicalSaveContext\(event\.target\.checked\)\}/u);
});

test("Masterful Expertise rerolls only eligible latest noncombat skill checks for full Experts", () => {
  assert.match(sheetSource, /sheet.classMode !== "full" \|\| sheet.classOne !== "Expert"/u);
  assert.match(sheetSource, /masterfulUsed \|\| !masterfulRequest \|\| latestRoll\?\.id !== masterfulRollId/u);
  assert.match(sheetSource, /!\["Stab", "Shoot", "Punch", "Magic"\]\.includes\(skill\)/u);
  assert.match(sheetSource, /sessionStorage\.setItem\(key, "used"\)/u);
  assert.match(sheetSource, /sessionStorage\.removeItem\(key\)/u);
  assert.match(sheetSource, /Masterful Expertise reroll/u);
  assert.match(sheetSource, /Confirm failure with GM before using/u);
});

test("Veteran’s Luck overrides the outcome once per scene without falsifying a die roll", () => {
  assert.match(sheetSource, /function applyVeteransLuck\(kind: "hit" \| "miss"\)/u);
  assert.match(sheetSource, /sheet.classMode !== "full" \|\| sheet.classOne !== "Warrior"/u);
  assert.match(sheetSource, /latestRoll\?\.category !== "attack" \|\| latestRoll.id !== latestAttackId/u);
  assert.match(sheetSource, /sessionStorage\.setItem\(`twe-veterans-luck-/u);
  assert.match(sheetSource, /sessionStorage\.removeItem\(`twe-veterans-luck-/u);
  assert.match(sheetSource, /Outcome override, not an extra roll/u);
  assert.match(sheetSource, /Force incoming miss/u);
  assert.match(sheetSource, /Force hit/u);
});

test("situational Focus rerolls are scoped, once per scene, and preserve source request", () => {
  assert.match(sheetSource, /name: "Impostor", eligible: true/);
  assert.match(sheetSource, /name: "Trapmaster", eligible: true/);
  assert.match(sheetSource, /pick.name === "Rider" && pick.level === 2/);
  assert.match(sheetSource, /focusRerollSource.request.label.startsWith\("Ride \("\)/);
  assert.match(sheetSource, /latestRoll\?\.id !== focusRerollSource.resultId/);
  assert.match(sheetSource, /request.category !== "skill" && request.category !== "save"/);
  assert.match(sheetSource, /sessionStorage.setItem\(`twe-focus-reroll-/);
  assert.match(sheetSource, /sessionStorage.removeItem\(`twe-focus-reroll-/);
  assert.match(sheetSource, /label: `\$\{request.label\} — Focus reroll/);
  assert.match(sheetSource, /GM confirms the check failed/);
});


test("Whirlwind Assault exposes distinct once-per-scene Shock and once-per-round bonus attack controls", () => {
  assert.match(sheetSource, /Whirlwind Assault combat abilities/u);
  assert.match(sheetSource, /whirlwindSceneUsed/u);
  assert.match(sheetSource, /setWhirlwindSceneUsed\(true\)/u);
  assert.match(sheetSource, /setWhirlwindSceneUsed\(false\)/u);
  assert.match(sheetSource, /Whirlwind Assault" && pick\.level === 2/u);
  assert.match(sheetSource, /setWhirlwindRoundUsed\(true\)/u);
  assert.match(sheetSource, /setWhirlwindRoundUsed\(false\)/u);
  assert.match(sheetSource, /apply melee Shock to eligible adjacent foes/u);
});


test("situational Focus actions keep context-sensitive exceptions explicit", () => {
  for (const focus of ["Poisoner", "Die Hard", "Nullifier", "Lucky", "Close Combatant"]) {
    assert.match(sheetSource, new RegExp(`<strong>${focus}</strong>`));
  }
  assert.match(sheetSource, /Poisoner — toxin \(2d6 \+ level/u);
  assert.match(sheetSource, /count: 2, sides: 6/u);
  assert.match(sheetSource, /Mark failed magical save as success/u);
  assert.match(sheetSource, /Roll Fortune \(1d6\)/u);
  assert.match(sheetSource, /Fighting Withdrawal as an On Turn action/u);
});


test("support Focus batch exposes circumstance-aware combat and social abilities", () => {
  for (const focus of ["Gifted Chirurgeon", "Trapmaster", "Rider", "Authority", "Dealmaker"]) {
    assert.match(sheetSource, new RegExp(`<strong>${focus}</strong>`));
  }
  assert.match(sheetSource, /Roll Curative Healing/u);
  assert.match(sheetSource, /skillProfile\("Heal"\)\.effective/u);
  assert.match(sheetSource, /Roll Trap Damage/u);
  assert.match(sheetSource, /sheet\.level \* 2/u);
  assert.match(sheetSource, /Mark steed attack negated/u);
  assert.match(sheetSource, /Mark daily request used/u);
  assert.match(sheetSource, /Mark session bargain used/u);
});


test("defensive Focus audit presents five situational exceptions and daily use tracking", () => {
  for (const focus of ["Assassin", "Armored Magic", "Spirit Familiar", "Impervious Defense", "Armsmaster"]) {
    assert.match(sheetSource, new RegExp(`<strong>${focus}</strong>`));
  }
  assert.match(sheetSource, /Mark familiar Effort refresh used/u);
  assert.match(sheetSource, /Mark protection used/u);
  assert.match(sheetSource, /surprise round/u);
  assert.match(sheetSource, /armor with Encumbrance 2 or less/u);
  assert.match(sheetSource, /applied to a weapon’s Shock damage instead of its rolled damage/u);
});


test("social and ranged Focus audit exposes qualified reaction and session controls", () => {
  for (const focus of ["Well Met", "Connected", "Diplomatic Grace", "Sniper’s Eye"]) {
    assert.match(sheetSource, new RegExp(`<strong>${focus}</strong>`));
  }
  assert.match(sheetSource, /Roll First Reaction \(2d6\+1\)/u);
  assert.match(sheetSource, /label: "Well Met — first meeting reaction \(\+1\)"/u);
  assert.match(sheetSource, /Mark exceptional reaction used/u);
  assert.match(sheetSource, /Mark daily favor used/u);
  assert.match(sheetSource, /Mark session meeting used/u);
  assert.match(sheetSource, /Mark consecrated bargain used/u);
  assert.match(sheetSource, /victim suffers −4 to the Physical save/u);
});


test("ranged melee penalty is computed for all ranged weapon attacks", () => {
  assert.ok(sheetSource.includes("const [rangedInMelee, setRangedInMelee] = useState(false)"));
  assert.match(sheetSource, /rangedMeleePenalty = rangedAttackInMeleePenalty/u);
  assert.match(sheetSource, /focusHitBonus \\+ rangedMeleePenalty/u);
  assert.match(sheetSource, /Ranged attack while engaged in melee/u);
});

test("Armsmaster skill bonus can be assigned to eligible melee Shock instead of hit damage", () => {
  assert.match(sheetSource, /\[armsmasterToShock, setArmsmasterToShock\] = useState\(false\)/u);
  assert.match(sheetSource, /armsmasterToShock && isMelee && w\.shock !== "None" \? 0 : armsmasterDamage/u);
  assert.match(sheetSource, /armsmasterToShock && isMelee \? armsmasterDamage : 0/u);
  assert.match(sheetSource, /Armsmaster: apply Stab bonus to eligible melee Shock instead of rolled damage/u);
});


test("versatile thrown weapons use player-selected attack mode and melee-only Shock", () => {
  assert.match(sheetSource, /\[preferThrownMode, setPreferThrownMode\] = useState\(false\)/u);
  assert.match(sheetSource, /isThrownWeapon && w\.range !== "-" \? !preferThrownMode/u);
  assert.match(sheetSource, /const shock = !isMelee \|\| w\.shock === "None" \? "None"/u);
  assert.match(sheetSource, /Throw versatile weapons instead of striking in melee/u);
});


test("custom campaign versatile weapons honor explicit thrown versus melee skill", () => {
  assert.match(sheetSource, /isThrownWeapon && w\.range !== "-" \? \(isMelee \? "Stab" : "Shoot"\) : campaignWeapon\?\.skill/u);
  assert.match(sheetSource, /Only melee use permits Shock/u);
});


test("ranged melee penalty uses existing ranged mode and Deadeye level", () => {
  assert.match(sheetSource, /ranged: !isMelee, threatened: rangedInMelee/u);
  assert.match(sheetSource, /deadeyeLevel: deadeye\\?\\.level \\|\\| 0/u);
});
