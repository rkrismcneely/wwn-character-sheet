import {
  canInviteCampaignMembers,
  canViewCampaign,
} from "./authorization.ts";
import {
  generateCampaignInviteToken,
  hashCampaignInviteToken,
  isPlausibleCampaignInviteToken,
  isPlausiblePublicCampaignId,
} from "./identifiers.ts";
import { evaluateCampaignInvite } from "./invites.ts";
import {
  CampaignServiceError,
  getCampaignMembership,
} from "./service.ts";
import type {
  CampaignAccessRecord,
  CampaignActor,
  CampaignMembershipRecord,
} from "./types.ts";

export const CAMPAIGN_INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface InviteCampaignRow extends CampaignAccessRecord {
  publicId: string;
  name: string;
}

interface CampaignInviteRow {
  id: string;
  campaignId: string;
  campaignPublicId: string;
  campaignName: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedCampaignInvite {
  token: string;
  expiresAt: string;
  campaign: {
    id: string;
    name: string;
  };
}

export interface RedeemedCampaignInvite {
  campaign: {
    id: string;
    name: string;
  };
  membership: {
    role: "player";
    joinedAt: string;
  };
}

function requireActor(actor: CampaignActor | null): CampaignActor {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  return actor;
}

function inviteNotFound(): CampaignServiceError {
  return new CampaignServiceError("Invitation not found or unavailable.", 404);
}

export function normalizeCampaignInviteToken(value: unknown): string {
  if (typeof value !== "string") {
    throw new CampaignServiceError("A campaign invitation token is required.", 400);
  }
  const token = value.trim();
  if (!isPlausibleCampaignInviteToken(token)) {
    throw new CampaignServiceError("Invalid campaign invitation token.", 400);
  }
  return token;
}

async function findCampaign(
  db: D1Database,
  publicId: string,
): Promise<InviteCampaignRow | null> {
  if (!isPlausiblePublicCampaignId(publicId)) return null;
  return db
    .prepare(
      `SELECT id, public_id AS publicId, owner_user_id AS ownerUserId, name
       FROM campaigns
       WHERE public_id = ?`,
    )
    .bind(publicId)
    .first<InviteCampaignRow>();
}

async function loadInviteManagerCampaign(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<{
  campaign: InviteCampaignRow;
  membership: CampaignMembershipRecord | null;
}> {
  const campaign = await findCampaign(db, publicId);
  if (!campaign) throw inviteNotFound();
  const membership = await getCampaignMembership(db, campaign.id, actor.userId);

  // Site-admin status is never a campaign mutation override, including when
  // an administrator can otherwise inspect this private campaign.
  if (actor.role === "admin") {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  if (!canInviteCampaignMembers(actor, campaign, membership)) {
    if (!canViewCampaign(actor, campaign, membership)) throw inviteNotFound();
    throw new CampaignServiceError("Not permitted.", 403);
  }
  return { campaign, membership };
}

async function findInviteByHash(
  db: D1Database,
  tokenHash: string,
): Promise<CampaignInviteRow | null> {
  return db
    .prepare(
      `SELECT invite.id,
              invite.campaign_id AS campaignId,
              campaign.public_id AS campaignPublicId,
              campaign.name AS campaignName,
              invite.expires_at AS expiresAt,
              invite.accepted_at AS acceptedAt,
              invite.revoked_at AS revokedAt
       FROM campaign_invites AS invite
       INNER JOIN campaigns AS campaign ON campaign.id = invite.campaign_id
       WHERE invite.token_hash = ? AND invite.role = 'player'`,
    )
    .bind(tokenHash)
    .first<CampaignInviteRow>();
}

export async function createCampaignInvite(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  now = new Date(),
): Promise<CreatedCampaignInvite> {
  const authenticatedActor = requireActor(actor);
  const { campaign } = await loadInviteManagerCampaign(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const createdAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + CAMPAIGN_INVITE_DEFAULT_TTL_MS,
  ).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateCampaignInviteToken();
    const tokenHash = await hashCampaignInviteToken(token);
    try {
      await db
        .prepare(
          `INSERT INTO campaign_invites
            (id, campaign_id, token_hash, role, created_by_user_id,
             created_at, expires_at, accepted_at, accepted_by_user_id,
             revoked_at)
           VALUES (?, ?, ?, 'player', ?, ?, ?, NULL, NULL, NULL)`,
        )
        .bind(
          crypto.randomUUID(),
          campaign.id,
          tokenHash,
          authenticatedActor.userId,
          createdAt,
          expiresAt,
        )
        .run();
      return {
        token,
        expiresAt,
        campaign: { id: campaign.publicId, name: campaign.name },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("token_hash") || attempt === 4) throw error;
    }
  }

  throw new Error("Could not allocate a campaign invitation token.");
}

export async function redeemCampaignInvite(
  db: D1Database,
  actor: CampaignActor | null,
  rawToken: unknown,
  now = new Date(),
): Promise<RedeemedCampaignInvite> {
  const authenticatedActor = requireActor(actor);
  const token = normalizeCampaignInviteToken(rawToken);
  const tokenHash = await hashCampaignInviteToken(token);
  const invite = await findInviteByHash(db, tokenHash);
  if (!invite) throw inviteNotFound();

  const decision = evaluateCampaignInvite(invite, now);
  if (!decision.allowed) {
    if (decision.reason === "redeemed") {
      throw new CampaignServiceError(
        "This campaign invitation has already been used.",
        409,
      );
    }
    throw inviteNotFound();
  }
  const existingMembership = await getCampaignMembership(
    db,
    invite.campaignId,
    authenticatedActor.userId,
  );
  if (existingMembership) {
    throw new CampaignServiceError(
      "You are already a member of this campaign.",
      409,
    );
  }

  const nowText = now.toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE campaign_invites
         SET accepted_at = ?, accepted_by_user_id = ?
         WHERE id = ? AND token_hash = ? AND role = 'player'
           AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
           AND NOT EXISTS (
             SELECT 1 FROM campaign_members
             WHERE campaign_id = campaign_invites.campaign_id AND user_id = ?
           )`,
      )
      .bind(
        nowText,
        authenticatedActor.userId,
        invite.id,
        tokenHash,
        nowText,
        authenticatedActor.userId,
      ),
    db
      .prepare(
        `INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
         SELECT campaign_id, ?, 'player', ?
         FROM campaign_invites
         WHERE id = ? AND token_hash = ? AND role = 'player'
           AND accepted_at = ? AND accepted_by_user_id = ?
         ON CONFLICT (campaign_id, user_id) DO NOTHING`,
      )
      .bind(
        authenticatedActor.userId,
        nowText,
        invite.id,
        tokenHash,
        nowText,
        authenticatedActor.userId,
      ),
  ]);

  if (
    results[0]?.meta.changes !== 1
    || results[1]?.meta.changes !== 1
  ) {
    const membership = await getCampaignMembership(
      db,
      invite.campaignId,
      authenticatedActor.userId,
    );
    if (membership) {
      throw new CampaignServiceError(
        "You are already a member of this campaign.",
        409,
      );
    }
    throw new CampaignServiceError(
      "This campaign invitation has already been used.",
      409,
    );
  }

  return {
    campaign: {
      id: invite.campaignPublicId,
      name: invite.campaignName,
    },
    membership: { role: "player", joinedAt: nowText },
  };
}

export async function revokeCampaignInvite(
  db: D1Database,
  actor: CampaignActor | null,
  campaignPublicId: string,
  rawToken: unknown,
  now = new Date(),
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  const token = normalizeCampaignInviteToken(rawToken);
  const { campaign } = await loadInviteManagerCampaign(
    db,
    authenticatedActor,
    campaignPublicId,
  );
  const tokenHash = await hashCampaignInviteToken(token);
  const nowText = now.toISOString();
  const result = await db
    .prepare(
      `UPDATE campaign_invites
       SET revoked_at = ?
       WHERE campaign_id = ? AND token_hash = ? AND role = 'player'
         AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
    )
    .bind(nowText, campaign.id, tokenHash, nowText)
    .run();
  if (result.meta.changes === 1) return;

  const invite = await findInviteByHash(db, tokenHash);
  if (!invite || invite.campaignId !== campaign.id) throw inviteNotFound();
  if (invite.acceptedAt) {
    throw new CampaignServiceError(
      "This campaign invitation has already been used.",
      409,
    );
  }
  if (invite.revokedAt) {
    throw new CampaignServiceError(
      "This campaign invitation has already been revoked.",
      409,
    );
  }
  throw inviteNotFound();
}
