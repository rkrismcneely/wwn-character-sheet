import assert from "node:assert/strict";
import test from "node:test";
import {
  canAttachCharacterToCampaign,
  canChangeCampaignLinkedCharacterPortrait,
  canChangeCampaignLinkedCharacterVisibility,
  canDeleteCampaign,
  canDeleteCampaignLinkedCharacter,
  canDetachCharacterFromCampaign,
  canEditCampaignLinkedCharacter,
  canInviteCampaignMembers,
  canLeaveCampaign,
  canManageCampaignSettings,
  canRemoveCampaignMember,
  canTransferCampaignLinkedCharacterOwnership,
  canViewCampaign,
  canViewCampaignLinkedCharacter,
} from "../lib/campaigns/authorization.ts";
import {
  generateCampaignInternalId,
  generateCampaignInviteToken,
  generatePublicCampaignId,
  hashCampaignInviteToken,
  isPlausibleCampaignInviteToken,
  isPlausiblePublicCampaignId,
} from "../lib/campaigns/identifiers.ts";
import { evaluateCampaignInvite } from "../lib/campaigns/invites.ts";
import { isCampaignRole } from "../lib/campaigns/types.ts";
import { canReadCharacter } from "../lib/characters/authorization.ts";
import {
  generateLegacyClaimToken,
  generatePublicCharacterId,
  hashLegacyClaimToken,
} from "../lib/characters/identifiers.ts";

const owner = { userId: "owner", role: "user" };
const gm = { userId: "gm", role: "user" };
const player = { userId: "player", role: "user" };
const outsider = { userId: "outsider", role: "user" };
const admin = { userId: "admin", role: "admin" };
const campaign = { id: "campaign-1", ownerUserId: owner.userId };
const otherCampaign = { id: "campaign-2", ownerUserId: owner.userId };
const gmMembership = { campaignId: campaign.id, userId: gm.userId, role: "gm" };
const playerMembership = {
  campaignId: campaign.id,
  userId: player.userId,
  role: "player",
};
const ownerMembership = {
  campaignId: campaign.id,
  userId: owner.userId,
  role: "gm",
};
const privatePlayerCharacter = {
  id: "character-player",
  ownerUserId: player.userId,
  visibility: "private",
};
const privateOwnerCharacter = {
  id: "character-owner",
  ownerUserId: owner.userId,
  visibility: "private",
};
const playerLink = {
  campaignId: campaign.id,
  characterId: privatePlayerCharacter.id,
};
const ownerLink = {
  campaignId: campaign.id,
  characterId: privateOwnerCharacter.id,
};

test("campaign roles are limited to GM and player", () => {
  assert.equal(isCampaignRole("gm"), true);
  assert.equal(isCampaignRole("player"), true);
  assert.equal(isCampaignRole("owner"), false);
  assert.equal(isCampaignRole("admin"), false);
});

test("campaign public IDs and invite tokens are opaque and unique", () => {
  const campaignIds = Array.from({ length: 500 }, generatePublicCampaignId);
  const inviteTokens = Array.from({ length: 500 }, generateCampaignInviteToken);
  const internalIds = Array.from({ length: 100 }, generateCampaignInternalId);

  assert.equal(new Set(campaignIds).size, campaignIds.length);
  assert.equal(new Set(inviteTokens).size, inviteTokens.length);
  assert.equal(new Set(internalIds).size, internalIds.length);
  assert.ok(campaignIds.every(isPlausiblePublicCampaignId));
  assert.ok(inviteTokens.every(isPlausibleCampaignInviteToken));
  assert.ok(internalIds.every(id => /^[0-9a-f-]{36}$/u.test(id)));
});

test("campaign invite hashing is deterministic and stores no plaintext", async () => {
  const token = generateCampaignInviteToken();
  const first = await hashCampaignInviteToken(token);
  const second = await hashCampaignInviteToken(token);

  assert.equal(first, second);
  assert.notEqual(first, token);
  assert.match(first, /^[0-9a-f]{64}$/u);
});

test("shared opaque-token utility preserves existing character token behavior", async () => {
  const publicId = generatePublicCharacterId();
  const claim = generateLegacyClaimToken();
  assert.match(publicId, /^chr_[A-Za-z0-9_-]{22}$/u);
  assert.match(claim, /^claim_[A-Za-z0-9_-]{43}$/u);
  assert.match(await hashLegacyClaimToken(claim), /^[0-9a-f]{64}$/u);
});

test("invite decisions enforce expiry, revocation, and single use", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  assert.deepEqual(evaluateCampaignInvite({
    expiresAt: "2026-08-16T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
  }, now), { allowed: true });
  assert.deepEqual(evaluateCampaignInvite({
    expiresAt: "2026-08-14T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
  }, now), { allowed: false, reason: "expired" });
  assert.deepEqual(evaluateCampaignInvite({
    expiresAt: "invalid",
    acceptedAt: null,
    revokedAt: null,
  }, now), { allowed: false, reason: "expired" });
  assert.deepEqual(evaluateCampaignInvite({
    expiresAt: "2026-08-16T12:00:00.000Z",
    acceptedAt: "2026-08-15T11:00:00.000Z",
    revokedAt: null,
  }, now), { allowed: false, reason: "redeemed" });
  assert.deepEqual(evaluateCampaignInvite({
    expiresAt: "2026-08-16T12:00:00.000Z",
    acceptedAt: null,
    revokedAt: "2026-08-15T11:00:00.000Z",
  }, now), { allowed: false, reason: "revoked" });
});

