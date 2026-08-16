import {
  canDeleteCampaign,
  canLeaveCampaign,
  canManageCampaignSettings,
  canRemoveCampaignMember,
  canViewCampaign,
} from "./authorization.ts";
import {
  generateCampaignInternalId,
  generatePublicCampaignId,
  isPlausiblePublicCampaignId,
} from "./identifiers.ts";
import type {
  CampaignAccessRecord,
  CampaignActor,
  CampaignMembershipRecord,
  CampaignRole,
} from "./types.ts";

export type CampaignServiceStatus = 400 | 401 | 403 | 404 | 409 | 422;

export class CampaignServiceError extends Error {
  public readonly status: CampaignServiceStatus;

  constructor(message: string, status: CampaignServiceStatus) {
    super(message);
    this.status = status;
  }
}

interface CampaignRow extends CampaignAccessRecord {
  publicId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface CampaignMembershipRow extends CampaignMembershipRecord {
  joinedAt: string;
}

interface CampaignListRow extends CampaignRow {
  membershipRole: CampaignRole;
}

interface CampaignMemberRow extends CampaignMembershipRow {
  displayName: string;
}

export interface CampaignPayload {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  membershipRole: CampaignRole | null;
  isOwner: boolean;
  permissions: {
    canManageSettings: boolean;
    canDelete: boolean;
    adminReadOnly: boolean;
  };
}

export interface CampaignMemberPayload {
  name: string;
  role: CampaignRole;
  joinedAt: string;
  isOwner: boolean;
}

function notFound(): CampaignServiceError {
  return new CampaignServiceError("Campaign not found.", 404);
}

function requireActor(actor: CampaignActor | null): CampaignActor {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  return actor;
}

export function normalizeCampaignName(value: unknown): string {
  if (typeof value !== "string") {
    throw new CampaignServiceError("A campaign name is required.", 422);
  }
  const name = value.trim();
  if (
    name.length < 1
    || name.length > 120
    || /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    throw new CampaignServiceError(
      "Campaign names must be between 1 and 120 characters.",
      422,
    );
  }
  return name;
}

export async function getCampaignD1(): Promise<D1Database> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Campaign database is unavailable.");
  return env.DB;
}

async function findCampaignByPublicId(
  db: D1Database,
  publicId: string,
): Promise<CampaignRow | null> {
  if (!isPlausiblePublicCampaignId(publicId)) return null;
  return db
    .prepare(
      `SELECT id, public_id AS publicId, owner_user_id AS ownerUserId,
              name, version, created_at AS createdAt, updated_at AS updatedAt
       FROM campaigns
       WHERE public_id = ?`,
    )
    .bind(publicId)
    .first<CampaignRow>();
}

export async function getCampaignMembership(
  db: D1Database,
  campaignId: string,
  userId: string,
): Promise<CampaignMembershipRow | null> {
  return db
    .prepare(
      `SELECT campaign_id AS campaignId, user_id AS userId,
              role, joined_at AS joinedAt
       FROM campaign_members
       WHERE campaign_id = ? AND user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<CampaignMembershipRow>();
}

function campaignPayload(
  actor: CampaignActor,
  campaign: CampaignRow,
  membership: CampaignMembershipRecord | null,
): CampaignPayload {
  const isOwner = actor.userId === campaign.ownerUserId;
  return {
    id: campaign.publicId,
    name: campaign.name,
    version: campaign.version,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    membershipRole: membership?.role ?? null,
    isOwner,
    permissions: {
      canManageSettings: canManageCampaignSettings(actor, campaign),
      canDelete: canDeleteCampaign(actor, campaign),
      adminReadOnly: actor.role === "admin" && !isOwner,
    },
  };
}

async function loadCampaignAccess(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<{
  campaign: CampaignRow;
  membership: CampaignMembershipRow | null;
}> {
  const campaign = await findCampaignByPublicId(db, publicId);
  if (!campaign) throw notFound();
  const membership = await getCampaignMembership(
    db,
    campaign.id,
    actor.userId,
  );
  if (!canViewCampaign(actor, campaign, membership)) throw notFound();
  return { campaign, membership };
}

export async function createCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  input: { name?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignPayload> {
  const authenticatedActor = requireActor(actor);
  const name = normalizeCampaignName(input.name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const campaign: CampaignRow = {
      id: generateCampaignInternalId(),
      publicId: generatePublicCampaignId(),
      ownerUserId: authenticatedActor.userId,
      name,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const membership: CampaignMembershipRow = {
      campaignId: campaign.id,
      userId: authenticatedActor.userId,
      role: "gm",
      joinedAt: now,
    };

    try {
      await db.batch([
        db.prepare(
          `INSERT INTO campaigns
            (id, public_id, owner_user_id, name, description, version,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
        ).bind(
          campaign.id,
          campaign.publicId,
          campaign.ownerUserId,
          campaign.name,
          now,
          now,
        ),
        db.prepare(
          `INSERT INTO campaign_members
            (campaign_id, user_id, role, joined_at)
           VALUES (?, ?, 'gm', ?)`,
        ).bind(campaign.id, authenticatedActor.userId, now),
      ]);
      return campaignPayload(authenticatedActor, campaign, membership);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("public_id") || attempt === 4) throw error;
    }
  }

  throw new Error("Could not allocate a public campaign identifier.");
}

