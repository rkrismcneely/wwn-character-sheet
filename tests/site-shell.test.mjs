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
  const accountCss = await source("app/account/account.css");
  const dashboardCss = await source("app/dashboard.css");
  const campaignCss = await source("app/campaigns/campaign-ui.css");
  assert.match(layout, /<SiteFooter \/>/u);
  const css = await source("app/globals.css");
  assert.match(layout, /className="site-shell"/u);
  assert.match(layout, /className="site-main"/u);
  assert.match(css, /\.site-shell\{[\s\S]*?width:100%;[\s\S]*?min-height:100vh;min-height:100dvh;display:flex;flex-direction:column/u);
  assert.match(css, /\.site-main\{[\s\S]*?flex:1 1 auto;[\s\S]*?display:flex/u);
  assert.match(css, /@media print\{\.site-shell,\.site-main\{display:block;min-height:0\}\}/u);
  assert.doesNotMatch(css, /\.site-footer\{[^}]*position\s*:/u);
  for (const routeCss of [accountCss, dashboardCss, campaignCss]) assert.match(routeCss, /min-height:100%/u);
  assert.doesNotMatch(campaignCss, /\.campaign-shell\{[\s\S]*?min-height:100vh/u);
  assert.doesNotMatch(accountCss, /min-height:100vh/u);
  assert.doesNotMatch(dashboardCss, /min-height:100vh/u);
  assert.match(footer, /packageJson\.version/u);
  assert.match(footer, /Worlds Without Number SRD 1\.0 rules content used under CC0/u);
  for (const page of [sheet, landing, publicPage]) assert.doesNotMatch(page, /Unofficial fan-made character tool|Rules authority:/u);
});
