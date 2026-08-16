import { hashOpaqueToken, randomBase64URL } from "../security/opaque-tokens.ts";

const CAMPAIGN_PUBLIC_ID_BYTES = 16;
const CAMPAIGN_INVITE_TOKEN_BYTES = 32;

export function generateCampaignInternalId(): string {
  return crypto.randomUUID();
}

export function generatePublicCampaignId(): string {
  return `cmp_${randomBase64URL(CAMPAIGN_PUBLIC_ID_BYTES)}`;
}

export function isPlausiblePublicCampaignId(value: string): boolean {
  return /^cmp_[A-Za-z0-9_-]{22}$/u.test(value);
}

export function generateCampaignInviteToken(): string {
  return `cminv_${randomBase64URL(CAMPAIGN_INVITE_TOKEN_BYTES)}`;
}

export function isPlausibleCampaignInviteToken(value: string): boolean {
  return /^cminv_[A-Za-z0-9_-]{43}$/u.test(value);
}

export function hashCampaignInviteToken(token: string): Promise<string> {
  return hashOpaqueToken(token);
}
