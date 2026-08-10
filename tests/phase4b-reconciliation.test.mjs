import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = path => readFile(resolve(root, path), "utf8");

test("Tales Without End branding survives Phase 4B reconciliation", async () => {
  const [page, layout, css] = await Promise.all([
    source("app/page.tsx"),
    source("app/layout.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(page, /tales-without-end-navigation-logo\.svg/u);
  assert.match(page, /<strong>Tales Without End<\/strong>/u);
  assert.doesNotMatch(page, /<strong>WORLDS WITHOUT NUMBER<\/strong>/u);
  assert.doesNotMatch(page, /Interactive character folio<\/small>/u);
  assert.match(page, /authClient\.signIn\.social/u);
  assert.match(page, /authClient\.signOut/u);
  assert.match(layout, /metadataBase: new URL\(CANONICAL_ORIGIN\)/u);
  assert.match(layout, /title: "Tales Without End - An Interactive Worlds Without Number Character Folio"/u);
  assert.match(css, /\.brand-logo\{[\s\S]*width:72px;[\s\S]*height:42px/u);
  assert.match(css, /\.brand strong\{\n  font-size:24px;\n  font-weight:600;\n  letter-spacing:\.06em;\n  white-space:nowrap;\n\}/u);
  assert.match(css, /\.brand strong\{font-size:17px;letter-spacing:\.04em\}/u);
  assert.match(css, /\.brand strong\{font-size:16px;letter-spacing:\.02em\}/u);
  assert.match(css, /html\{[^}]*overflow-x:hidden/u);
  assert.match(css, /body\{[^}]*overflow-x:hidden/u);
});

test("legacy claim creation preserves recovery material before D1 mutation", async () => {
  const claim = await source("scripts/create-legacy-claim.mjs");
  const section = claim.slice(claim.indexOf("const statements ="));
  const writeIndex = section.indexOf("writeFileSync(");
  const executeIndex = section.indexOf('executeD1(statements.join("\\n"), remote)');
  assert.ok(writeIndex >= 0 && executeIndex > writeIndex);
  assert.match(section, /flag: "wx", mode: 0o600/u);
  assert.match(section, /Claim database creation failed after reserving/u);
  assert.doesNotMatch(section, /console\.log\(\s*token\s*\)/u);
});
