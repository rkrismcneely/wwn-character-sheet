export type CampaignRole = "gm" | "player";

export type CampaignPermissions = {
  canManageSettings: boolean;
  canDelete: boolean;
  canInviteMembers: boolean;
  canRemovePlayers: boolean;
  canLeave: boolean;
  adminReadOnly: boolean;
};

export type CampaignSummary = {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  membershipRole: CampaignRole | null;
  isOwner: boolean;
  permissions: CampaignPermissions;
};

export type CampaignMember = {
  memberKey: string;
  name: string;
  role: CampaignRole;
  joinedAt: string;
  isOwner: boolean;
};

export type CreatedInvite = {
  token: string;
  expiresAt: string;
  campaign: { id: string; name: string };
};

export function campaignRoleLabel(campaign: CampaignSummary): string {
  if (campaign.permissions.adminReadOnly) return "Administrator · Read-only";
  if (campaign.isOwner) return "Owner · Game Master";
  return campaign.membershipRole === "gm" ? "Game Master" : "Player";
}

export function formatCampaignDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
