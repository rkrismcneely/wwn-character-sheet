import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  characterContentFingerprint,
  duplicateCharacterSummary,
  duplicateSummariesMatch,
  isLikelyDuplicateCharacter,
} from "../lib/characters/duplicate-warning.ts";
import { parseCharacterImport } from "../lib/characters/sanitize.ts";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const character = {
  name: "Mara of the Lantern Road",
  player: "Kris",
  classMode: "full",
  classOne: "Expert",
  level: 3,
  attrs: { STR: 10, DEX: 14, CON: 12, INT: 13, WIS: 11, CHA: 9 },
  skills: { Notice: 1, Connect: 1 },
  portrait: "",
};

test("an exact reimport is a high-confidence likely duplicate", () => {
  const parsed = parseCharacterImport({
    format: "wwn-character-sheet",
    version: 2,
    exportedAt: "2026-08-16T00:00:00.000Z",
    character,
  });
  assert.ok(parsed);
  assert.equal(isLikelyDuplicateCharacter(parsed.character, structuredClone(character)), true);
  assert.equal(
    characterContentFingerprint(parsed.character),
    characterContentFingerprint({ ...structuredClone(character), portrait: "/api/portraits/opaque.webp" }),
  );
});

test("renamed, differently levelled, and same-name unrelated characters do not warn", () => {
  assert.equal(isLikelyDuplicateCharacter(character, { ...character, level: 4 }), false);
  assert.equal(isLikelyDuplicateCharacter(character, { ...character, name: "Mara the Wayfinder" }), false);
  assert.equal(isLikelyDuplicateCharacter(character, { ...character, player: "Another Player" }), false);
  assert.equal(isLikelyDuplicateCharacter(character, { ...character, classOne: "Warrior" }), false);
  assert.equal(
    isLikelyDuplicateCharacter(character, {
      ...character,
      attrs: { ...character.attrs, DEX: 9 },
    }),
    false,
    "matching summary fields alone must not trigger the warning",
  );
});

test("duplicate summary matching requires more than a shared character name", () => {
  const incoming = duplicateCharacterSummary(character);
  const unrelated = duplicateCharacterSummary({
    ...character,
    player: "Someone Else",
    classOne: "High Mage",
    level: 1,
  });
  assert.ok(incoming);
  assert.ok(unrelated);
  assert.equal(duplicateSummariesMatch(incoming, unrelated), false);
  assert.equal(duplicateCharacterSummary({ name: character.name }), null);
});

test("the dashboard defers duplicate creation until Import Anyway", async () => {
  const dashboard = await source("app/dashboard-page.tsx");
  assert.equal((dashboard.match(/fetch\("\/api\/characters\/import"/gu) || []).length, 1);
  assert.match(
    dashboard,
    /if \(match\) \{\s*setPendingImport\(\{ body, match \}\);\s*return;\s*\}/u,
  );
  assert.match(
    dashboard,
    /async function confirmDuplicateImport\(\)[\s\S]*await submitImport\(pending\.body\)/u,
  );

  const cancelStart = dashboard.indexOf("function cancelDuplicateImport()");
  const confirmStart = dashboard.indexOf("async function confirmDuplicateImport()");
  const cancelSection = dashboard.slice(cancelStart, confirmStart);
  assert.match(cancelSection, /setPendingImport\(null\)/u);
  assert.doesNotMatch(cancelSection, /fetch\(|submitImport/u);

  for (const copy of [
    "Possible Duplicate Character",
    "You already have a character that appears to match this import.",
    "Import Anyway",
    "Cancel",
    "creates a separate private character",
    "leaves the existing character unchanged",
  ]) {
    assert.equal(dashboard.includes(copy), true, copy);
  }
});

test("Import Anyway retains the existing fresh-private secure import path", async () => {
  const [dashboard, route, database, sanitizer] = await Promise.all([
    source("app/dashboard-page.tsx"),
    source("app/api/characters/import/route.ts"),
    source("app/api/characters/db.ts"),
    source("lib/characters/sanitize.ts"),
  ]);

  assert.match(dashboard, /await submitImport\(pending\.body\)/u);
  assert.match(route, /getSessionActor\(request\)[\s\S]*if \(!actor\)[\s\S]*status: 401/u);
  assert.match(route, /parseCharacterImport\(await readBoundedJson\(request\)\)/u);
  assert.match(route, /createOwnedCharacter\([\s\S]*actor\.userId,[\s\S]*imported\.character/u);
  assert.match(database, /const publicId = generatePublicCharacterId\(\)/u);
  assert.match(database, /crypto\.randomUUID\(\)/u);
  assert.match(database, /VALUES \(\?, \?, \?, 'private', NULL/u);
  assert.doesNotMatch(route, /UPDATE characters|DELETE FROM characters/u);
  assert.match(sanitizer, /characterForStorage[\s\S]*clean\.portrait = ""/u);
});

test("malformed imports retain the current server rejection path", async () => {
  assert.equal(parseCharacterImport({
    format: "wwn-character-sheet",
    version: 99,
    character,
  }), null);

  const [dashboard, route] = await Promise.all([
    source("app/dashboard-page.tsx"),
    source("app/api/characters/import/route.ts"),
  ]);
  assert.match(
    dashboard,
    /const supportedImport = parseCharacterImport\(parsed\);[\s\S]*if \(supportedImport\)[\s\S]*await submitImport\(body\)/u,
  );
  assert.match(route, /Unsupported or malformed character export\.[\s\S]*status: 422/u);
});
