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
  assert.match(dashboard, /activeCampaigns\.map/u);
  assert.match(dashboard, /archivedCampaigns\.map/u);
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
    "canManageContent",
    "canUseGmConsole",
    "canRemovePlayers",
    "canLeave",
    "canDelete",
    "canArchive",
    "canRestore",
    "canLinkCharacters",
    "adminReadOnly",
  ]) {
    assert.equal(detail.includes(`campaign.permissions.${permission}`), true, permission);
  }
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  assert.match(dashboard, /campaign\.permissions\.canManageSettings/u);
  assert.match(detail, /campaign\.permissions\.canUseGmConsole/u);
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

test("campaign overview and resources stay member-readable with owner/GM controls", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const types = await source("app/campaigns/campaign-types.ts");
  const resourceList = await source("app/api/campaigns/[id]/resources/route.ts");
  const resourceItem = await source("app/api/campaigns/[id]/resources/[resourceKey]/route.ts");
  const css = await source("app/campaigns/campaign-ui.css");
  assert.match(detail, /CAMPAIGN OVERVIEW/u);
  assert.match(detail, /campaign\.description/u);
  assert.match(detail, /Campaign Resources/u);
  assert.match(
    detail,
    /campaign\.permissions\.canManageContent && <button[^>]*>[\s\S]*campaign\.description \? "Edit Description" : "Add Description"/u,
    "description controls must come from the authoritative content permission",
  );
  assert.ok(
    detail.includes(
      '{campaign.permissions.canManageContent && <button type="button" className="campaign-primary" onClick={() => openResource()}>Add Resource</button>}',
    ),
    "resource creation must come from the authoritative content permission",
  );
  assert.match(detail, /Add Resource/u);
  assert.match(detail, /Move up/u);
  assert.match(detail, /Move down/u);
  assert.match(detail, /target="_blank" rel="noreferrer"/u);
  assert.match(css, /white-space: pre-wrap/u);
  assert.match(css, /\.campaign-overview-panel\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/u);
  assert.ok(
    detail.indexOf('<div className="campaign-detail-layout">')
      < detail.indexOf('<section className="campaign-panel campaign-overview-panel"'),
    "overview, resources, characters, members, and access must share the centered detail grid",
  );
  assert.match(types, /description: string \| null/u);
  assert.match(types, /canManageContent: boolean/u);
  assert.match(types, /canUseGmConsole: boolean/u);
  assert.match(resourceList, /getSessionActor\(request\)/u);
  assert.match(resourceItem, /reorderCampaignResource/u);
  assert.match(resourceItem, /deleteCampaignResource/u);
  assert.doesNotMatch(detail, /ownerUserId|owner_user_id|email|tokenHash|token_hash/u);
});

test("campaign landing page leaves live table controls to the GM Console", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const liveSession = await source("app/campaigns/campaign-live-session.tsx");
  assert.doesNotMatch(detail, /CampaignLiveSession|TABLE SESSION|Live Session/u);
  assert.match(liveSession, /CampaignLiveSession/u);
  assert.match(liveSession, /EncounterTracker/u);
});

