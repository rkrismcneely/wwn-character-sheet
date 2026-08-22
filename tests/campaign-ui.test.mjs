import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("My Campaigns is a signed-in route and a first-class dashboard destination", async () => {
  const page = await source("app/campaigns/page.tsx");
  const dashboard = await source("app/dashboard-page.tsx");
  const header = await source("app/app-header.tsx");
  assert.match(page, /getSessionActor/u);
  assert.match(page, /if \(!actor\) redirect\("\/"\)/u);
  assert.match(page, /<CampaignDashboard/u);
  assert.match(dashboard, /<SignedInHeader active="characters"/u);
  assert.match(header, /link\("campaigns", "\/campaigns", "My Campaigns"\)/u);
  assert.match(header, /My Campaigns/u);
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
  assert.match(
    detail,
    /campaign\.permissions\.canInviteMembers && \([\s\S]*>Invite Player<\/button>/u,
    "Invite Player must render from the server-authoritative permission flag",
  );
  assert.doesNotMatch(
    detail,
    /campaign\.isOwner && \([\s\S]*>Invite Player<\/button>/u,
    "the client must not invent a separate owner-only invitation rule",
  );
});

test("invite UI distinguishes cminv_ codes from campaign IDs and supports copy-once revocation", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  assert.match(detail, /Campaign Invitation/u);
  assert.match(detail, /private cminv_ invitation code/u);
  assert.match(detail, /navigator\.clipboard\.writeText\(invite\.token\)/u);
  assert.match(detail, /Copy Invite Code/u);
  assert.match(detail, /value=\{invite\.token\}/u);
  assert.match(detail, /Expires/u);
  assert.match(detail, /The plaintext code cannot be retrieved after this window closes/u);
  assert.match(detail, /method: "DELETE"/u);
  assert.match(detail, /Revoke Invite/u);
  assert.doesNotMatch(detail, /<dt>Campaign ID<\/dt>|localStorage|sessionStorage|console\.|tokenHash|token_hash/u);
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
  assert.match(join, /\/api\/campaign-invites\/preview/u);
  assert.match(join, /\/api\/campaign-invites\/redeem/u);
  assert.match(join, /characterId: selectedCharacterId/u);
  assert.match(join, /Choose Your Character/u);
  assert.match(join, /router\.replace\(`\/campaigns\/\$\{payload\.campaign\.id\}`\)/u);
  assert.doesNotMatch(join, /localStorage|console\.|searchParams\.set\("token"/u);
});

test("signed-in join flow previews without consuming, requires one owned character, and handles outcomes", async () => {
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  assert.match(dashboard, /\/api\/campaign-invites\/preview/u);
  assert.match(dashboard, /\/api\/campaign-invites\/redeem/u);
  assert.match(dashboard, /characterId: selectedCharacterId/u);
  assert.match(dashboard, /Choose Your Character/u);
  assert.match(dashboard, /Your other characters remain unrelated/u);
  assert.match(dashboard, /Campaign IDs beginning cmp_ are not invite codes/u);
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
  assert.match(detail, /!characters\.some\(character => character\.isMine\)/u);
  assert.match(detail, /Each member may have one character in a campaign/u);
  assert.match(detail, /character\.permissions\.canUnlink/u);
  assert.match(detail, /Ownership and global visibility will not change/u);
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
  assert.match(dialog, /dialogNode\.querySelector<HTMLElement>\("\[autofocus\]"\)/u);
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

test("campaign character cards show the authorized party-at-a-glance summary", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const types = await source("app/campaigns/campaign-types.ts");
  const characters = await source("lib/campaigns/characters.ts");
  const css = await source("app/campaigns/campaign-ui.css");
  for (const marker of ["character.portraitUrl", "character.ownerName", "character.hpCurrent", "character.hpMax", "character.armorClass", "Open Character"]) {
    assert.equal(detail.includes(marker), true, marker);
  }
  assert.match(detail, /\/campaigns\/\$\{campaign\.id\}\/characters\/\$\{character\.id\}/u);
  assert.match(types, /portraitUrl: string \| null/u);
  assert.match(characters, /\/api\/campaigns\/\$\{campaignPublicId\}\/characters\/\$\{row\.publicId\}\/portrait/u);
  assert.match(characters, /campaignCardArmorClass|campaignCardHpMax/u);
  assert.doesNotMatch(detail, /systemStrain|System Strain/u);
  assert.doesNotMatch(characters, /systemStrain|System Strain/u);
  assert.match(css, /\.campaign-character-portrait/u);
  assert.match(css, /\.campaign-character-vitals/u);
  assert.ok(css.includes(".campaign-character-grid{grid-template-columns:1fr}"), "mobile campaign card layout");
});

test("campaign read-only sheets keep one context notice and both headers keep every responsive control", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const appHeader = await source("app/app-header.tsx");
  const globalCss = await source("app/globals.css");
  const headerCss = await source("app/app-header.css");

  assert.equal(
    (sheet.match(/Viewing through campaign · Read only/gu) || []).length,
    1,
    "the campaign read-only notice should have one render path",
  );
  assert.match(sheet, /className="campaign-character-context"/u);
  assert.match(sheet, /!canEdit && !campaignContext\?\.readOnly && <div className="read-only-banner"/u);
  assert.match(sheet, /<div className="hero">/u);

  assert.match(sheet, /className="header-actions"/u);
  for (const label of [
    "Account",
    "Save Now",
    "Export Character",
    "Import Character",
    "Sign Out",
    "Print / PDF",
    "Display theme",
  ]) {
    assert.ok(sheet.includes(label), label);
  }
  for (const label of [
    "Account",
    "My Characters",
    "My Campaigns",
    "Public Characters",
    "Sign Out",
  ]) {
    assert.ok(appHeader.includes(label), label);
  }

  assert.equal(
    globalCss.includes(".status button:not(.library-button):not(:nth-child(4)){display:none}"),
    false,
    "narrow layouts must not hide character-sheet controls",
  );
  assert.match(headerCss, /--twe-header-control-height:40px/u);
  assert.match(
    headerCss,
    /\.app-header nav,\s*\.header-actions\{[\s\S]*flex-wrap:wrap/u,
    "both header variants should use intrinsic flex wrapping",
  );
  assert.match(
    headerCss,
    /\.app-header nav a,[\s\S]*\.status \.account-state\{[\s\S]*min-width:max-content;[\s\S]*white-space:nowrap/u,
    "complete labels should determine the control width",
  );
  assert.match(
    headerCss,
    /@media\(max-width:720px\)\{[\s\S]*\.app-header,\s*\.topbar\{[\s\S]*flex-direction:column/u,
    "the brand should own a clean row on narrow screens",
  );
  assert.match(
    headerCss,
    /\.status\{[\s\S]*display:grid;[\s\S]*grid-template-columns:minmax\(0,1fr\)/u,
    "character utilities and actions should occupy intentional narrow-screen rows",
  );
  assert.doesNotMatch(
    headerCss,
    /\.app-header nav\{[^}]*display:grid/u,
    "application navigation must not become oversized equal-width grid buttons",
  );
  assert.doesNotMatch(
    headerCss,
    /\.app-header nav\{[^}]*grid-template-columns/u,
    "application navigation must wrap by intrinsic label width",
  );
});

test("character-sheet learning choices and privacy footer use responsive layout", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const css = await source("app/globals.css");

  assert.match(sheet, /background-learning-rows/u);
  assert.match(sheet, /sheet\.backgroundLearningPicks\.map/u);
  assert.match(sheet, /Learning \{index \+ 1\}/u);
  assert.match(sheet, /Privacy & Sharing/u);
  assert.match(sheet, /<footer>Rules authority:/u);

  assert.match(css, /\.background-learning-rows\{[\s\S]*display:grid/u);
  assert.match(
    css,
    /@media \(min-width:901px\)[\s\S]*\.background-learning-rows\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u,
  );
  assert.match(css, /\.core-grid\{align-items:start\}/u);
  assert.doesNotMatch(css, /\.background-learning-rows[^}]*overflow/u);
  assert.match(
    css,
    /\\.background-learning-rows \\.background-result-row select\\{[\\s\\S]*width:100%;[\\s\\S]*min-width:0;[\\s\\S]*max-width:100%/u,
    "Learning selects should fill their responsive card column",
  );
});
