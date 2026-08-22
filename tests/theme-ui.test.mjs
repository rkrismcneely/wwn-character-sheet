import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the display theme is a root-level persistent preference", async () => {
  const layout = await source("app/layout.tsx");
  const provider = await source("app/theme-provider.tsx");

  assert.match(layout, /<ThemeProvider>\{children\}<\/ThemeProvider>/u);
  assert.match(layout, /dangerouslySetInnerHTML/u);
  assert.match(layout, /localStorage\.getItem\("wwn-display-theme"\)/u);
  assert.match(provider, /DISPLAY_THEME_STORAGE_KEY = "wwn-display-theme"/u);
  assert.match(provider, /localStorage\.setItem\(DISPLAY_THEME_STORAGE_KEY, nextTheme\)/u);
  assert.match(provider, /document\.documentElement\.dataset\.theme = theme/u);
  assert.match(provider, /document\.documentElement\.style\.colorScheme = theme/u);
});

test("Account owns the accessible theme control and character sheets no longer duplicate it", async () => {
  const account = await source("app/account/account-page.tsx");
  const sheet = await source("app/character-sheet.tsx");
  const headerCss = await source("app/app-header.css");

  assert.match(account, /<h2 id="appearance-title">Appearance<\/h2>/u);
  assert.match(account, /<label htmlFor="account-display-theme">Theme<\/label>/u);
  assert.match(account, /<ThemeSelect[\s\S]*id="account-display-theme"/u);
  assert.match(account, /Applies immediately across your characters, campaigns, account, and public archive\./u);
  assert.doesNotMatch(sheet, /wwn-display-theme|theme-picker|Display theme/u);
  assert.doesNotMatch(headerCss, /theme-picker/u);
});

test("sitewide dark styling covers signed-in, public, and campaign surfaces without touching sign-out", async () => {
  const globals = await source("app/globals.css");
  const header = await source("app/app-header.tsx");
  const sheet = await source("app/character-sheet.tsx");

  for (const surface of [
    "app-header",
    "account-shell",
    "dashboard-shell",
    "campaign-shell",
    "landing-shell",
    "public-library-page",
    "campaign-resource-card",
  ]) {
    assert.ok(
      globals.includes(`html[data-theme="dark"] .${surface}`),
      `dark theme must style ${surface}`,
    );
  }

  for (const control of [
    "Account",
    "Save Now",
    "Export Character",
    "Import Character",
    "Sign Out",
    "Print / PDF",
  ]) {
    assert.ok(sheet.includes(control), `character header must retain ${control}`);
  }
  assert.doesNotMatch(header, /removeItem\("wwn-display-theme"\)|clear\(\)/u);
});
