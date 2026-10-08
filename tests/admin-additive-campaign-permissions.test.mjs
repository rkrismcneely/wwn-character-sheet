import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAttachCharacterToCampaign,
  canChangeCampaignLinkedCharacterPortrait,
  canDeleteCampaignLinkedCharacter,
  canDetachCharacterFromCampaign,
  canEditCampaignLinkedCharacter,
  canDeleteCampaign,
  canInviteCampaignMembers,
  canManageCampaignContent,
  canManageCampaignRuntime,
  canManageCampaignSettings,
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

test("site admins receive campaign feature access without a membership row", () => {
  assert.equal(canViewCampaign(admin, campaign, null), true);
  assert.equal(canManageCampaignContent(admin, campaign, null), true);
  assert.equal(canManageCampaignRuntime(admin, campaign), true);
  assert.equal(canInviteCampaignMembers(admin, campaign, null), true);
  assert.equal(canRemoveCampaignMember(admin, campaign, null, targetPlayer), true);
  assert.equal(canManageCampaignSettings(admin, campaign), false);
  assert.equal(canDeleteCampaign(admin, campaign), false);
});

test("admins get campaign participation for their own characters without gaining ownership of other characters", () => {
  assert.equal(canAttachCharacterToCampaign(admin, campaign, null, ownCharacter), true);
  assert.equal(canDetachCharacterFromCampaign(admin, campaign, null, ownCharacter), true);
  assert.equal(canAttachCharacterToCampaign(admin, campaign, gmMembership, ownCharacter), true);
  assert.equal(canAttachCharacterToCampaign(admin, campaign, playerMembership, ownCharacter), true);
  assert.equal(canEditCampaignLinkedCharacter(admin, campaign, null, ownLink, ownCharacter), true);
  assert.equal(canDeleteCampaignLinkedCharacter(admin, campaign, null, ownLink, ownCharacter), true);
  assert.equal(canChangeCampaignLinkedCharacterPortrait(admin, campaign, null, ownLink, ownCharacter), true);
});

test("campaign character service does not turn admins off", async () => {
  const source = await readFile(new URL("../lib/campaigns/characters.ts", import.meta.url), "utf8");
  assert.match(source, /canUnlink: isMine,/u);
  assert.match(source, /if \(campaign\.archivedAt\) return \[\];/u);
  assert.match(source, /if \(membership\?\.role !== "player"\)/u);
  assert.doesNotMatch(source, /authenticatedActor\.role === "admin" \|\| membership\?\.role !== "player"/u);
  assert.doesNotMatch(source, /authenticatedActor\.role === "admin" && authenticatedActor\.userId !== campaign\.ownerUserId/u);
});
