import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Account is authenticated and renders a server-loaded profile without an auth flash", async () => {
  const page = await source("app/account/page.tsx");
  assert.match(page, /getSessionActor/u);
  assert.match(page, /if \(!actor\) redirect\("\/"\)/u);
  assert.match(page, /readAccountProfile/u);
  assert.match(page, /<AccountPageClient initialProfile=\{profile\}/u);
});

test("Account supports a custom username, original-profile fallback, and prominent signed-in destinations", async () => {
  const account = await source("app/account/account-page.tsx");
  for (const copy of [
    "Username",
    "Save Username",
    "Use Original Name",
    "Original profile name",
    "My Characters",
    "My Campaigns",
    "Public Characters",
  ]) assert.equal(account.includes(copy), true, copy);
  assert.match(account, /fetch\("\/api\/account\/profile"/u);
  assert.match(account, /method: "PATCH"/u);
  assert.match(account, /method: "DELETE"/u);
  assert.doesNotMatch(account, /userId|ownerUserId|Authorization|token/u);
});

test("profile API derives the target from the authenticated session only", async () => {
  const route = await source("app/api/account/profile/route.ts");
  assert.match(route, /getSessionActor\(request\)/u);
  assert.match(route, /updateAccountDisplayName/u);
  assert.match(route, /resetAccountDisplayName/u);
  assert.doesNotMatch(route, /body\?\.(userId|email|role)|ownerUserId|Authorization/u);
});

test("signed-in header and canonical brand unify Account, characters, and campaigns without a persistent public-archive link", async () => {
  const header = await source("app/app-header.tsx");
  const dashboard = await source("app/dashboard-page.tsx");
  const campaigns = await source("app/campaigns/campaign-dashboard.tsx");
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const sheet = await source("app/character-sheet.tsx");
  for (const copy of ["Account", "My Characters", "My Campaigns", "Sign Out"]) {
    assert.equal(header.includes(copy), true, copy);
  }
  assert.match(header, /<TalesBrandLink href="\/account"/u);
  assert.match(dashboard, /<SignedInHeader active="characters"/u);
  assert.match(campaigns, /<SignedInHeader active="campaigns"/u);
  assert.match(detail, /<SignedInHeader active="campaigns"/u);
  assert.match(sheet, /<SignedInHeader utilities=\{<>/u);
  assert.doesNotMatch(header, /link\("public", "\/public-characters", "Public Characters"\)/u);
  assert.match(sheet, /\{!signedIn && <button className="library-button"/u);
});

test("campaign display projections use the shared application display-name helper", async () => {
  const service = await source("lib/campaigns/service.ts");
  const characters = await source("lib/campaigns/characters.ts");
  for (const file of [service, characters]) {
    assert.match(file, /effectiveDisplayName/u);
    assert.match(file, /display_name AS customDisplayName/u);
  }
});
