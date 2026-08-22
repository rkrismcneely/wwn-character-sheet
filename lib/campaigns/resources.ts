import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, getCampaignD1, loadCampaignAccess } from "./service.ts";
import type { CampaignActor, CampaignResourceType } from "./types.ts";
import { hashOpaqueToken } from "../security/opaque-tokens.ts";

export interface CampaignResourcePayload {
  resourceKey: string;
  title: string;
  type: CampaignResourceType;
  content: string;
  position: number;
  updatedAt: string;
}

interface CampaignResourceRow {
  id: string;
  title: string;
  type: CampaignResourceType;
  content: string;
  position: number;
  updatedAt: string;
}

const RESOURCE_KEY_PATTERN = /^cres_[0-9a-f]{32}$/u;
const MAX_RESOURCES = 30;

async function resourceKey(campaignPublicId: string, id: string): Promise<string> {
  const hash = await hashOpaqueToken(`campaign-resource:${campaignPublicId}:${id}`);
  return `cres_${hash.slice(0, 32)}`;
}

function normalizeResourceTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new CampaignServiceError("A resource title is required.", 422);
  }
  const title = value.trim();
  if (title.length < 1 || title.length > 120 || /[\u0000-\u001f\u007f]/u.test(title)) {
    throw new CampaignServiceError("Resource titles must be between 1 and 120 characters.", 422);
  }
  return title;
}

function normalizeResourceContent(type: CampaignResourceType, value: unknown): string {
  if (typeof value !== "string") {
    throw new CampaignServiceError(type === "link" ? "A resource URL is required." : "Resource text is required.", 422);
  }
  const content = value.trim();
  if (content.length < 1 || content.length > (type === "link" ? 2048 : 4000)) {
    throw new CampaignServiceError(type === "link" ? "Resource URLs must be between 1 and 2048 characters." : "Resource text must be between 1 and 4000 characters.", 422);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) {
    throw new CampaignServiceError("Resource content must be plain text.", 422);
  }
  if (type === "link") {
    let url: URL;
    try {
      url = new URL(content);
    } catch {
      throw new CampaignServiceError("Resource links must be absolute HTTPS URLs.", 422);
    }
    if (url.protocol !== "https:") {
      throw new CampaignServiceError("Resource links must use HTTPS.", 422);
    }
    return url.toString();
  }
  return content;
}

function normalizeType(value: unknown): CampaignResourceType {
  if (value === "text" || value === "link") return value;
  throw new CampaignServiceError("Choose a text or link resource.", 422);
}

function toPayload(campaignPublicId: string, row: CampaignResourceRow): Promise<CampaignResourcePayload> {
  return resourceKey(campaignPublicId, row.id).then((key) => ({
    resourceKey: key,
    title: row.title,
    type: row.type,
    content: row.content,
    position: Number(row.position),
    updatedAt: row.updatedAt,
  }));
}

async function listRows(db: D1Database, campaignId: string): Promise<CampaignResourceRow[]> {
  const result = await db.prepare(
    `SELECT id, title, type, content, position, updated_at AS updatedAt
     FROM campaign_resources WHERE campaign_id = ? ORDER BY position ASC, created_at ASC`,
  ).bind(campaignId).all<CampaignResourceRow>();
  return result.results;
}

