import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("My Campaigns is a signed-in route and a first-class dashboard destination", async () => {
  const page = await source("app/campaigns/page.tsx");
  const dashboard = await source("app/dashboard-page.tsx");
  assert.match(page, /getSessionActor/u);
  assert.match(page, /if \(!actor\) redirect\("\/"\)/u);
  assert.match(page, /<CampaignDashboard/u);
  assert.match(dashboard, /href="\/campaigns">My Campaigns/u);
});

test("campaign dashboard lists only server-authorized campaigns and has an intentional empty state", async () => {
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  assert.match(dashboard, /fetch\("\/api\/campaigns"/u);
  assert.match(dashboard, /campaigns\.map/u);
  assert.match(dashboard, /Your next campaign begins here/u);
  assert.match(dashboard, /Create Campaign/u);
  assert.match(dashboard, /campaignRoleLabel\(campaign\)/u);
  assert.match(dashboard, /campaign\.memberCount/u);
  assert.doesNotMatch(dashboard, /ownerUserId|owner_user_id|email|tokenHash|token_hash/u);
});

test("campaign creation sends only the bounded display name and updates the dashboard", async () => {
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  assert.match(dashboard, /method: "POST"/u);
  assert.match(dashboard, /body: JSON\.stringify\(\{ name \}\)/u);
  assert.match(dashboard, /setCampaigns\(current => \[payload\.campaign!/u);
  assert.match(dashboard, /owner and Game Master/u);
  assert.doesNotMatch(dashboard, /ownerId|ownerUserId|publicId|siteAdmin/u);
});

test("campaign detail consumes server permission flags for owner, player, GM, and admin UI", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  for (const permission of [
    "canInviteMembers",
    "canManageSettings",
    "canRemovePlayers",
    "canLeave",
    "canDelete",
    "adminReadOnly",
  ]) {
    assert.equal(detail.includes(`campaign.permissions.${permission}`), true, permission);
  }
  assert.match(detail, /Administrator read-only view/u);
  assert.match(detail, /Campaign members/u);
  assert.match(detail, /Owner · Game Master/u);
});

test("invite UI shows the plaintext once, supports copy and immediate revocation, and stores nothing", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  assert.match(detail, /Campaign Invite/u);
  assert.match(detail, /navigator\.clipboard\.writeText\(invite\.token\)/u);
  assert.match(detail, /value=\{invite\.token\}/u);
  assert.match(detail, /Expires/u);
  assert.match(detail, /The plaintext code cannot be retrieved after this window closes/u);
  assert.match(detail, /method: "DELETE"/u);
  assert.match(detail, /Revoke Invite/u);
  assert.doesNotMatch(detail, /localStorage|sessionStorage|console\.|tokenHash|token_hash/u);
});

test("signed-in join flow handles server-authoritative invite outcomes", async () => {
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  assert.match(dashboard, /\/api\/campaign-invites\/redeem/u);
  assert.match(dashboard, /router\.push\(`\/campaigns\/\$\{payload\.campaign\.id\}`\)/u);
  for (const copy of [
    "This campaign invitation is invalid.",
    "invalid, expired, or has been revoked",
    "already part of this campaign",
    "already been used",
  ]) assert.equal(dashboard.includes(copy), true, copy);
  assert.doesNotMatch(dashboard, /localStorage|sessionStorage|console\./u);
});

test("membership and destructive flows state that characters remain preserved", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  assert.match(detail, /\/membership/u);
  assert.match(detail, /memberKey/u);
  assert.match(detail, /Remove from Campaign/u);
  assert.match(detail, /Leave Campaign/u);
  assert.match(detail, /Deleting this campaign does not delete any characters/u);
  assert.match(detail, /ownership will not change/u);
  assert.doesNotMatch(detail, /Attach Character|campaign character library|campaign.*character.*fetch/iu);
});

test("campaign UI is responsive, keyboard dismissible, and avoids horizontal overflow", async () => {
  const css = await source("app/campaigns/campaign-ui.css");
  const dialog = await source("app/campaigns/campaign-dialog.tsx");
  assert.match(css, /@media\(max-width:900px\)/u);
  assert.match(css, /@media\(max-width:640px\)/u);
  assert.match(css, /minmax\(0,1fr\)/u);
  assert.match(css, /max-height:calc\(100vh - 20px\)/u);
  assert.match(dialog, /role="dialog"/u);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /event\.key === "Escape"/u);
});
