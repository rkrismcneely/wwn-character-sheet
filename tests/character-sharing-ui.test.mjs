import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

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
  assert.match(sheet, /value=\{cloudVisibility\}/u);
  assert.match(sheet, /changeVisibility/u);
  assert.match(sheet, /copyShareLink/u);
  for (const value of ["private", "unlisted", "public"]) {
    assert.match(sheet, new RegExp(`value="${value}"`, "u"));
  }
  assert.doesNotMatch(sheet, /character-sharing-footer/u);
  assert.doesNotMatch(css, /legacy-claim/u);
  assert.ok(css.includes('.library-search button,\n.library-signin button,\n.character-sharing button,\n.read-only-banner button{'));
  assert.match(css, /\.character-bottom-utilities\{/u);
  assert.match(css, /@media\(max-width:720px\)[\s\S]*\.character-bottom-utilities\{[^}]*flex-wrap:wrap/u);
});
