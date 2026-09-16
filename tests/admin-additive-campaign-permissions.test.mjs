import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAttachCharacterToCampaign,
  canChangeCampaignLinkedCharacterPortrait,
  canDeleteCampaignLinkedCharacter,
  canDetachCharacterFromCampaign,
  canEditCampaignLinkedCharacter,
  canInviteCampaignMembers,
  canManageCampaignContent,
  canRemoveCampaignMember,
  canViewCampaign,
} from "../lib/campaigns/authorization.ts";

const admin = { userId: "admin-gm", role: "admin" };
const campaign = { id: "campaign-1", ownerUserId: "campaign-owner" };
const gmMembership = { campaignId: campaign.id, userId: admin.userId, role: "gm" };
const playerMembership = { campaignId: campaign.id, userId: admin.userId, role: "player" };
const targetPlayer = { campaignId: campaign.id, userId: "player-2", role: "player" };
const ownCharacter = { id: "character-admin", ownerUserId: admin.userId, visibility: "private" };
const ownLink = { campaignId: campaign.id, characterId: ownCharacter.id };

test("site-admin status adds global read access without removing actual GM permissions", () => {
  assert.equal(canViewCampaign(admin, campaign, null), true);
  assert.equal(canManageCampaignContent(admin, campaign, null), false);
  assert.equal(canManageCampaignContent(admin, campaign, gmMembership), true);
  assert.equal(canInviteCampaignMembers(admin, campaign, gmMembership), true);
  assert.equal(canRemoveCampaignMember(admin, campaign, gmMembership, targetPlayer), true);
});

test("admins keep their normal participant and character-owner permissions", () => {
  assert.equal(canAttachCharacterToCampaign(admin, campaign, null, ownCharacter), false);
  assert.equal(canAttachCharacterToCampaign(admin, campaign, gmMembership, ownCharacter), true);
  assert.equal(canDetachCharacterFromCampaign(admin, campaign, gmMembership, ownCharacter), true);
  assert.equal(canAttachCharacterToCampaign(admin, campaign, playerMembership, ownCharacter), true);
  assert.equal(canEditCampaignLinkedCharacter(admin, campaign, playerMembership, ownLink, ownCharacter), true);
  assert.equal(canDeleteCampaignLinkedCharacter(admin, campaign, playerMembership, ownLink, ownCharacter), true);
  assert.equal(canChangeCampaignLinkedCharacterPortrait(admin, campaign, playerMembership, ownLink, ownCharacter), true);
});

test("campaign character service no longer turns admins off when they are real participants", async () => {
  const source = await readFile(new URL("../lib/campaigns/characters.ts", import.meta.url), "utf8");
  assert.match(source, /canUnlink: isMine,/u);
  assert.match(source, /if \(campaign\.archivedAt\) return \[\];/u);
  assert.match(source, /if \(membership\?\.role !== "player"\)/u);
  assert.doesNotMatch(source, /authenticatedActor\.role === "admin" \|\| membership\?\.role !== "player"/u);
  assert.doesNotMatch(source, /authenticatedActor\.role === "admin" && authenticatedActor\.userId !== campaign\.ownerUserId/u);
});
