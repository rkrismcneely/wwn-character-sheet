export interface CampaignInviteState {
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export type CampaignInviteDecision =
  | { allowed: true }
  | { allowed: false; reason: "expired" | "redeemed" | "revoked" };

export function evaluateCampaignInvite(
  invite: CampaignInviteState,
  now = new Date(),
): CampaignInviteDecision {
  if (invite.revokedAt) return { allowed: false, reason: "revoked" };
  if (invite.acceptedAt) return { allowed: false, reason: "redeemed" };

  const expiresAt = Date.parse(invite.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { allowed: false, reason: "expired" };
  }
  return { allowed: true };
}
