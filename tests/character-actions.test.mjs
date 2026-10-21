import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("character dashboard keeps Duplicate as the first More actions item and Archive second", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard, /<\/Link>\s*<button[^>]*onClick=\{\(\) => void duplicate\(character\)\}/u);
  assert.match(dashboard, /: <details className="dashboard-secondary-actions"><summary>More actions<\/summary><div><button type="button" className="dashboard-secondary" onClick=\{\(\) => void duplicate\(character\)\} disabled=\{working\}>Duplicate<\/button><button type="button" className="dashboard-secondary dashboard-archive" onClick=\{\(\) => void setArchived\(character, true\)\} disabled=\{working\}>\{working \? "Working…" : "Archive character"\}<\/button><\/div><\/details>/u);
  assert.match(dashboard, /window\.confirm\(`Archive \$\{character\.name \|\| "this character"\}\?/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}\/duplicate`, \{ method: "POST" \}\)/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}\/archive`,/u);
});

test("archived character actions are ordered in one menu and reuse permanent deletion", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /character\.archivedAt \? <details className="dashboard-secondary-actions"><summary>More actions<\/summary><div><button type="button" className="dashboard-secondary" onClick=\{\(\) => void setArchived\(character, false\)\} disabled=\{working\}>\{working \? "Working…" : "Restore"\}<\/button><button type="button" className="dashboard-secondary" onClick=\{\(\) => void duplicate\(character\)\} disabled=\{working\}>Duplicate<\/button><button type="button" className="dashboard-secondary dashboard-danger" onClick=\{\(\) => void deleteCharacter\(character\)\} disabled=\{working\}>\{working \? "Working…" : "Delete"\}<\/button><\/div><\/details>/u);
  assert.doesNotMatch(dashboard, /character\.archivedAt \? <><button[^>]*>\{working \? "Working…" : "Restore"\}<\/button>/u);
  assert.match(dashboard, /window\.confirm\(`Delete \$\{characterName\} from My Characters\?\\n\\nThis cannot be undone\.`\)/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}`, \{ method: "DELETE" \}\)/u);
});

test("rest retains sustained Art Effort and recovers scene/day commitments", async () => {
  const { artEffortRestRecovers } = await import("../app/phase2-rules.ts");
  assert.equal(artEffortRestRecovers("Commit Effort for the scene to do something"), true);
  assert.equal(artEffortRestRecovers("Commit Effort for the day; do something"), true);
  assert.equal(artEffortRestRecovers("Commit Effort to gain AC while Effort remains committed"), false);
  assert.equal(artEffortRestRecovers("Commit Effort to perceive thermal gradients in darkness"), false);
  const source = await readFile("app/character-sheet.tsx", "utf8");
  assert.match(source, /sustainedEffort = artEffortTotal\(sheet\.artEffort\) - effort/u);
  assert.match(source, /artEffortRestRecovers\(creationArtForSelection\(availableArts, name\)\?\.text \|\| ""\)/u);
  assert.match(source, /Sustained Art Effort remains committed until released/u);
});

test("Frailty is persistent character state and never cleared by an ordinary rest", async () => {
  const source = await readFile("app/character-sheet.tsx", "utf8");
  assert.match(source, /frail: false,/u);
  assert.match(source, /frail: incoming\.frail === true/u);
  assert.match(source, /checked=\{sheet\.frail\}/u);
  const rest = source.slice(source.indexOf("  function takeRest() {"), source.indexOf("  async function refreshLibrary("));
  assert.doesNotMatch(rest, /frail:/u);
});

test("Frail characters do not recover hit points from ordinary rest", async () => {
  const source = await readFile("app/character-sheet.tsx", "utf8");
  const rest = source.slice(source.indexOf("  function takeRest() {"), source.indexOf("  async function refreshLibrary("));
  assert.match(rest, /const healing = sheet\.frail \? 0 : Math\.max/u);
  assert.match(rest, /current\.frail \? 0 : Math\.max\(0, current\.level \|\| 0\)/u);
  assert.match(rest, /Frail characters cannot heal naturally/u);
  assert.match(rest, /strainCurrent: Math\.max\(0, current\.strainCurrent - \(current\.frail \? 0 : 1\)\)/u);
});



test("Frail characters also cannot recover System Strain through sleep", async () => {
  const source = await readFile("app/character-sheet.tsx", "utf8");
  const rest = source.slice(source.indexOf("  function takeRest() {"), source.indexOf("  async function refreshLibrary("));
  assert.match(rest, /const strainRecovery = !sheet\.frail && sheet\.strainCurrent > 0 \? 1 : 0/u);
  assert.match(rest, /current\.strainCurrent - \(current\.frail \? 0 : 1\)/u);
  assert.match(rest, /Frail characters cannot recover Strain naturally/u);
});

test("Health and Defenses retains a concise Frail toggle without First Aid panel", async () => {
  const source = await readFile("app/character-sheet.tsx", "utf8");
  assert.match(source, /checked=\{sheet\.frail\}[^\n]*\/> Frail<\/label>/u);
  assert.doesNotMatch(source, /aria-label="WWN first aid"/u);
  assert.doesNotMatch(source, /Roll First Aid \(1d6 \+ Heal\)/u);
});

test("Situational Focus Abilities appears below Foci in the same character-sheet column", async () => {
  const source = await readFile("app/character-sheet.tsx", "utf8");
  const weapons = source.indexOf('<Section title="Weapons"');
  const foci = source.indexOf('<Section title="Foci"');
  const situational = source.indexOf('title="Situational Focus Abilities"');
  const skills = source.indexOf('<div className="stack skills-column">');
  assert.ok(weapons >= 0 && foci > weapons && situational > foci && skills > situational);
});

test("Frail checkbox shares the Strain maximum grid cell", async () => {
  const sheet = await readFile("app/character-sheet.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");
  assert.match(sheet, /className="strain-max-frail"/u);
  assert.match(sheet, /className="strain-frail-toggle"/u);
  assert.match(css, /\.vitals \.strain-max-frail\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/u);
});

test("Expert Quick Learner points cannot buy extra combat skill ranks", async () => {
  const sheet = await readFile("app/character-sheet.tsx", "utf8");
  assert.match(sheet, /const combatSkillBudget = Math\.max\(0, effectiveLevel - 1\) \* 3/u);
  assert.match(sheet, /selectedClasses\.includes\("Expert"\) && combatSkillSpending\(values\) > combatSkillBudget/u);
  assert.match(sheet, /exceedsCombatSkillBudget\(nextPurchases\)/u);
  assert.match(sheet, /plan\.freePickValue/u);
});