test("invite UI offers a canonical direct link while preserving code copy and revocation", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const link = await source("lib/campaigns/invite-link.ts");
  assert.match(detail, /Campaign Invitation/u);
  assert.match(detail, /campaignInviteLink\(invite\.token\)/u);
  assert.match(detail, /Copy Invite Link/u);
  assert.match(detail, /Copy Invite Code/u);
  assert.match(detail, /navigator\.clipboard\.writeText\(invite\.token\)/u);
  assert.match(detail, /value=\{invite\.token\}/u);
  assert.match(detail, /Expires/u);
  assert.match(detail, /The plaintext code cannot be retrieved after this window closes/u);
  assert.match(detail, /method: "DELETE"/u);
  assert.match(detail, /Revoke Invite/u);
  assert.match(link, /CANONICAL_ORIGIN/u);
  assert.match(link, /CAMPAIGN_JOIN_PATH = "\/campaigns\/join"/u);
  assert.match(link, /url\.hash = token/u);
  assert.doesNotMatch(link, /searchParams|campaignId|userId|tokenHash/u);
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
  assert.doesNotMatch(join, /callbackURL:\s*url|callbackURL:\s*window|https?:\/\//u);
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

test("direct invite flow gives owners and existing members safe Open Campaign states", async () => {
  const join = await source("app/campaigns/campaign-join.tsx");
  const dashboard = await source("app/campaigns/campaign-dashboard.tsx");
  const service = await source("lib/campaigns/invite-service.ts");

  for (const sourceText of [join, dashboard]) {
    assert.match(sourceText, /eligibility/u);
    assert.match(sourceText, /Campaign Already Available/u);
    assert.match(sourceText, /Open Campaign/u);
    assert.match(sourceText, /invitation has not been consumed/u);
  }
  assert.match(service, /campaignOwnerUserId/u);
  assert.match(service, /"owner"/u);
  assert.match(service, /"member"/u);
  assert.match(service, /"You already own this campaign\."/u);
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
  assert.match(detail, /Each campaign participant may have one character in a campaign/u);
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

test("owned characters expose only server-authorized campaign navigation below the folio content", async () => {
  const characterPage = await source("app/character/[publicId]/page.tsx");
  const sheet = await source("app/character-sheet.tsx");
  const characters = await source("lib/campaigns/characters.ts");
  const css = await source("app/globals.css");

  assert.match(characterPage, /listAuthorizedCharacterCampaigns/u);
  assert.match(characters, /ch\.owner_user_id = \?/u);
  assert.match(characters, /c\.owner_user_id = \? OR cm\.user_id IS NOT NULL/u);
  assert.match(characters, /SELECT c\.public_id AS id, c\.name/u);
  assert.match(sheet, /cloudId && canEdit && <section className="character-bottom-utilities"/u);
  assert.match(sheet, /campaignLinks\.length > 0 && <details className="character-campaign-utility"/u);
  assert.match(sheet, /Campaigns \(\{campaignLinks\.length\}\)/u);
  assert.ok(
    sheet.indexOf("character-campaign-utility") > sheet.indexOf('<div className="hero">'),
    "campaign navigation belongs in the bottom utility area",
  );
  assert.match(css, /\.character-campaign-utility nav\{[\s\S]*position:absolute/u);
  assert.match(css, /\.character-campaign-utility a\{[\s\S]*display:flex/u);
});

test("ordinary players get an intentional, confirmed character replacement flow", async () => {
  const detail = await source("app/campaigns/campaign-detail.tsx");
  const route = await source("app/api/campaigns/[id]/characters/route.ts");
  const characters = await source("lib/campaigns/characters.ts");
  const css = await source("app/campaigns/campaign-ui.css");

  assert.match(detail, /campaign\.membershipRole === "player" && character\.isMine/u);
  assert.match(detail, /Change Character/u);
  assert.match(detail, /void loadEligibleCharacters\(\)/u);
  assert.match(detail, /eligibleBusy/u);
  assert.match(detail, /currentCharacterId: changeCharacter\.id/u);
  assert.match(detail, /replacementCharacterId/u);
  assert.match(detail, /Confirm Character Change/u);
  assert.match(route, /export async function PATCH/u);
  assert.match(route, /replaceCampaignCharacter/u);
  assert.match(characters, /membership\?\.role !== "player"/u);
  assert.match(characters, /UPDATE campaign_characters/u);
  assert.match(characters, /SET character_id = \?, added_at = \?/u);
  assert.doesNotMatch(characters, /DELETE FROM campaign_characters[\s\S]*replaceCampaignCharacter/u);
  assert.match(css, /\.campaign-change-character/u);
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

test("campaign read-only sheets keep one context notice and headers retain every remaining responsive control", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const appHeader = await source("app/app-header.tsx");
  const account = await source("app/account/account-page.tsx");
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

  for (const label of [
    "Save Now",
    "Print",
  ]) {
    assert.ok(sheet.includes(label), label);
  }
  assert.doesNotMatch(sheet, /Display theme|theme-picker|wwn-display-theme/u);
  assert.match(account, /account-display-theme/u);

  for (const label of [
    "Account",
    "My Characters",
    "My Campaigns",
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
  assert.match(headerCss, /\.app-header-utilities/u);
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

test("character-sheet learning choices and privacy controls use responsive layout", async () => {
  const sheet = await source("app/character-sheet.tsx");
  const css = await source("app/globals.css");
  const footer = await source("app/site-footer.tsx");

  assert.match(sheet, /background-learning-rows/u);
  assert.match(sheet, /sheet\.backgroundLearningPicks\.map/u);
  assert.match(sheet, /Learning \{index \+ 1\}/u);
  assert.match(sheet, /character-bottom-utilities/u);
  assert.match(sheet, />Visibility<\/span><select/u);
  assert.doesNotMatch(sheet, /Rules authority:/u);
  assert.match(footer, /Tales Without End · v/u);

  assert.match(css, /\.background-learning-rows\{[\s\S]*display:grid/u);
  assert.match(
    css,
    /@media \(min-width:901px\)[\s\S]*\.background-learning-rows\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u,
  );
  assert.match(css, /\.core-grid\{align-items:start\}/u);
  assert.doesNotMatch(css, /\.background-learning-rows[^}]*overflow/u);
  assert.match(
    css,
    /\.background-learning-rows \.background-result-row select\{[\s\S]*width:100%;[\s\S]*min-width:0;[\s\S]*max-width:100%/u,
    "Learning selects should fill their responsive card column",
  );
});

test("all standard routes use the canonical shared Tales Without End brand", async () => {
  const header = await source("app/app-header.tsx");
  const sheet = await source("app/character-sheet.tsx");
  const landing = await source("app/landing-page.tsx");
  const publicPage = await source("app/public-characters/page.tsx");
  const join = await source("app/campaigns/campaign-join.tsx");
  const headerCss = await source("app/app-header.css");
  const campaignCss = await source("app/campaigns/campaign-ui.css");

  assert.match(header, /className="twe-brand"/u);
  assert.match(header, /className="twe-brand-logo"/u);
  assert.doesNotMatch(header, /twe-brand-logo brand-logo/u, "the logo should have one canonical class");
  assert.match(sheet, /<TalesBrandLink href=\{signedIn \? "\/account" : "\/"\} \/>/u);
  assert.match(landing, /<TalesBrandLink href="\/" \/>/u);
  assert.match(publicPage, /<TalesBrandLink href="\/" \/>/u);
  assert.match(join, /<TalesBrandLink href="\/" \/>/u);
  assert.doesNotMatch(join, /campaign-brand/u);
  assert.doesNotMatch(landing, /landing-brand/u);
  assert.doesNotMatch(publicPage, /landing-brand/u);
  for (const marker of [
    ".twe-brand-logo{",
    "width:72px",
    "height:42px",
    "font-size:24px",
    "letter-spacing:.06em",
    "color:#e7cf9c",
    "html[data-theme=\"dark\"] .twe-brand",
    "@media (max-width:720px)",
    "width:50px",
    "width:44px",
  ]) assert.ok(headerCss.includes(marker), marker);
  assert.match(campaignCss, /\.campaign-header[\s\S]*\.twe-brand/u);
});

test("stowed item action buttons align with dropdowns, not descriptions", async () => {
  const [sheet, css] = await Promise.all([
    source("app/character-sheet.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(sheet, /className="inventory-item-actions"/u);
  assert.match(sheet, /className="campaign-item-description"/u);
  assert.equal((sheet.match(/inventory-item-row inventory-stowed-row/gu) ?? []).length, 2);
  assert.equal((sheet.match(/className="inventory-stowed-controls"/gu) ?? []).length, 2);
  assert.match(css, /\.inventory-stowed-controls\{display:contents\}/u);
  assert.match(css, /\.inventory-item-row\.inventory-stowed-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/u);
  assert.match(css, /\.inventory-stowed-controls>\.field\{grid-column:1;grid-row:1/u);
  assert.match(css, /\.inventory-stowed-controls>\.inventory-item-actions\{grid-column:2;grid-row:1/u);
  assert.match(css, /\.inventory-stowed-row>\.campaign-item-description\{grid-column:1;grid-row:2/u);
  assert.match(css, /\.inventory-item-actions>\.drop-item\{margin-bottom:0\}/u);
});

test("inventory acquisition and movement use an owned-item workflow", async () => {
  const [sheet, stored, css] = await Promise.all([
    source("app/character-sheet.tsx"),
    source("app/inventory-stored-items.tsx"),
    source("app/globals.css"),
  ]);
  assert.match(sheet, /Add New Item/u);
  assert.match(sheet, /const addNewInventoryItem =/u);
  assert.match(sheet, /readyIndex >= 0[\s\S]*stowIndex >= 0[\s\S]*stored:/u);
  assert.match(sheet, /const requestInventoryMove =/u);
  assert.match(sheet, /inventorySwap &&/u);
  assert.match(sheet, />Ready<\/button>/u);
  assert.match(sheet, />Stow<\/button>/u);
  assert.match(sheet, />Store<\/button>/u);
  assert.match(stored, /onReady: \(index: number\) => void/u);
  assert.match(stored, /onReady\(index\)/u);
  assert.match(css, /\.inventory-dialog-backdrop/u);
});

test("custom Bestiary creatures use the shared NPC editor and linked Journal mechanism", async () => {
  const consoleSource = await source("app/campaigns/gm-console.tsx");
  const npcService = await source("lib/campaigns/npcs.ts");
  assert.match(consoleSource, /kind="creature"/u);
  assert.match(consoleSource, /Create Creature/u);
  assert.match(consoleSource, /visibleNpcs = npcs\.filter/u);
  assert.match(consoleSource, /notifyCampaignNpcChanged\(campaignId, saved\.id\)/u);
  assert.match(consoleSource, /\{\{twe-npc:/u);
  assert.match(npcService, /creatureMarker/u);
  assert.match(npcService, /draft\.kind \?\? existing\.kind/u);
});

test("new Journal pages inherit icon from the active folder role with a root fallback", async () => {
 const journal=await source("app/campaigns/campaign-journal.tsx");
 for(const [role,icon] of [["Locations","map-pin"],["NPCs","user-round"],["Items","sword"],["Stores","warehouse"],["Quests","scroll-text"],["Session Notes","calendar-days"]]){
  assert.ok(journal.includes(`${role}:${JSON.stringify(icon)}`) || journal.includes(`${JSON.stringify(role)}:${JSON.stringify(icon)}`),role);
 }
 assert.match(journal,/function newPageIconForFolder\(folderId:string\|null\)/u);
 assert.match(journal,/return "file-text";/u);
 assert.match(journal,/icon:newPageIconForFolder\(current\.id\)/u);
 assert.match(journal,/const folderId=activeNewPageFolder\(\)/u);
});

test("prepared encounters are private campaign plans and deploy only to an empty live encounter", async () => {
 const ui=await source("app/campaigns/prepared-encounter-library.tsx");
 const consoleSource=await source("app/campaigns/gm-console.tsx");
 const route=await source("app/api/campaigns/[id]/session/encounter/route.ts");
 const plans=await source("lib/campaigns/prepared-encounters.ts");
 const migration=await source("drizzle/0007_prepared_encounters.sql");
 assert.match(ui, /Prepare Encounter/u);
 assert.match(ui, /Save Encounter/u);
 assert.match(ui, /activeEncounter\|\|!sessionActive/u);
 assert.match(consoleSource, /deploy_prepared/u);
 assert.match(route, /End the current encounter before deploying another/u);
 assert.match(route, /Validate all referenced templates before starting/u);
 assert.match(plans, /canManageCampaignRuntime/u);
 assert.match(plans, /campaign_id=\?/u);
 assert.match(migration, /campaign_prepared_encounters/u);
});

test("prepared encounters can select all or individual linked party characters", async () => {
 const ui=await source("app/campaigns/prepared-encounter-library.tsx");
 const route=await source("app/api/campaigns/[id]/session/encounter/route.ts");
 const service=await source("lib/campaigns/prepared-encounters.ts");
 assert.match(ui,/All Party Members/u);
 assert.match(ui,/<option value="party">Party<\/option>/u);
 assert.match(ui,/characterId:selection/u);
 assert.match(route,/listCampaignCharacters\(db, actor, id\)/u);
 assert.match(route,/authorizeEncounterCharacter\(db, authorization.campaignId/u);
 assert.match(route,/durable.addPc\(authorization.sessionId/u);
 assert.match(service,/v.kind==="party"/u);
});

test("prepared encounter table self-initializes if migration deployment trails website code", async () => {
 const sourceText=await source("lib/campaigns/prepared-encounters.ts");
 const migration=await source("drizzle/0007_prepared_encounters.sql");
 assert.match(sourceText,/CREATE TABLE IF NOT EXISTS campaign_prepared_encounters/u);
 assert.match(sourceText,/await ensurePreparedEncounterTable\(db\)/u);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS campaign_prepared_encounters/u);
});

test("Journal recap paragraphs and editor-linked maps coexist with folder icon defaults",async()=>{
 const journal=await source("app/campaigns/campaign-journal.tsx");
 const recaps=await source("app/campaigns/session-recap-manager.tsx");
 assert.match(journal,/normalizeRecapContent/u);
 assert.match(journal,/Linked map<select/u);
 assert.match(journal,/newPageIconForFolder/u);
 assert.doesNotMatch(journal,/mapPickerOpen/u);
 assert.match(recaps,/content:marker\+"\\n\\n"\+editing.content/u);
});

test("Store edits synchronize only tagged Journal sections without overwriting custom writing",async()=>{
 const store=await source("app/campaigns/campaign-store-library.tsx");
 assert.match(store,/function updateStoreManagedSection/u);
 assert.match(store,/if\(start<0\|\|end<start\)return content/u);
 assert.match(store,/syncQueue\.current=/u);
 assert.match(store,/updateLinkedJournalStores\(stores\)/u);
 assert.match(store,/area:"journal"/u);
});

test("campaign My Character embeds a sheet without changing the full character route",async()=>{
 const page=await source("app/campaigns/[id]/characters/[characterId]/page.tsx");
 const frame=await source("app/campaigns/embedded-campaign-character.tsx");
 const sizing=await source("app/campaigns/embedded-character-sizing.tsx");
 const css=await source("app/campaigns/[id]/characters/[characterId]/embedded-character.css");
 assert.match(page,/embeddedQuery === "1"/u);
 assert.match(page,/!embedded && <CampaignCharacterSideTools/u);
 assert.match(frame,/embedded=1/u);
 assert.match(frame,/event.origin!==window.location.origin/u);
 assert.match(sizing,/ResizeObserver/u);
 assert.match(css,/\.twe-embedded-character \.app-header/u);
});

test("My Character panel reserves desktop width for the normal three-column character grid",async()=>{
 const campaignCss=await source("app/campaigns/campaign-ui.css");
 const responsive=await source("app/character-responsive-polish.css");
 const sheetWidth=campaignCss.match(/\.campaign-my-character-panel\{width:min\((\d+)px,calc\(100% - \d+px\)\)/u);
 assert.ok(sheetWidth,"Campaign My Character must retain a bounded responsive width");
 assert.ok(Number(sheetWidth[1])>1050,"Desktop panel must be wide enough for the normal three-column grid");
 assert.match(responsive,/@media \(min-width: 721px\) and \(max-width: 1050px\)/u);
});

test("campaign store drawer can show no-active-store state without character selection",async()=>{
 const service=await source("lib/campaigns/stores.ts");
 const drawer=await source("app/campaigns/campaign-store-launcher.tsx");
 const active=service.slice(service.indexOf("export async function readActiveCampaignStore"));
 assert.match(active,/characterId == null \|\| characterId === ""/u);
 assert.match(active,/canViewCampaign\(actor, access\.campaign, access\.membership\)/u);
 assert.match(active,/viewerCampaign\(db, actor, campaignPublicId, characterId\)/u);
 assert.match(drawer,/No store is currently open/u);
});

test("prepared encounters can persist and deploy map-linked token layouts",async()=>{
 const plans=await source("lib/campaigns/prepared-encounters.ts");
 const library=await source("app/campaigns/prepared-encounter-library.tsx");
 const api=await source("app/api/campaigns/[id]/prepared-encounters/route.ts");
 const deploy=await source("app/api/campaigns/[id]/session/encounter/route.ts");
 const map=await source("lib/campaigns/map.ts");
 assert.match(plans,/campaign_prepared_encounter_maps/u);
 assert.match(plans,/campaign_prepared_encounter_deployments/u);
 assert.match(library,/Save Map Positions/u);
 assert.match(api,/save_map_layout/u);
 assert.match(deploy,/placeCampaignMapEncounterTokens/u);
 assert.match(deploy,/readPreparedEncounterMapLayout/u);
 assert.match(map,/seed\.position/u);
});

test("Campaign dark theme keeps encounter plans and contextual controls readable",async()=>{
 const plans=await source("app/campaigns/prepared-encounter-library.css");
 const availability=await source("app/campaigns/campaign-availability.css");
 const store=await source("app/campaigns/campaign-store.css");
 assert.match(plans,/html\[data-theme="dark"\] \.prepared-encounter-card/u);
 assert.match(plans,/prepared-encounter-form input:focus-visible/u);
 assert.match(availability,/html\[data-theme="dark"\] \.campaign-availability-gm/u);
 assert.match(availability,/color-scheme:light/u);
 assert.match(store,/html\[data-theme="dark"\] \.campaign-store-proprietor select/u);
});

test("Dark Campaign tabs and parchment surfaces retain readable ink",async()=>{
 const ui=await source("app/campaigns/campaign-ui.css");
 const journal=await source("app/campaigns/twe-workspace.css");
 const store=await source("app/campaigns/campaign-store.css");
 assert.match(ui,/html\[data-theme="dark"\] \.gm-console-tabs button:not\(\.active\)/u);
 assert.match(journal,/html\[data-theme="dark"\] \.campaign-journal\.twe-workspace\{color:#332a20/u);
 assert.match(journal,/campaign-journal input::placeholder/u);
 assert.match(store,/html\[data-theme="dark"\] \.campaign-store-stock\{color:#3e2f1e/u);
 assert.match(store,/campaign-store-catalog-card\.is-stocked\{opacity:1/u);
});

test("Campaign dark mode uses dark surfaces rather than parchment for core workspaces",async()=>{
 const journal=await source("app/campaigns/twe-workspace.css");
 const navigation=await source("app/campaigns/campaign-ui.css");
 const store=await source("app/campaigns/campaign-store.css");
 const calendar=await source("app/campaigns/campaign-availability.css");
 assert.match(journal,/--twe-w-paper:#231f19/u);
 assert.match(journal,/\.twe-workspace-document\{background:linear-gradient\(#211e19/u);
 assert.match(navigation,/\.gm-console-tabs button:not\(\.active\)[\s\S]*?background:#2a251e/u);
 assert.match(store,/\.campaign-store-stock\{background:#25221c/u);
 assert.match(calendar,/\.campaign-availability-gm\{background:#29251e/u);
});