export async function listCampaigns(
  db: D1Database,
  actor: CampaignActor | null,
): Promise<CampaignPayload[]> {
  const authenticatedActor = requireActor(actor);
  const result = await db
    .prepare(
      `SELECT c.id, c.public_id AS publicId, c.owner_user_id AS ownerUserId,
              c.name, c.version, c.created_at AS createdAt,
              c.updated_at AS updatedAt, cm.role AS membershipRole
       FROM campaigns c
       INNER JOIN campaign_members cm ON cm.campaign_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.updated_at DESC`,
    )
    .bind(authenticatedActor.userId)
    .all<CampaignListRow>();
  return result.results.map((row) => campaignPayload(authenticatedActor, row, {
    campaignId: row.id,
    userId: authenticatedActor.userId,
    role: row.membershipRole,
  }));
}

export async function readCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<CampaignPayload> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  return campaignPayload(authenticatedActor, campaign, membership);
}

export async function listCampaignMembers(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<CampaignMemberPayload[]> {
  const authenticatedActor = requireActor(actor);
  const { campaign } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  const result = await db
    .prepare(
      `SELECT cm.campaign_id AS campaignId, cm.user_id AS userId,
              cm.role, cm.joined_at AS joinedAt, u.name AS displayName
       FROM campaign_members cm
       INNER JOIN user u ON u.id = cm.user_id
       WHERE cm.campaign_id = ?
       ORDER BY CASE WHEN cm.user_id = ? THEN 0 ELSE 1 END,
                lower(u.name), cm.joined_at`,
    )
    .bind(campaign.id, campaign.ownerUserId)
    .all<CampaignMemberRow>();
  return result.results.map((member) => ({
    name: member.displayName,
    role: member.role,
    joinedAt: member.joinedAt,
    isOwner: member.userId === campaign.ownerUserId,
  }));
}

export async function updateCampaignName(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  input: { name?: unknown; version?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignPayload> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  if (!canManageCampaignSettings(authenticatedActor, campaign)) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  const name = normalizeCampaignName(input.name);
  const expectedVersion = Number(input.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new CampaignServiceError("A valid campaign version is required.", 422);
  }
  if (campaign.version !== expectedVersion) {
    throw new CampaignServiceError(
      "This campaign was updated elsewhere.",
      409,
    );
  }

  const result = await db
    .prepare(
      `UPDATE campaigns
       SET name = ?, version = ?, updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND version = ?`,
    )
    .bind(
      name,
      campaign.version + 1,
      now,
      campaign.id,
      authenticatedActor.userId,
      expectedVersion,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new CampaignServiceError(
      "This campaign was updated elsewhere.",
      409,
    );
  }
  return campaignPayload(authenticatedActor, {
    ...campaign,
    name,
    version: campaign.version + 1,
    updatedAt: now,
  }, membership);
}

export async function deleteCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  const { campaign } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  if (!canDeleteCampaign(authenticatedActor, campaign)) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  const result = await db
    .prepare("DELETE FROM campaigns WHERE id = ? AND owner_user_id = ?")
    .bind(campaign.id, authenticatedActor.userId)
    .run();
  if (result.meta.changes !== 1) throw notFound();
}

export async function removeCampaignMember(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  targetUserId: string,
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership: actorMembership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  const targetMembership = await getCampaignMembership(
    db,
    campaign.id,
    targetUserId,
  );
  if (!targetMembership) throw notFound();
  if (!canRemoveCampaignMember(
    authenticatedActor,
    campaign,
    actorMembership,
    targetMembership,
  )) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  await db.batch([
    db.prepare(
      `DELETE FROM campaign_characters
       WHERE campaign_id = ?
         AND character_id IN (
           SELECT id FROM characters WHERE owner_user_id = ?
         )`,
    ).bind(campaign.id, targetUserId),
    db.prepare(
      `DELETE FROM campaign_members
       WHERE campaign_id = ? AND user_id = ? AND role = 'player'`,
    ).bind(campaign.id, targetUserId),
  ]);
}

export async function leaveCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  if (!canLeaveCampaign(authenticatedActor, campaign, membership)) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  await db.batch([
    db.prepare(
      `DELETE FROM campaign_characters
       WHERE campaign_id = ?
         AND character_id IN (
           SELECT id FROM characters WHERE owner_user_id = ?
         )`,
    ).bind(campaign.id, authenticatedActor.userId),
    db.prepare(
      "DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?",
    ).bind(campaign.id, authenticatedActor.userId),
  ]);
}
