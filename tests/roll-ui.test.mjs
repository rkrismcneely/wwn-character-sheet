import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sheetSource = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
const presentationSource = await readFile(new URL("../app/roll-presentation.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("../app/virtual-dice-adapter.ts", import.meta.url), "utf8");
const preferenceSource = await readFile(new URL("../app/virtual-dice-preference.tsx", import.meta.url), "utf8");
const overlaySource = await readFile(new URL("../app/virtual-dice-overlay.tsx", import.meta.url), "utf8");

test("all character-sheet dice affordances use the shared roll request pipeline", () => {
  assert.match(sheetSource, /rawRoll = rollDice\(request\.dice\.count, request\.dice\.sides\)/);
  assert.match(sheetSource, /resolveRoll\(request, \{ roll: \(\) => rawRoll \}\)/);
  assert.match(sheetSource, /label: `\$\{skill\} \(\$\{attribute\}\) Check`/);
  assert.match(sheetSource, /label: `\$\{name\} Attack`/);
  assert.match(sheetSource, /label: `\$\{name\} Damage`/);
  assert.match(sheetSource, /targetKind: "saving-throw"/);
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

test("read-only sheets retain local rolling controls while edits remain separate", () => {
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*onClick=\{\(\) => rollSave/);
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*onClick=\{\(\) => rollWeaponAttack/);
  assert.match(sheetSource, /data-readonly-interactive="true"[^>]*aria-expanded=\{skillRollChooser === skill\}/);
});

test("the result tray and history keep all existing controls discoverable", () => {
  assert.match(sheetSource, /<RollResultTray result=\{latestRoll\}/);
  assert.match(sheetSource, /<RollHistoryPanel history=\{rollHistory\}/);
  assert.match(sheetSource, /Roll History/);
  assert.match(presentationSource, /Stored only in this browser session/);
  assert.match(presentationSource, /result\.character\.name/);
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

test("refined character header keeps only primary identity and play-card labels", () => {
  assert.doesNotMatch(sheetSource, /className="hero-summary">[\s\S]*Player:/);
  assert.doesNotMatch(sheetSource, /className="hero-identity-details"/);
  assert.doesNotMatch(sheetSource, /className="hero-description"/);
  assert.doesNotMatch(sheetSource, /className="dice-control-symbol"/);
  assert.match(sheetSource, /hero-stat-kicker">AC/);
  assert.match(sheetSource, /hero-stat-kicker">HP/);
  assert.match(cssSource, /\.hero-wealth input\{[\s\S]*width:70px[\s\S]*min-width:70px/);
  assert.match(cssSource, /\.hero-play-panel \.hero-stats\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)/);
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

test("character-header CSS covers responsive, theme, and print requirements", () => {
  assert.match(cssSource, /\.hero\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.06fr\)/);
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
