import {
  canDeleteCampaign,
  canInviteCampaignMembers,
  canManageCampaignContent,
  canManageCampaignRuntime,
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
import { hashOpaqueToken } from "../security/opaque-tokens.ts";
import { effectiveDisplayName } from "../account/display-name.ts";

export type CampaignServiceStatus = 400 | 401 | 403 | 404 | 409 | 422;

export class CampaignServiceError extends Error {
  public readonly status: CampaignServiceStatus;

  constructor(message: string, status: CampaignServiceStatus) {
    super(message);
    this.status = status;
  }
}

export interface CampaignRow extends CampaignAccessRecord {
  publicId: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}

interface CampaignMembershipRow extends CampaignMembershipRecord {
  joinedAt: string;
}

interface CampaignListRow extends CampaignRow {
  membershipRole: CampaignRole;
}

interface CampaignMemberRow extends CampaignMembershipRow {
  providerName: string;
  customDisplayName: string | null;
}

export interface CampaignPayload {
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
  permissions: {
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
}

export interface CampaignMemberPayload {
  memberKey: string;
  name: string;
  role: CampaignRole;
  joinedAt: string;
  isOwner: boolean;
}

const CAMPAIGN_MEMBER_KEY_PATTERN = /^cmem_[0-9a-f]{32}$/u;

async function campaignMemberKey(
  campaignPublicId: string,
  userId: string,
): Promise<string> {
  const hash = await hashOpaqueToken(
    `campaign-member:${campaignPublicId}:${userId}`,
  );
  return `cmem_${hash.slice(0, 32)}`;
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
      `SELECT c.id, c.public_id AS publicId, c.owner_user_id AS ownerUserId,
              c.name, c.description, c.archived_at AS archivedAt,
              c.version, c.created_at AS createdAt,
              c.updated_at AS updatedAt,
              (SELECT COUNT(*) FROM campaign_members cm
               WHERE cm.campaign_id = c.id) AS memberCount
       FROM campaigns c
       WHERE c.public_id = ?`,
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
  const isActive = !campaign.archivedAt;
  return {
    id: campaign.publicId,
    name: campaign.name,
    description: campaign.description ?? null,
    archivedAt: campaign.archivedAt,
    version: campaign.version,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    memberCount: Number(campaign.memberCount) || 0,
    membershipRole: membership?.role ?? null,
    isOwner,
    permissions: {
      canManageSettings: isActive && canManageCampaignSettings(actor, campaign),
      canManageContent: isActive && canManageCampaignContent(actor, campaign, membership),
      canUseGmConsole: isActive && canManageCampaignRuntime(actor, campaign),
      canDelete: canDeleteCampaign(actor, campaign),
      canArchive: isActive && isOwner,
      canRestore: !isActive && isOwner,
      canInviteMembers: isActive && canInviteCampaignMembers(actor, campaign, membership),
      canRemovePlayers: isActive && canInviteCampaignMembers(actor, campaign, membership),
      canLeave: isActive && canLeaveCampaign(actor, campaign, membership),
      canLinkCharacters: isActive,
      adminReadOnly: false,
    },
  };
}

export function requireActiveCampaign(campaign: CampaignAccessRecord): void {
  if (campaign.archivedAt) {
    throw new CampaignServiceError(
      "This campaign is archived. Restore it before making changes.",
      409,
    );
  }
}

export async function setCampaignArchived(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  archived: boolean,
  now = new Date().toISOString(),
): Promise<CampaignPayload> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(db, authenticatedActor, publicId);
  if (campaign.ownerUserId !== authenticatedActor.userId) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  if (archived === Boolean(campaign.archivedAt)) {
    return campaignPayload(authenticatedActor, campaign, membership);
  }
  const archivedAt = archived ? now : null;
  const result = await db.prepare(
    `UPDATE campaigns SET archived_at = ?, updated_at = ?
     WHERE id = ? AND owner_user_id = ?
       AND ${archived ? "archived_at IS NULL" : "archived_at IS NOT NULL"}`,
  ).bind(archivedAt, now, campaign.id, authenticatedActor.userId).run();
  if (result.meta.changes !== 1) {
    throw new CampaignServiceError("The campaign lifecycle changed elsewhere.", 409);
  }
  return campaignPayload(authenticatedActor, { ...campaign, archivedAt, updatedAt: now }, membership);
}

export async function loadCampaignAccess(
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
      description: null,
      archivedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
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
              c.name, c.description, c.archived_at AS archivedAt,
              c.version, c.created_at AS createdAt,
              c.updated_at AS updatedAt, cm.role AS membershipRole,
              (SELECT COUNT(*) FROM campaign_members roster
               WHERE roster.campaign_id = c.id) AS memberCount
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
              cm.role, cm.joined_at AS joinedAt,
              u.name AS providerName, u.display_name AS customDisplayName
       FROM campaign_members cm
       INNER JOIN user u ON u.id = cm.user_id
       WHERE cm.campaign_id = ?
       ORDER BY CASE WHEN cm.user_id = ? THEN 0 ELSE 1 END,
                lower(COALESCE(NULLIF(trim(u.display_name), ''), u.name)),
                cm.joined_at`,
    )
    .bind(campaign.id, campaign.ownerUserId)
    .all<CampaignMemberRow>();
  return Promise.all(result.results.map(async (member) => ({
    memberKey: await campaignMemberKey(campaign.publicId, member.userId),
    name: effectiveDisplayName(
      member.customDisplayName,
      member.providerName,
    ),
    role: member.role,
    joinedAt: member.joinedAt,
    isOwner: member.userId === campaign.ownerUserId,
  })));
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
  requireActiveCampaign(campaign);
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

export function normalizeCampaignDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new CampaignServiceError("Campaign descriptions must be plain text.", 422);
  }
  const description = value.trim();
  if (description.length === 0) return null;
  if (description.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(description)) {
    throw new CampaignServiceError("Campaign descriptions must be plain text up to 4000 characters.", 422);
  }
  return description;
}

export async function updateCampaignDescription(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  input: { description?: unknown; version?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignPayload> {
  const authenticatedActor = requireActor(actor);
  const { campaign, membership } = await loadCampaignAccess(db, authenticatedActor, publicId);
  requireActiveCampaign(campaign);
  if (!canManageCampaignContent(authenticatedActor, campaign, membership)) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  const description = normalizeCampaignDescription(input.description);
  const expectedVersion = Number(input.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new CampaignServiceError("A valid campaign version is required.", 422);
  }
  if (campaign.version !== expectedVersion) {
    throw new CampaignServiceError("This campaign was updated elsewhere.", 409);
  }
  const result = await db.prepare(
    `UPDATE campaigns SET description = ?, version = ?, updated_at = ?
     WHERE id = ? AND version = ?`,
  ).bind(description, campaign.version + 1, now, campaign.id, expectedVersion).run();
  if (result.meta.changes !== 1) {
    throw new CampaignServiceError("This campaign was updated elsewhere.", 409);
  }
  return campaignPayload(authenticatedActor, {
    ...campaign,
    description,
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
  requireActiveCampaign(campaign);
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

export async function removeCampaignMemberByKey(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  rawMemberKey: unknown,
): Promise<void> {
  const authenticatedActor = requireActor(actor);
  if (
    typeof rawMemberKey !== "string"
    || !CAMPAIGN_MEMBER_KEY_PATTERN.test(rawMemberKey)
  ) {
    throw new CampaignServiceError("A valid campaign member is required.", 422);
  }
  const { campaign, membership: actorMembership } = await loadCampaignAccess(
    db,
    authenticatedActor,
    publicId,
  );
  requireActiveCampaign(campaign);
  const result = await db
    .prepare(
      `SELECT campaign_id AS campaignId, user_id AS userId, role
       FROM campaign_members
       WHERE campaign_id = ? AND role = 'player'`,
    )
    .bind(campaign.id)
    .all<CampaignMembershipRecord>();
  let targetMembership: CampaignMembershipRecord | null = null;
  for (const candidate of result.results) {
    if (await campaignMemberKey(campaign.publicId, candidate.userId) === rawMemberKey) {
      targetMembership = candidate;
      break;
    }
  }
  if (!targetMembership) throw notFound();
  if (!canRemoveCampaignMember(
    authenticatedActor,
    campaign,
    actorMembership,
    targetMembership,
  )) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  await removeCampaignMember(
    db,
    authenticatedActor,
    publicId,
    targetMembership.userId,
  );
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
  requireActiveCampaign(campaign);
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
