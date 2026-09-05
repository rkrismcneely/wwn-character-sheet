import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("signed-in dashboard uses the owner-scoped character API", async () => {
  const dashboard = await source("app/dashboard-page.tsx");
  const header = await source("app/app-header.tsx");
  assert.match(dashboard, /\/api\/characters\?scope=mine/u);
  assert.match(dashboard, /href=\{`\/character\/\$\{character\.id\}`\}/u);
  assert.match(header, /authClient\.signOut/u);
  assert.match(dashboard, /Browse Public Characters/u);
  assert.match(header, /link\("campaigns", "\/campaigns", "My Campaigns"\)/u);
  assert.match(header, /My Campaigns/u);
  assert.match(dashboard, /Create New Character/u);
  assert.doesNotMatch(dashboard, /ownerUserId|owner_user_id|sessionToken|accessToken|refreshToken|Authorization/u);
});

test("dashboard exposes useful roster and empty states without legacy claiming", async () => {
  const dashboard = await source("app/dashboard-page.tsx");
  const header = await source("app/app-header.tsx");
  for (const copy of [
    "My Characters",
    "Character roster",
    "Open character",
    "Visibility",
    "Updated",
    "Your roster is waiting",
  ]) assert.equal(dashboard.includes(copy), true, copy);
  assert.equal(header.includes("Sign Out"), true);
  assert.doesNotMatch(dashboard, /legacy claim|legacy-claims|One-time claim code/iu);
});

test("dashboard and character sheet no longer expose portable import/export tools", async () => {
  const dashboard = await source("app/dashboard-page.tsx");
  const sheet = await source("app/character-sheet.tsx");
  for (const sourceText of [dashboard, sheet]) {
    assert.doesNotMatch(sourceText, /Character tools|Import Character|Export Character|\/api\/characters\/import/u);
  }
});

test("the create action offers guided and blank character-sheet flows without changing direct routes", async () => {
  const page = await source("app/page.tsx");
  const sheet = await source("app/character-sheet.tsx");
  const characterPage = await source("app/character/[publicId]/page.tsx");
  assert.match(page, /searchParams/u);
  assert.match(page, /params\?\.new === "1"/u);
  assert.match(sheet, /startNew\?: boolean/u);
  assert.match(sheet, /createBlankSheet\(\)/u);
  assert.match(sheet, /Guided Creation/u);
  assert.match(sheet, /Blank Character/u);
  assert.match(characterPage, /<CharacterSheet initialCharacter=\{payload\} \/>/u);
});

test("dashboard data remains a summary and does not render ownership or auth fields", async () => {
  const dashboard = await source("app/dashboard-page.tsx");
  assert.match(dashboard, /name: string/u);
  assert.match(dashboard, /classLabel: string/u);
  assert.match(dashboard, /visibility: CharacterVisibility/u);
  assert.doesNotMatch(dashboard, /email|ownerUserId|owner_user_id|sessionToken|accessToken|refreshToken|rawHeaders/u);
});
