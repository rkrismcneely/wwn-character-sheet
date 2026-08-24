import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sheetSource = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
const presentationSource = await readFile(new URL("../app/roll-presentation.tsx", import.meta.url), "utf8");

test("all character-sheet dice affordances use the shared roll request pipeline", () => {
  assert.match(sheetSource, /resolveRoll\(request\)/);
  assert.doesNotMatch(sheetSource, /from "\.\/dice"/);
  assert.match(sheetSource, /label: `\$\{skill\} \(\$\{attribute\}\) Check`/);
  assert.match(sheetSource, /label: `\$\{name\} Attack`/);
  assert.match(sheetSource, /label: `\$\{name\} Damage`/);
  assert.match(sheetSource, /targetKind: "saving-throw"/);
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
  assert.match(sheetSource, /className="hero-roll-utility"/);
  assert.match(sheetSource, /Roll Attack/);
  assert.match(sheetSource, /Roll Damage/);
  for (const attribute of ["STR", "DEX", "CON", "INT", "WIS", "CHA"]) {
    assert.ok(sheetSource.includes(attribute), `${attribute} remains available to the chooser`);
  }
});
