import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { characterSaveDisposition } from "../app/pending-character-save.ts";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("character save states distinguish safe, pending, and failed navigation", () => {
  assert.equal(characterSaveDisposition("Saved online at 8:42 AM"), "safe");
  assert.equal(characterSaveDisposition("Loaded online"), "safe");
  assert.equal(characterSaveDisposition("Unsaved changes"), "pending");
  assert.equal(characterSaveDisposition("Saving online…"), "pending");
  assert.equal(characterSaveDisposition("Applying level-up…"), "pending");
  assert.equal(characterSaveDisposition("Not saved online"), "failed");
  assert.equal(characterSaveDisposition("Newer online copy found"), "failed");
});

test("signed-in navigation waits for character autosave instead of unmounting the sheet", async () => {
  const [header, sheet] = await Promise.all([
    source("app/app-header.tsx"),
    source("app/character-sheet.tsx"),
  ]);

  assert.match(sheet, /setSaved\("Unsaved changes"\)/u);
  assert.match(sheet, /setTimeout\(\(\) => \{ void saveToCloud\(\); \}, 1200\)/u);
  assert.match(header, /document\.addEventListener\("click", handleNavigationClick, true\)/u);
  assert.match(header, /event\.preventDefault\(\);[\s\S]*waitForPendingCharacterSave\(\)[\s\S]*if \(saved\) window\.location\.assign\(destination\.href\)/u);
  assert.match(header, /window\.addEventListener\("beforeunload", handleBeforeUnload\)/u);
  assert.match(header, /const safeToLeave = await waitForPendingCharacterSave\(\);[\s\S]*if \(!safeToLeave\)/u);
});
