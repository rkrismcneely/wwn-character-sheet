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
import { isPlausiblePublicCharacterId } from "../characters/identifiers.ts";
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

interface InviteCharacterRow {
  id: string;
  publicId: string;
  name: string;
  classLabel: string;
  level: number;
}

export interface InviteCharacterOption {
  id: string;
  name: string;
  classLabel: string;
  level: number;
}

export interface CreatedCampaignInvite {
  token: string;
  expiresAt: string;
  campaign: {
    id: string;
    name: string;
  };
}

export interface CampaignInvitePreview {
  campaign: {
    id: string;
    name: string;
  };
  characters: InviteCharacterOption[];
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
  character: InviteCharacterOption;
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

function normalizeInviteCharacterId(value: unknown): string {
  if (typeof value !== "string" || !isPlausiblePublicCharacterId(value.trim())) {
    throw new CampaignServiceError("Choose a valid character.", 422);
  }
  return value.trim();
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

async function loadRedeemableInvite(
  db: D1Database,
  actor: CampaignActor | null,
  rawToken: unknown,
  now: Date,
): Promise<{
  actor: CampaignActor;
  invite: CampaignInviteRow;
  tokenHash: string;
}> {
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
  return { actor: authenticatedActor, invite, tokenHash };
}

async function listInviteCharacterOptions(
  db: D1Database,
  actor: CampaignActor,
): Promise<InviteCharacterOption[]> {
  const result = await db
    .prepare(
      `SELECT id, public_id AS publicId, name,
              class_label AS classLabel, level
       FROM characters
       WHERE owner_user_id = ? AND public_id IS NOT NULL
       ORDER BY updated_at DESC, lower(name)`,
    )
    .bind(actor.userId)
    .all<InviteCharacterRow>();
  return result.results
    .filter(character => isPlausiblePublicCharacterId(character.publicId))
    .map(character => ({
      id: character.publicId,
      name: character.name,
      classLabel: character.classLabel,
      level: Number(character.level) || 1,
    }));
}

async function findOwnedInviteCharacter(
  db: D1Database,
  actor: CampaignActor,
  rawCharacterId: unknown,
): Promise<InviteCharacterRow> {
  const characterPublicId = normalizeInviteCharacterId(rawCharacterId);
  const character = await db
    .prepare(
      `SELECT id, public_id AS publicId, name,
              class_label AS classLabel, level
       FROM characters
       WHERE public_id = ? AND owner_user_id = ?`,
    )
    .bind(characterPublicId, actor.userId)
    .first<InviteCharacterRow>();
  if (!character) {
    throw new CampaignServiceError(
      "You may join only with a character you own.",
      403,
    );
  }
  return character;
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

export async function previewCampaignInvite(
  db: D1Database,
  actor: CampaignActor | null,
  rawToken: unknown,
  now = new Date(),
): Promise<CampaignInvitePreview> {
  const { actor: authenticatedActor, invite } = await loadRedeemableInvite(
    db,
    actor,
    rawToken,
    now,
  );
  return {
    campaign: {
      id: invite.campaignPublicId,
      name: invite.campaignName,
    },
    characters: await listInviteCharacterOptions(db, authenticatedActor),
  };
}

export async function redeemCampaignInvite(
  db: D1Database,
  actor: CampaignActor | null,
  rawToken: unknown,
  rawCharacterId: unknown,
  now = new Date(),
): Promise<RedeemedCampaignInvite> {
  const {
    actor: authenticatedActor,
    invite,
    tokenHash,
  } = await loadRedeemableInvite(db, actor, rawToken, now);
  const character = await findOwnedInviteCharacter(
    db,
    authenticatedActor,
    rawCharacterId,
  );
  const nowText = now.toISOString();

  let results: D1Result<unknown>[];
  try {
    results = await db.batch([
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
           VALUES (
             (SELECT campaign_id FROM campaign_invites
              WHERE id = ? AND token_hash = ? AND role = 'player'
                AND accepted_at = ? AND accepted_by_user_id = ?),
             ?, 'player', ?
           )`,
        )
        .bind(
          invite.id,
          tokenHash,
          nowText,
          authenticatedActor.userId,
          authenticatedActor.userId,
          nowText,
        ),
      db
        .prepare(
          `INSERT INTO campaign_characters (campaign_id, character_id, added_at)
           VALUES (
             (SELECT campaign_id FROM campaign_invites
              WHERE id = ? AND token_hash = ? AND role = 'player'
                AND accepted_at = ? AND accepted_by_user_id = ?),
             (SELECT id FROM characters WHERE id = ? AND owner_user_id = ?),
             ?
           )`,
        )
        .bind(
          invite.id,
          tokenHash,
          nowText,
          authenticatedActor.userId,
          character.id,
          authenticatedActor.userId,
          nowText,
        ),
    ]);
  } catch {
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
    const latestInvite = await findInviteByHash(db, tokenHash);
    if (latestInvite?.acceptedAt) {
      throw new CampaignServiceError(
        "This campaign invitation has already been used.",
        409,
      );
    }
    throw inviteNotFound();
  }

  if (results.some(result => result.meta.changes !== 1)) {
    throw new CampaignServiceError(
      "This campaign invitation could not be completed.",
      409,
    );
  }

  return {
    campaign: {
      id: invite.campaignPublicId,
      name: invite.campaignName,
    },
    membership: { role: "player", joinedAt: nowText },
    character: {
      id: character.publicId,
      name: character.name,
      classLabel: character.classLabel,
      level: Number(character.level) || 1,
    },
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

