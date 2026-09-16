import type { CampaignActor, CampaignRole } from "./types.ts";

type CampaignPermissionProjection = {
  canLinkCharacters: boolean;
  adminReadOnly: boolean;
};

type CampaignPayloadProjection = {
  archivedAt: string | null;
  membershipRole: CampaignRole | null;
  isOwner: boolean;
  permissions: CampaignPermissionProjection;
};

/**
 * Site-admin status is additive, not a reason to turn off the permissions that
 * come from actually participating in a campaign. Global admins who are not an
 * owner/member remain read-only observers; admin owners, GMs, and players keep
 * the same campaign-character controls they would have without the admin role.
 */
export function withAdditiveAdminCampaignPermissions<T extends CampaignPayloadProjection>(
  actor: CampaignActor,
  campaign: T,
): T {
  if (actor.role !== "admin") return campaign;
  const participant = campaign.isOwner || campaign.membershipRole !== null;
  if (!participant) return campaign;
  return {
    ...campaign,
    permissions: {
      ...campaign.permissions,
      canLinkCharacters: !campaign.archivedAt,
      adminReadOnly: false,
    },
  };
}
