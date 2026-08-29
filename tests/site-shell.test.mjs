import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the character sheet uses shared navigation with its utilities before signed-in destinations", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const header = await source("app/app-header.tsx");
  const utilityIndex = sheet.indexOf("<SignedInHeader utilities");
  assert.ok(utilityIndex >= 0);
  for (const label of ["Save Now", "Print"]) assert.ok(sheet.indexOf(label, utilityIndex) >= utilityIndex, label);
  const order = ["Account", "My Characters", "My Campaigns", "Sign Out"].map(label => header.indexOf(`"${label}"`));
  assert.ok(order.every(index => index >= 0));
  assert.deepEqual([...order].sort((left, right) => left - right), order);
  assert.match(header, /app-header-utilities/u);
});

test("top navigation omits Public Characters while the feature remains in contextual destinations", async () => {
  const header = await source("app/app-header.tsx");
  const landing = await source("app/landing-page.tsx");
  const account = await source("app/account/account-page.tsx");
  assert.doesNotMatch(header, /Public Characters/u);
  assert.match(landing, /Browse Public Characters/u);
  assert.match(account, /Public Characters/u);
});

test("the root layout supplies one shared footer and old generic page disclaimers are absent", async () => {
  const layout = await source("app/layout.tsx");
  const footer = await source("app/site-footer.tsx");
  const sheet = await source("app/character-sheet.tsx");
  const landing = await source("app/landing-page.tsx");
  const publicPage = await source("app/public-characters/page.tsx");
  assert.match(layout, /<SiteFooter \/>/u);
  assert.match(footer, /packageJson\.version/u);
  assert.match(footer, /Worlds Without Number SRD 1\.0 rules content used under CC0/u);
  for (const page of [sheet, landing, publicPage]) assert.doesNotMatch(page, /Unofficial fan-made character tool|Rules authority:/u);
});
