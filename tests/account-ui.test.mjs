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

test("Account keeps the Tales Without End username control compact and removes provider-name concepts", async () => {
  const account = await source("app/account/account-page.tsx");
  for (const copy of [
    "Username",
    "Save",
    "My Characters",
    "My Campaigns",
    "Public Characters",
  ]) assert.equal(account.includes(copy), true, copy);
  assert.doesNotMatch(account, /Use Original Name|Original profile name|resetToProviderName/u);
  assert.match(account, /className="account-name-entry"[\s\S]*<input[\s\S]*<button type="submit" className="account-primary"/u);
  assert.match(account, /<section className="account-panel account-appearance"[\s\S]*<ConnectedAccounts \/>/u);
  assert.match(account, /fetch\("\/api\/account\/profile"/u);
  assert.match(account, /method: "PATCH"/u);
  assert.doesNotMatch(account, /userId|ownerUserId|Authorization|token/u);
});

test("Account compresses connected accounts and keeps archived deletion visually distinct", async () => {
  const accountCss = await source("app/account/account.css");
  const dashboardCss = await source("app/dashboard.css");
  const globals = await source("app/globals.css");

  assert.match(accountCss, /account-name-entry\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/u);
  assert.match(accountCss, /account-connections-panel\{padding-block:18px 20px\}/u);
  assert.match(accountCss, /account-connection \+ \.account-connection\{border-top:1px solid/u);
  assert.match(dashboardCss, /dashboard-card-actions \.dashboard-danger\{background:#713e2f;border-color:#a36550;color:#fff2e8\}/u);
  assert.match(globals, /html\[data-theme="dark"\] \.dashboard-card-actions \.dashboard-danger\{[\s\S]*background:#5b2923/u);
  assert.match(globals, /html\[data-theme="dark"\] \.dashboard-card-actions \.dashboard-archive\{[\s\S]*background:#3b3120/u);
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
