import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("character sharing is an owner-only bottom-of-folio utility", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const css = await source("app/globals.css");
  const sharingMarker = 'className="character-sharing character-sharing-footer"';
  const sharingIndex = sheet.indexOf(sharingMarker);
  const heroIndex = sheet.indexOf('<div className="hero">');
  const footer = await source("app/site-footer.tsx");

  assert.notEqual(sharingIndex, -1);
  assert.ok(sharingIndex > heroIndex, "sharing should follow the character identity/header");
  assert.doesNotMatch(sheet, /Rules authority:/u);
  assert.match(footer, /Worlds Without Number SRD 1\.0 rules content used under CC0/u);
  assert.equal((sheet.match(/className="character-sharing(?: |")/g) || []).length, 1);
  assert.match(sheet, /cloudId && canEdit && <section className="character-sharing character-sharing-footer"/u);
  assert.match(sheet, /value=\{cloudVisibility\}/u);
  assert.match(sheet, /changeVisibility/u);
  assert.match(sheet, /copyShareLink/u);
  for (const value of ["private", "unlisted", "public"]) {
    assert.match(sheet, new RegExp(`value="${value}"`, "u"));
  }
  assert.ok(css.includes(".folio{"), "folio styles should remain explicit");
  assert.ok(!css.includes("min-height:900px"), "desktop folio should not use a fixed minimum height");
  assert.ok(css.includes("margin:18px 28px 28px"), "sharing should have balanced desktop spacing");
  assert.ok(css.includes("font:14px/1.4 var(--font-body)"), "sharing copy should use readable body text");
  assert.ok(css.includes("margin-top:14px;margin-bottom:20px"), "mobile sharing spacing should remain compact");
});
