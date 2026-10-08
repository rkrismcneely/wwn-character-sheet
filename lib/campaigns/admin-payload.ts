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
 * Site admins are opted into campaign feature surfaces without needing a
 * campaign membership row. Character mutations remain ownership-scoped in the
 * character authorization layer; this projection only removes the old
 * campaign-wide admin read-only mode.
 */
export function withAdditiveAdminCampaignPermissions<T extends CampaignPayloadProjection>(
  actor: CampaignActor,
  campaign: T,
): T {
  if (actor.role !== "admin") return campaign;
  return {
    ...campaign,
    permissions: {
      ...campaign.permissions,
      canLinkCharacters: !campaign.archivedAt,
      adminReadOnly: false,
    },
  };
}
