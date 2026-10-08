export type CampaignRole = "gm" | "player";

export type CampaignResource = {
  resourceKey: string;
  title: string;
  type: "text" | "link";
  content: string;
  position: number;
  updatedAt: string;
};

export type CampaignPermissions = {
  canManageSettings: boolean;
  canManageContent: boolean;
  canUseGmConsole: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canInviteMembers: boolean;
  canRemovePlayers: boolean;
  canLeave: boolean;
  canLinkCharacters: boolean;
  adminReadOnly: boolean;
};

export type CampaignCharacter = {
  id: string;
  name: string;
  classLabel: string;
  level: number;
  visibility: "private" | "unlisted" | "public";
  updatedAt: string;
  ownerName: string;
  portraitUrl: string | null;
  hpCurrent: number;
  hpMax: number;
  armorClass: number;
  isMine: boolean;
  permissions: {
    canUnlink: boolean;
    canEdit: boolean;
    adminReadOnly: boolean;
  };
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
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
  if (campaign.permissions.canUseGmConsole) return "Administrator · Game Master";
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
