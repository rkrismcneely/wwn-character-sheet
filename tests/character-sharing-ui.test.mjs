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
  const footerIndex = sheet.indexOf("<footer>Rules authority:");

  assert.notEqual(sharingIndex, -1);
  assert.ok(sharingIndex > heroIndex, "sharing should follow the character identity/header");
  assert.ok(sharingIndex < footerIndex, "sharing should remain inside the folio before its footer");
  assert.equal((sheet.match(/className="character-sharing/g) || []).length, 1);
  assert.match(sheet, /cloudId && canEdit && <section className="character-sharing character-sharing-footer"/u);
  assert.match(sheet, /value=\{cloudVisibility\}/u);
  assert.match(sheet, /changeVisibility/u);
  assert.match(sheet, /copyShareLink/u);
  for (const value of ["private", "unlisted", "public"]) {
    assert.match(sheet, new RegExp(`value="${value}"`, "u"));
  }
  assert.match(css, /\.character-sharing-footer\{[\\s\\S]*grid-template-columns:/u);
  assert.match(css, /\.character-sharing-footer\{grid-template-columns:1fr\}/u);
});
