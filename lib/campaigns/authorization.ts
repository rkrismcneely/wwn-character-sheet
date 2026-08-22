import type {
  CampaignAccessRecord,
  CampaignActor,
  CampaignCharacterLinkRecord,
  CampaignCharacterRecord,
  CampaignMembershipRecord,
} from "./types.ts";

function membershipMatches(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  return Boolean(
    actor &&
      membership &&
      membership.campaignId === campaign.id &&
      membership.userId === actor.userId,
  );
}

function isCampaignOwner(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
): boolean {
  return Boolean(actor && actor.userId === campaign.ownerUserId);
}

function isCampaignParticipant(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  return (
    isCampaignOwner(actor, campaign) ||
    membershipMatches(actor, campaign, membership)
  );
}

function linkMatches(
  campaign: CampaignAccessRecord,
  link: CampaignCharacterLinkRecord,
  character: CampaignCharacterRecord,
): boolean {
  return link.campaignId === campaign.id && link.characterId === character.id;
}

export function canViewCampaign(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  if (actor?.role === "admin") return true;
  return isCampaignParticipant(actor, campaign, membership);
}

export function canManageCampaignSettings(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
): boolean {
  return isCampaignOwner(actor, campaign);
}

/** Campaign description and resource content is managed by the owner or a GM member. */
export function canManageCampaignContent(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  if (actor?.role === "admin") return false;
  return canInviteCampaignMembers(actor, campaign, membership);
}

export function canDeleteCampaign(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
): boolean {
  return isCampaignOwner(actor, campaign);
}

export function canInviteCampaignMembers(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  if (isCampaignOwner(actor, campaign)) return true;
  return Boolean(
    membershipMatches(actor, campaign, membership) &&
      membership?.role === "gm",
  );
}

export function canRemoveCampaignMember(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  actorMembership: CampaignMembershipRecord | null,
  targetMembership: CampaignMembershipRecord,
): boolean {
  if (
    targetMembership.campaignId !== campaign.id ||
    targetMembership.userId === campaign.ownerUserId ||
    targetMembership.role !== "player"
  ) {
    return false;
  }
  return canInviteCampaignMembers(actor, campaign, actorMembership);
}

export function canLeaveCampaign(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
): boolean {
  return (
    !isCampaignOwner(actor, campaign) &&
    membershipMatches(actor, campaign, membership)
  );
}

export function canAttachCharacterToCampaign(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
  character: CampaignCharacterRecord,
): boolean {
  return Boolean(
    actor &&
      character.ownerUserId === actor.userId &&
      isCampaignParticipant(actor, campaign, membership),
  );
}

export const canDetachCharacterFromCampaign = canAttachCharacterToCampaign;

export function canViewCampaignLinkedCharacter(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
  link: CampaignCharacterLinkRecord,
  character: CampaignCharacterRecord,
): boolean {
  if (!linkMatches(campaign, link, character)) return false;
  if (actor?.role === "admin") return true;
  return isCampaignParticipant(actor, campaign, membership);
}

function canOwnerMutateCampaignLinkedCharacter(
  actor: CampaignActor | null,
  campaign: CampaignAccessRecord,
  membership: CampaignMembershipRecord | null,
  link: CampaignCharacterLinkRecord,
  character: CampaignCharacterRecord,
): boolean {
  return Boolean(
    actor &&
      character.ownerUserId === actor.userId &&
      isCampaignParticipant(actor, campaign, membership) &&
      linkMatches(campaign, link, character),
  );
}

export const canEditCampaignLinkedCharacter =
  canOwnerMutateCampaignLinkedCharacter;
export const canDeleteCampaignLinkedCharacter =
  canOwnerMutateCampaignLinkedCharacter;
export const canChangeCampaignLinkedCharacterVisibility =
  canOwnerMutateCampaignLinkedCharacter;
export const canChangeCampaignLinkedCharacterPortrait =
  canOwnerMutateCampaignLinkedCharacter;

export function canTransferCampaignLinkedCharacterOwnership(): false {
  return false;
}
