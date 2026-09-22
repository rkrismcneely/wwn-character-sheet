import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const missing = async path => access(new URL(`../${path}`, import.meta.url)).then(() => false, () => true);

test("saved characters lock foundational fields behind Edit Character", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /const buildFieldsEditable = canEdit && \(!cloudId \|\| characterEditMode\)/u);
  for (const key of ["attrs", "skills", "background", "classOne", "classTwo", "focusPicks", "artPicks", "languages"]) {
    assert.ok(sheet.includes(`"${key}"`), `${key} should be classified as character-building data`);
  }
  for (const title of ["Identity", "Base Attributes", "Background & Class Benefits", "Foci", "Skills", "Languages", "Arts"]) {
    assert.match(sheet, new RegExp(`<Section title="${title}"[^>]*buildControlled`, "u"));
  }
  assert.ok(sheet.includes('data-character-build-control="true" rows={1} value={sheet.name}'));
  assert.ok(sheet.includes('className="art-effort-control" data-character-play-state="true"'));
  assert.match(sheet, /disabledForBuildLock = canEdit && !buildFieldsEditable/u);
  assert.match(sheet, /CHARACTER_BUILD_KEY_SET\.has\(key\)/u);
});

test("play state stays outside character-build locking", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /<Section title="Health & Defenses">/u);
  assert.match(sheet, /patch\("hpCurrent"/u);
  assert.match(sheet, /patch\("strainCurrent"/u);
  assert.match(sheet, /<Section title="Spellbook"/u);
  assert.doesNotMatch(sheet, /<Section title="Spellbook"[^>]*buildControlled/u);
  assert.match(sheet, /<Section title="Notes">/u);
  assert.match(sheet, /patch\("notes"/u);
  assert.match(sheet, /tab === "inventory"/u);
});

test("blank creation remains editable until its explicit first save and edit cancel is transactional", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /setCharacterEditMode\(mode === "blank"\)/u);
  assert.ok(sheet.includes('addCurrentToLibrary(fresh, { keepBuildEditing: mode === "blank" })'));
  assert.match(sheet, /characterEditSnapshot\.current = structuredClone\(sheet\)/u);
  assert.match(sheet, /restoreCharacterBuildFields\(current, snapshot\)/u);
  assert.ok(sheet.includes('cloudVersion === null || characterEditMode) return'));
  assert.match(sheet, /setCharacterEditMode\(false\);[\s\S]*Foundational fields are locked again/u);
});

test("guided creation cannot bypass the saved-character edit boundary", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.ok(sheet.includes('canEdit={canEdit && (creationEntry === "guided" || characterEditMode)}'));
  assert.match(sheet, /sheet\.level === 1 && !levelOneStatus\.canFinish/);
  assert.match(sheet, /setCreationEntry\("guided"\); setGuidedCreationMode\(true\)/);
  assert.match(sheet, /guidedCreationNewRecord\.current = false;[\s\S]*setCreationEntry\("none"\)/);
});

test("legacy character claiming is removed from active application code while historical DB schema remains represented", async () => {
  const [sheet, dashboard, identifiers, schema, pkg] = await Promise.all([
    source("app/character-sheet.tsx"),
    source("app/dashboard-page.tsx"),
    source("lib/characters/identifiers.ts"),
    source("db/schema.ts"),
    source("package.json"),
  ]);
  for (const text of [sheet, dashboard]) {
    assert.doesNotMatch(text, /Claim a legacy character|legacy claim token|\/api\/legacy-claims/iu);
  }
  assert.doesNotMatch(identifiers, /LegacyClaim|legacy claim|claim_/iu);
  assert.match(schema, /legacyCharacterClaims/u, "historical tables should remain in Drizzle schema to avoid destructive schema drift");
  assert.doesNotMatch(pkg, /legacy-claim:/u);
  for (const path of [
    "app/api/legacy-claims/route.ts",
    "lib/characters/claims.ts",
    "scripts/create-legacy-claim.mjs",
    "scripts/revoke-legacy-claim.mjs",
  ]) {
    assert.equal(await missing(path), true, `${path} should be removed`);
  }
});
