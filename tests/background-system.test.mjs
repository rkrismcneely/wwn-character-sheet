import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function cssSources(directory = "app") {
  const directoryUrl = new URL(`../${directory}/`, import.meta.url);
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return cssSources(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [await source(path)] : [];
  }));
  return nested.flat();
}

test("the background system owns every site shell without temporary overrides", async () => {
  const globals = await source("app/globals.css");

  assert.equal((globals.match(/Background system: shared light and dark page\/surface artwork\./gu) || []).length, 1);
  assert.match(globals, /--twe-background-light:url\("\/assets\/tales-without-end-light-background-20260920\.png"\)/u);
  assert.match(globals, /html\[data-theme="dark"\]\{[\s\S]*--twe-page-background:var\(--twe-background-dark\)/u);

  for (const shell of [
    "dashboard-shell",
    "campaign-shell",
    "account-shell",
    "gm-console-shell",
    "landing-shell",
    "landing-codex",
    "folio",
    "library-panel",
    "campaign-store-drawer",
  ]) {
    assert.match(globals, new RegExp(`\\.${shell}`, "u"), shell);
  }

  const allCss = (await cssSources()).join("\n");
  assert.doesNotMatch(globals, /Use the current parchment map|Ensure every page shell|!important;[\s\S]{0,120}tales-without-end-light-background/u);
  assert.doesNotMatch(allCss, /amber-ledger-parchment-bg\.png|wwn-ledger-background-v2\.png/u);
});

test("the canonical light background asset is present", async () => {
  await access(new URL("../public/assets/tales-without-end-light-background-20260920.png", import.meta.url));
});
