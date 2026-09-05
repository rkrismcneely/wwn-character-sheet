import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const replaceOnceIfNeeded = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected one ${label} target, found ${count}`);
  return source.replace(oldText, newText);
};

let sheet = await readFile("app/character-sheet.tsx", "utf8");
sheet = replaceOnceIfNeeded(
  sheet,
  `        </section> : wizardOpen ? <GuidedCreationWizard\n          sheet={sheet}\n          canEdit={canEdit}\n          persistenceKey={cloudId || "new-character"}`,
  `        </section> : wizardOpen ? <GuidedCreationWizard\n          sheet={sheet}\n          canEdit={canEdit && (creationEntry === "guided" || characterEditMode)}\n          persistenceKey={cloudId || "new-character"}`,
  "guided wizard edit boundary",
);
sheet = replaceOnceIfNeeded(
  sheet,
  `        {signedIn && canEdit && creationEntry !== "choose" && sheet.level === 1 && <div className="character-sheet-guided-action" data-readonly-interactive="true">\n          <button type="button" onClick={() => setGuidedCreationMode(true)}>Guided Creation</button>\n        </div>}`,
  `        {signedIn && canEdit && creationEntry !== "choose" && sheet.level === 1 && (creationEntry === "guided" || characterEditMode) && <div className="character-sheet-guided-action" data-readonly-interactive="true">\n          <button type="button" onClick={() => setGuidedCreationMode(true)}>Guided Creation</button>\n        </div>}`,
  "guided action edit boundary",
);
await writeFile("app/character-sheet.tsx", sheet);

const mainSchema = execFileSync("git", ["show", "origin/main:db/schema.ts"], { encoding: "utf8" });
await writeFile("db/schema.ts", mainSchema);

await writeFile("tests/character-edit-mode.test.mjs", `import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(\`../\${path}\`, import.meta.url), "utf8");
const missing = async path => access(new URL(\`../\${path}\`, import.meta.url)).then(() => false, () => true);

test("saved characters lock foundational fields behind Edit Character", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /const buildFieldsEditable = canEdit && \\(!cloudId \\|\\| characterEditMode\\)/u);
  for (const key of ["attrs", "skills", "background", "classOne", "classTwo", "focusPicks", "artPicks", "languages"]) {
    assert.ok(sheet.includes(\`"\${key}"\`), \`\${key} should be classified as character-building data\`);
  }
  for (const title of ["Identity", "Base Attributes", "Foci", "Skills", "Languages", "Arts"]) {
    assert.match(sheet, new RegExp(\`<Section title="\${title}"[^>]*buildControlled\`, "u"));
  }
  assert.ok(sheet.includes('data-character-build-control="true" rows={1} value={sheet.name}'));
  assert.ok(sheet.includes('data-character-play-state="true"><input type="checkbox" checked={Boolean(sheet.artEffort[i])}'));
  assert.match(sheet, /disabledForBuildLock = canEdit && !buildFieldsEditable/u);
  assert.match(sheet, /CHARACTER_BUILD_KEY_SET\\.has\\(key\\)/u);
});

test("play state stays outside character-build locking", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /<Section title="Health & Defenses">/u);
  assert.match(sheet, /patch\\("hpCurrent"/u);
  assert.match(sheet, /patch\\("strainCurrent"/u);
  assert.match(sheet, /<Section title="Spellbook"/u);
  assert.doesNotMatch(sheet, /<Section title="Spellbook"[^>]*buildControlled/u);
  assert.match(sheet, /<Section title="Notes">/u);
  assert.match(sheet, /patch\\("notes"/u);
  assert.match(sheet, /tab === "inventory"/u);
});

test("blank creation remains editable until its explicit first save and edit cancel is transactional", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.match(sheet, /setCharacterEditMode\\(mode === "blank"\\)/u);
  assert.ok(sheet.includes('addCurrentToLibrary(fresh, { keepBuildEditing: mode === "blank" })'));
  assert.match(sheet, /characterEditSnapshot\\.current = structuredClone\\(sheet\\)/u);
  assert.match(sheet, /restoreCharacterBuildFields\\(current, snapshot\\)/u);
  assert.ok(sheet.includes('cloudVersion === null || characterEditMode) return'));
  assert.match(sheet, /setCharacterEditMode\\(false\\);[\\s\\S]*Foundational fields are locked again/u);
});

test("guided creation cannot bypass the saved-character edit boundary", async () => {
  const sheet = await source("app/character-sheet.tsx");
  assert.ok(sheet.includes('canEdit={canEdit && (creationEntry === "guided" || characterEditMode)}'));
  assert.ok(sheet.includes('sheet.level === 1 && (creationEntry === "guided" || characterEditMode)'));
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
    assert.doesNotMatch(text, /Claim a legacy character|legacy claim token|\\/api\\/legacy-claims/iu);
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
    assert.equal(await missing(path), true, \`\${path} should be removed\`);
  }
});
`);

await writeFile("tests/character-sharing-ui.test.mjs", `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(\`../\${path}\`, import.meta.url), "utf8");

test("character management is consolidated into one owner-only bottom utility bar", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const css = await source("app/globals.css");
  const marker = 'className="character-bottom-utilities"';
  const utilityIndex = sheet.indexOf(marker);
  const heroIndex = sheet.indexOf('<div className="hero">');

  assert.notEqual(utilityIndex, -1);
  assert.ok(utilityIndex > heroIndex, "character utilities should follow the character sheet content");
  assert.equal((sheet.match(/className="character-bottom-utilities"/g) || []).length, 1);
  assert.match(sheet, /cloudId && canEdit && <section className="character-bottom-utilities"/u);
  assert.ok(sheet.includes('>Edit Character</button>'));
  assert.ok(sheet.includes('>Save Character</button>'));
  assert.ok(sheet.includes('>Cancel</button>'));
  assert.ok(sheet.includes('Campaigns ({campaignLinks.length})'));
  assert.match(sheet, /value=\\{cloudVisibility\\}/u);
  assert.match(sheet, /changeVisibility/u);
  assert.match(sheet, /copyShareLink/u);
  for (const value of ["private", "unlisted", "public"]) {
    assert.match(sheet, new RegExp(\`value="\${value}"\`, "u"));
  }
  assert.doesNotMatch(sheet, /character-sharing-footer/u);
  assert.match(css, /\\.character-bottom-utilities\\{/u);
  assert.match(css, /@media\\(max-width:720px\\)[\\s\\S]*\\.character-bottom-utilities\\{[^}]*flex-wrap:wrap/u);
});
`);

console.log("Action Bundle 5 finalization complete.");
