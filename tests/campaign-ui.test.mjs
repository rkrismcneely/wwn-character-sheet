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
    "canLinkCharacters",
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
  assert.match(detail, /inviteUrl\.hash = invite\.token/u);
  assert.match(detail, /navigator\.clipboard\.writeText\(inviteUrl\.toString\(\)\)/u);
  assert.match(detail, /Copy Invite Link/u);
  assert.match(detail, /value=\{invite\.token\}/u);
  assert.match(detail, /Expires/u);
  assert.match(detail, /The plaintext code cannot be retrieved after this window closes/u);
  assert.match(detail, /method: "DELETE"/u);
  assert.match(detail, /Revoke Invite/u);
  assert.doesNotMatch(detail, /localStorage|sessionStorage|console\.|tokenHash|token_hash/u);
});

test("signed-out invite continuation keeps the token out of requests and clears temporary state", async () => {
  const page = await source("app/campaigns/join/page.tsx");
  const join = await source("app/campaigns/campaign-join.tsx");
  assert.match(page, /<CampaignJoin/u);
  assert.match(join, /window\.location\.hash/u);
  assert.match(join, /sessionStorage\.setItem/u);
  assert.match(join, /sessionStorage\.removeItem/u);
  assert.match(join, /callbackURL: "\/campaigns\/join"/u);
  assert.match(join, /Sign in with Google to Join/u);
  assert.match(join, /\/api\/campaign-invites\/redeem/u);
  assert.match(join, /router\.replace\(`\/campaigns\/\$\{payload\.campaign\.id\}`\)/u);
  assert.doesNotMatch(join, /localStorage|console\.|searchParams\.set\("token"/u);
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
});

test("campaign character library uses scoped routes and owner-only link controls", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const scopedPage = await source("app/campaigns/[id]/characters/[characterId]/page.tsx");
  const scopedApi = await source("app/api/campaigns/[id]/characters/[characterId]/route.ts");
  const portraitApi = await source("app/api/campaigns/[id]/characters/[characterId]/portrait/route.ts");
  assert.match(detail, /Campaign Characters/u);
  assert.match(detail, /campaign\.permissions\.canLinkCharacters/u);
  assert.match(detail, /character\.permissions\.canUnlink/u);
  assert.match(detail, /Linking does not transfer ownership or change global visibility/u);
  assert.match(detail, /\/campaigns\/\$\{campaign\.id\}\/characters\/\$\{character\.id\}/u);
  assert.match(scopedPage, /readCampaignLinkedCharacter/u);
  assert.match(scopedPage, /campaignContext/u);
  assert.match(scopedApi, /export async function GET/u);
  assert.doesNotMatch(scopedApi, /export async function (PUT|PATCH|POST|DELETE)/u);
  assert.match(portraitApi, /readCampaignLinkedCharacter/u);
  assert.match(portraitApi, /export async function GET/u);
  assert.doesNotMatch(portraitApi, /export async function (PUT|PATCH|POST|DELETE)/u);
  assert.doesNotMatch(detail, /ownerUserId|owner_user_id|email|tokenHash|token_hash/u);
});

test("campaign dialog focus lifecycle stays stable while a controlled name is typed", async () => {
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  const dialog = await source("app/campaigns/campaign-dialog.tsx");
  assert.match(
    dashboard,
    /id="new-campaign-name"[\s\S]*value=\{campaignName\}[\s\S]*onChange=\{event => setCampaignName\(event\.target\.value\)\}[\s\S]*autoFocus/u,
  );
  assert.match(dialog, /const onCloseRef = useRef\(onClose\)/u);
  assert.match(dialog, /onCloseRef\.current = onClose/u);
  assert.match(dialog, /dialogElement\.querySelector<HTMLElement>\("\[autofocus\]"\)/u);
  assert.match(dialog, /if \(event\.key !== "Tab"\) return;/u);
  assert.match(dialog, /previouslyFocused\?\.isConnected/u);

  const focusLifecycle = dialog.match(
    /useEffect\(\(\) => \{[\s\S]*document\.addEventListener\("keydown", onKeyDown\)[\s\S]*\}, \[\]\);/u,
  );
  assert.ok(focusLifecycle, "dialog focus and keyboard lifecycle must initialize once per mount");
  assert.doesNotMatch(
    focusLifecycle[0],
    /closeButton\.current\?\.focus\(\);\s*function onKeyDown/u,
    "rerenders must not refocus the close button while controlled input state changes",
  );
});

test("campaign UI is responsive, keyboard dismissible, and avoids horizontal overflow", async () => {
  const css = await source("app/campaigns/campaign-ui.css");
  const dialog = await source("app/campaigns/campaign-dialog.tsx");
  assert.match(css, /@media\(max-width:900px\)/u);
  assert.match(css, /@media\(max-width:640px\)/u);
  assert.match(css, /minmax\(0,1fr\)/u);
  assert.match(css, /max-height:calc\(100vh - 20px\)/u);
  assert.match(css, /\.campaign-character-grid\{display:grid/u);
  assert.match(css, /overflow-wrap:anywhere/u);
  assert.match(dialog, /role="dialog"/u);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /event\.key === "Escape"/u);
});
