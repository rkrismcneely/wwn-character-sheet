import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withAdditiveAdminCampaignPermissions } from "../lib/campaigns/admin-payload.ts";

const admin = { userId: "admin", role: "admin" };

function campaign(overrides = {}) {
  return {
    archivedAt: null,
    membershipRole: "gm",
    isOwner: false,
    permissions: {
      canLinkCharacters: false,
      adminReadOnly: true,
    },
    ...overrides,
  };
}

test("participating admins keep campaign character controls enabled", () => {
  assert.deepEqual(withAdditiveAdminCampaignPermissions(admin, campaign()).permissions, {
    canLinkCharacters: true,
    adminReadOnly: false,
  });
  assert.deepEqual(withAdditiveAdminCampaignPermissions(admin, campaign({ membershipRole: "player" })).permissions, {
    canLinkCharacters: true,
    adminReadOnly: false,
  });
});

test("global admin observation remains read-only without campaign participation", () => {
  const value = campaign({ membershipRole: null, permissions: { canLinkCharacters: false, adminReadOnly: true } });
  assert.equal(withAdditiveAdminCampaignPermissions(admin, value), value);
});

test("archived campaigns do not regain character-link writes", () => {
  const value = withAdditiveAdminCampaignPermissions(admin, campaign({ archivedAt: "2026-09-16T00:00:00.000Z" }));
  assert.equal(value.permissions.canLinkCharacters, false);
  assert.equal(value.permissions.adminReadOnly, false);
});

test("admin character pages include linked campaign Map and Store side controls", async () => {
  const page = await readFile(new URL("../app/character/[publicId]/page.tsx", import.meta.url), "utf8");
  const sideTools = await readFile(new URL("../app/campaigns/campaign-character-side-tools.tsx", import.meta.url), "utf8");
  const campaignRoute = await readFile(new URL("../app/api/campaigns/[id]/route.ts", import.meta.url), "utf8");
  const campaignListRoute = await readFile(new URL("../app/api/campaigns/route.ts", import.meta.url), "utf8");
  assert.match(page, /actor\?\.role !== "admin"/u);
  assert.match(page, /SELECT DISTINCT c\.public_id AS id, c\.name/u);
  assert.match(page, /CampaignCharacterSideTools/u);
  assert.doesNotMatch(page, /CampaignCharacterMapControl/u);
  assert.doesNotMatch(page, /CampaignCharacterStoreControl/u);
  assert.match(page, /showFloatingButton=\{false\}/u);
  assert.match(page, /CampaignStoreLauncher/u);
  assert.match(sideTools, /twe:campaign-map:drawer-dock/u);
  assert.match(sideTools, />\s*Map\s*<\/button>/u);
  assert.match(sideTools, />\s*Store\s*<\/button>/u);
  assert.match(sideTools, /if \(mapIsOpen \|\| storeIsOpen\) return null/u);
  assert.match(campaignRoute, /withAdditiveAdminCampaignPermissions/u);
  assert.match(campaignListRoute, /withAdditiveAdminCampaignPermissions/u);
});