test("only campaign participants and site admins can view a private campaign", () => {
  assert.equal(canViewCampaign(owner, campaign, ownerMembership), true);
  assert.equal(canViewCampaign(gm, campaign, gmMembership), true);
  assert.equal(canViewCampaign(player, campaign, playerMembership), true);
  assert.equal(canViewCampaign(outsider, campaign, null), false);
  assert.equal(canViewCampaign(null, campaign, null), false);
  assert.equal(canViewCampaign(admin, campaign, null), true);
});

test("campaign settings and deletion remain owner-only", () => {
  assert.equal(canManageCampaignSettings(owner, campaign), true);
  assert.equal(canDeleteCampaign(owner, campaign), true);
  for (const actor of [gm, player, outsider, admin, null]) {
    assert.equal(canManageCampaignSettings(actor, campaign), false);
    assert.equal(canDeleteCampaign(actor, campaign), false);
  }
});

test("owners and GMs can manage players without gaining owner powers", () => {
  assert.equal(canInviteCampaignMembers(owner, campaign, ownerMembership), true);
  assert.equal(canInviteCampaignMembers(gm, campaign, gmMembership), true);
  assert.equal(canInviteCampaignMembers(player, campaign, playerMembership), false);
  assert.equal(canInviteCampaignMembers(admin, campaign, null), false);
  assert.equal(canRemoveCampaignMember(owner, campaign, ownerMembership, playerMembership), true);
  assert.equal(canRemoveCampaignMember(gm, campaign, gmMembership, playerMembership), true);
  assert.equal(canRemoveCampaignMember(player, campaign, playerMembership, gmMembership), false);
  assert.equal(canRemoveCampaignMember(gm, campaign, gmMembership, ownerMembership), false);
  assert.equal(canRemoveCampaignMember(owner, campaign, ownerMembership, gmMembership), false);
});

test("players may leave but the campaign owner cannot orphan a campaign", () => {
  assert.equal(canLeaveCampaign(player, campaign, playerMembership), true);
  assert.equal(canLeaveCampaign(gm, campaign, gmMembership), true);
  assert.equal(canLeaveCampaign(owner, campaign, ownerMembership), false);
  assert.equal(canLeaveCampaign(outsider, campaign, null), false);
});

test("members can attach and detach only their own characters", () => {
  assert.equal(canAttachCharacterToCampaign(player, campaign, playerMembership, privatePlayerCharacter), true);
  assert.equal(canDetachCharacterFromCampaign(player, campaign, playerMembership, privatePlayerCharacter), true);
  assert.equal(canAttachCharacterToCampaign(player, campaign, playerMembership, privateOwnerCharacter), false);
  assert.equal(canAttachCharacterToCampaign(gm, campaign, gmMembership, privatePlayerCharacter), false);
  assert.equal(canAttachCharacterToCampaign(outsider, campaign, null, privatePlayerCharacter), false);
  assert.equal(canAttachCharacterToCampaign(owner, otherCampaign, null, privateOwnerCharacter), true);
});

test("campaign-scoped read access requires both membership and a matching link", () => {
  assert.equal(canViewCampaignLinkedCharacter(owner, campaign, ownerMembership, playerLink, privatePlayerCharacter), true);
  assert.equal(canViewCampaignLinkedCharacter(gm, campaign, gmMembership, playerLink, privatePlayerCharacter), true);
  assert.equal(canViewCampaignLinkedCharacter(player, campaign, playerMembership, ownerLink, privateOwnerCharacter), true);
  assert.equal(canViewCampaignLinkedCharacter(admin, campaign, null, playerLink, privatePlayerCharacter), true);
  assert.equal(canViewCampaignLinkedCharacter(outsider, campaign, null, playerLink, privatePlayerCharacter), false);
  assert.equal(canViewCampaignLinkedCharacter(null, campaign, null, playerLink, privatePlayerCharacter), false);
  assert.equal(canViewCampaignLinkedCharacter(player, campaign, playerMembership, ownerLink, privatePlayerCharacter), false);
});

test("campaign membership does not change global direct-character visibility", () => {
  assert.equal(canViewCampaignLinkedCharacter(gm, campaign, gmMembership, playerLink, privatePlayerCharacter), true);
  assert.equal(canReadCharacter(gm, privatePlayerCharacter), false);
  assert.equal(canReadCharacter(player, privatePlayerCharacter), true);
});

test("campaign character mutations remain strictly owner-only", () => {
  for (const permission of [
    canEditCampaignLinkedCharacter,
    canDeleteCampaignLinkedCharacter,
    canChangeCampaignLinkedCharacterVisibility,
    canChangeCampaignLinkedCharacterPortrait,
  ]) {
    assert.equal(permission(player, campaign, playerMembership, playerLink, privatePlayerCharacter), true);
    assert.equal(permission(gm, campaign, gmMembership, playerLink, privatePlayerCharacter), false);
    assert.equal(permission(owner, campaign, ownerMembership, playerLink, privatePlayerCharacter), false);
    assert.equal(permission(admin, campaign, null, playerLink, privatePlayerCharacter), false);
    assert.equal(permission(null, campaign, null, playerLink, privatePlayerCharacter), false);
  }
  assert.equal(canTransferCampaignLinkedCharacterOwnership(), false);
});