async function loadManagedCampaign(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<{ campaign: Awaited<ReturnType<typeof loadCampaignAccess>>["campaign"]; membership: Awaited<ReturnType<typeof loadCampaignAccess>>["membership"] }> {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  const access = await loadCampaignAccess(db, actor, publicId);
  if (!canManageCampaignContent(actor, access.campaign, access.membership)) {
    throw new CampaignServiceError("Not permitted.", 403);
  }
  return access;
}

export async function listCampaignResources(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
): Promise<CampaignResourcePayload[]> {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  const { campaign } = await loadCampaignAccess(db, actor, publicId);
  const rows = await listRows(db, campaign.id);
  return Promise.all(rows.map((row) => toPayload(campaign.publicId, row)));
}

export async function createCampaignResource(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  input: { title?: unknown; type?: unknown; content?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignResourcePayload[]> {
  const { campaign } = await loadManagedCampaign(db, actor, publicId);
  const rows = await listRows(db, campaign.id);
  if (rows.length >= MAX_RESOURCES) {
    throw new CampaignServiceError("Campaigns can have at most 30 resources.", 422);
  }
  const type = normalizeType(input.type);
  const title = normalizeResourceTitle(input.title);
  const content = normalizeResourceContent(type, input.content);
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO campaign_resources (id, campaign_id, title, type, content, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, campaign.id, title, type, content, rows.length, now, now).run();
  return listCampaignResources(db, actor, publicId);
}

export async function updateCampaignResource(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  rawResourceKey: unknown,
  input: { title?: unknown; type?: unknown; content?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignResourcePayload[]> {
  const { campaign } = await loadManagedCampaign(db, actor, publicId);
  if (typeof rawResourceKey !== "string" || !RESOURCE_KEY_PATTERN.test(rawResourceKey)) {
    throw new CampaignServiceError("A valid campaign resource is required.", 422);
  }
  const rows = await listRows(db, campaign.id);
  const row = rows.find(async (candidate) => (await resourceKey(campaign.publicId, candidate.id)) === rawResourceKey);
  let target: CampaignResourceRow | undefined;
  for (const candidate of rows) {
    if (await resourceKey(campaign.publicId, candidate.id) === rawResourceKey) {
      target = candidate;
      break;
    }
  }
  if (!target) throw new CampaignServiceError("Campaign resource not found.", 404);
  const type = normalizeType(input.type);
  const title = normalizeResourceTitle(input.title);
  const content = normalizeResourceContent(type, input.content);
  await db.prepare(
    `UPDATE campaign_resources SET title = ?, type = ?, content = ?, updated_at = ? WHERE id = ? AND campaign_id = ?`,
  ).bind(title, type, content, now, target.id, campaign.id).run();
  return listCampaignResources(db, actor, publicId);
}

export async function deleteCampaignResource(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  rawResourceKey: unknown,
): Promise<CampaignResourcePayload[]> {
  const { campaign } = await loadManagedCampaign(db, actor, publicId);
  if (typeof rawResourceKey !== "string" || !RESOURCE_KEY_PATTERN.test(rawResourceKey)) {
    throw new CampaignServiceError("A valid campaign resource is required.", 422);
  }
  const rows = await listRows(db, campaign.id);
  let target: CampaignResourceRow | undefined;
  for (const candidate of rows) {
    if (await resourceKey(campaign.publicId, candidate.id) === rawResourceKey) {
      target = candidate;
      break;
    }
  }
  if (!target) throw new CampaignServiceError("Campaign resource not found.", 404);
  await db.prepare("DELETE FROM campaign_resources WHERE id = ? AND campaign_id = ?").bind(target.id, campaign.id).run();
  const remaining = await listRows(db, campaign.id);
  await db.batch(remaining.map((row, index) => db.prepare("UPDATE campaign_resources SET position = ? WHERE id = ? AND campaign_id = ?").bind(index, row.id, campaign.id)));
  return listCampaignResources(db, actor, publicId);
}

export async function reorderCampaignResource(
  db: D1Database,
  actor: CampaignActor | null,
  publicId: string,
  rawResourceKey: unknown,
  direction: unknown,
): Promise<CampaignResourcePayload[]> {
  const { campaign } = await loadManagedCampaign(db, actor, publicId);
  if (typeof rawResourceKey !== "string" || !RESOURCE_KEY_PATTERN.test(rawResourceKey)) {
    throw new CampaignServiceError("A valid campaign resource is required.", 422);
  }
  if (direction !== "up" && direction !== "down") {
    throw new CampaignServiceError("Choose whether to move the resource up or down.", 422);
  }
  const rows = await listRows(db, campaign.id);
  const index = await (async () => {
    for (let i = 0; i < rows.length; i += 1) {
      if (await resourceKey(campaign.publicId, rows[i].id) === rawResourceKey) return i;
    }
    return -1;
  })();
  if (index < 0) throw new CampaignServiceError("Campaign resource not found.", 404);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return listCampaignResources(db, actor, publicId);
  const reordered = [...rows];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  await db.batch(reordered.map((row, position) => db.prepare("UPDATE campaign_resources SET position = ? WHERE id = ? AND campaign_id = ?").bind(position, row.id, campaign.id)));
  return listCampaignResources(db, actor, publicId);
}

export { getCampaignD1 };
