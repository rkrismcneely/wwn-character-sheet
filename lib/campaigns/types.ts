import type { CharacterVisibility } from "../characters/authorization.ts";

export const CAMPAIGN_ROLES = ["gm", "player"] as const;

export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export interface CampaignActor {
  userId: string;
  role: "user" | "admin";
}

export interface CampaignAccessRecord {
  id: string;
  ownerUserId: string;
  archivedAt: string | null;
}

export interface CampaignMembershipRecord {
  campaignId: string;
  userId: string;
  role: CampaignRole;
}

export interface CampaignCharacterLinkRecord {
  campaignId: string;
  characterId: string;
}

export interface CampaignCharacterRecord {
  id: string;
  ownerUserId: string | null;
  visibility: CharacterVisibility;
}

export type CampaignResourceType = "text" | "link";

export function isCampaignRole(value: unknown): value is CampaignRole {
  return (
    typeof value === "string" &&
    CAMPAIGN_ROLES.includes(value as CampaignRole)
  );
}
