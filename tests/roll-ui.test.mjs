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

test("all character-sheet dice affordances use the shared roll request pipeline", () => {
  assert.match(sheetSource, /rawRoll = preparedSharedRoll\?\.dice \|\| rollDice\(request\.dice\.count, request\.dice\.sides\)/);
  assert.match(sheetSource, /resolveRoll\(request, \{ roll: \(\) => rawRoll \}\)/);
  assert.match(sheetSource, /label: `\$\{skill\} \(\$\{attribute\}\) Check`/);
  assert.match(sheetSource, /label: `\$\{name\} Attack`/);
  assert.match(sheetSource, /label: `\$\{name\} Damage`/);
  assert.match(sheetSource, /targetKind: "saving-throw"/);
  assert.match(sheetSource, /function rollInitiative\(\) \{[\s\S]*?category: "initiative",[\s\S]*?label: "Initiative",[\s\S]*?dice: \{ count: 1, sides: 8 \},[\s\S]*?value: calculatedInitiative/);
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
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS.starfield.source, "textures/stars.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["antique-bronze"].source, "textures/bronze03.webp");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS.starfield.composite, "screen");
  assert.equal(DICE_STYLE_TEXTURE_DEFINITIONS["antique-bronze"].composite, "screen");
  assert.match(diceStyleSource, /rendererTextureForKey/);
  assert.match(adapterSource, /installStyleTextureRegistry\(box\)/);
  assert.match(adapterSource, /rendererTextureForKey\(texture\)/);
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
