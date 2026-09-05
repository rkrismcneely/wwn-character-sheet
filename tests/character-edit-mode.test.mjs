import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const missing = async path => access(new URL(`../${path}`, import.meta.url)).then(() => false, () => true);

test("saved characters lock foundational fields behind Edit Character", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /const buildFieldsEditable = canEdit && \(!cloudId \|\| characterEditMode\)/u);
  for (const key of ["attrs", "skills", "background", "classOne", "classTwo", "focusPicks", "artPicks", "languages"]) assert.match(sheet, new RegExp(`"${key}"`, "u"));
  for (const title of ["Identity", "Base Attributes", "Foci", "Skills", "Languages", "Arts"]) assert.match(sheet, new RegExp(`<Section title="${title}"[^>]*buildControlled`, "u"));
  assert.match(sheet, /data-character-build-control="true"[^>]*aria-label="Character name"/u);
  assert.match(sheet, /data-character-play-state="true"><input type="checkbox" checked={Boolean(sheet.artEffort[i])}/u);
  assert.match(sheet, /disabledForBuildLock = canEdit && !buildFieldsEditable/u);
  assert.match(sheet, /CHARACTER_BUILD_KEY_SET.has(key)/u);
});

test("play state stays outside character-build locking", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /<Section title="Health & Defenses">/u);
  assert.match(sheet, /patch("hpCurrent"/u);
  assert.match(sheet, /patch("strainCurrent"/u);
  assert.match(sheet, /<Section title="Spellbook"/u);
  assert.doesNotMatch(sheet, /<Section title="Spellbook"[^>]*buildControlled/u);
  assert.match(sheet, /<Section title="Notes">/u);
  assert.match(sheet, /patch("notes"/u);
  assert.match(sheet, /tab === "inventory"/u);
});

test("blank creation remains editable until its explicit first save and edit cancel is transactional", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /setCharacterEditMode(mode === "blank")/u);
  assert.match(sheet, /addCurrentToLibrary(fresh, { keepBuildEditing: mode === "blank" })/u);
  assert.match(sheet, /characterEditSnapshot.current = structuredClone(sheet)/u);
  assert.match(sheet, /restoreCharacterBuildFields(current, snapshot)/u);
  assert.match(sheet, /cloudVersion === null \|\| characterEditMode) return/u);
  assert.match(sheet, /setCharacterEditMode(false);[\s\S]*Foundational fields are locked again/u);
});

test("legacy character claiming is removed from active application code", async () => {
  const [sheet, dashboard, identifiers, schema, pkg] = await Promise.all([
    source("app/character-sheet.tsx"), source("app/dashboard-page.tsx"), source("lib/characters/identifiers.ts"), source("db/schema.ts"), source("package.json"),
  ]);
  for (const text of [sheet, dashboard]) {
    assert.doesNotMatch(text, /Claim a legacy character|legacy claim token|\/api\/legacy-claims/iu);
  }
  assert.doesNotMatch(identifiers, /LegacyClaim|legacy claim|claim_/iu);
  assert.doesNotMatch(schema, /legacyCharacterClaim|legacy_character_claim/iu);
  assert.doesNotMatch(pkg, /legacy-claim:/u);
  for (const path of ["app/api/legacy-claims/route.ts", "lib/characters/claims.ts", "scripts/create-legacy-claim.mjs", "scripts/revoke-legacy-claim.mjs"]) assert.equal(await missing(path), true, `${path} should be removed`);
});
