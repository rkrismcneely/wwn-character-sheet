import { canManageCampaignContent } from "./authorization.ts";
import {
  CampaignServiceError,
  loadCampaignAccess,
} from "./service.ts";
import type { CampaignActor } from "./types.ts";
import type { MapBackgroundContentType, MapImageDimensions } from "./map-images.ts";

interface CampaignMapRow {
  id: string;
  campaignId: string;
  backgroundKey: string | null;
  backgroundContentType: MapBackgroundContentType | null;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  gridEnabled: number;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMapPayload {
  backgroundUrl: string | null;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  grid: {
    enabled: boolean;
    size: number;
    offsetX: number;
    offsetY: number;
  };
  version: number;
  updatedAt: string;
}

export interface CampaignMapResponse {
  map: CampaignMapPayload | null;
  permissions: { canManage: boolean };
}

export interface CampaignMapAccess {
  campaignInternalId: string;
  campaignPublicId: string;
  archived: boolean;
  canManage: boolean;
  row: CampaignMapRow | null;
  payload: CampaignMapPayload | null;
}

function backgroundUrl(publicId: string, row: CampaignMapRow): string | null {
  return row.backgroundKey ? `/api/campaigns/${publicId}/map/background?v=${row.version}` : null;
}

function mapPayload(publicId: string, row: CampaignMapRow): CampaignMapPayload {
  return {
    backgroundUrl: backgroundUrl(publicId, row),
    backgroundWidth: row.backgroundWidth,
    backgroundHeight: row.backgroundHeight,
    grid: {
      enabled: Boolean(row.gridEnabled),
      size: row.gridSize,
      offsetX: row.gridOffsetX,
      offsetY: row.gridOffsetY,
    },
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

async function findCampaignMap(db: D1Database, campaignId: string): Promise<CampaignMapRow | null> {
  return db.prepare(
    `SELECT id, campaign_id AS campaignId, background_key AS backgroundKey,
            background_content_type AS backgroundContentType,
            background_width AS backgroundWidth, background_height AS backgroundHeight,
            grid_enabled AS gridEnabled, grid_size AS gridSize,
            grid_offset_x AS gridOffsetX, grid_offset_y AS gridOffsetY,
            version, created_at AS createdAt, updated_at AS updatedAt
     FROM campaign_maps WHERE campaign_id = ?`,
  ).bind(campaignId).first<CampaignMapRow>();
}

export async function loadCampaignMapAccess(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<CampaignMapAccess> {
  const { campaign, membership } = await loadCampaignAccess(db, actor, publicId);
  const row = await findCampaignMap(db, campaign.id);
  const canManage = !campaign.archivedAt && canManageCampaignContent(actor, campaign, membership);
  return {
    campaignInternalId: campaign.id,
    campaignPublicId: campaign.publicId,
    archived: Boolean(campaign.archivedAt),
    canManage,
    row,
    payload: row ? mapPayload(campaign.publicId, row) : null,
  };
}

export async function readCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<CampaignMapResponse> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  return { map: access.payload, permissions: { canManage: access.canManage } };
}

function requireMapManagement(access: CampaignMapAccess): void {
  if (access.archived) {
    throw new CampaignServiceError(
      "This campaign is archived. Restore it before making changes.",
      409,
    );
  }
  if (!access.canManage) throw new CampaignServiceError("Not permitted.", 403);
}

function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new CampaignServiceError("A current map version is required.", 422);
  }
  return Number(value);
}

function finiteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new CampaignServiceError(`${label} is outside the supported range.`, 422);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new CampaignServiceError(`${label} must be true or false.`, 422);
  return value;
}

function conflict(): CampaignServiceError {
  return new CampaignServiceError("The campaign map was updated elsewhere. Reload it and try again.", 409);
}

export async function updateCampaignMapSettings(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const version = expectedVersion(input.version);
  const gridEnabled = booleanValue(input.gridEnabled, "Grid visibility");
  const gridSize = finiteNumber(input.gridSize, "Grid size", 8, 512);
  const gridOffsetX = finiteNumber(input.gridOffsetX, "Horizontal grid offset", -100000, 100000);
  const gridOffsetY = finiteNumber(input.gridOffsetY, "Vertical grid offset", -100000, 100000);

  if (!access.row) {
    if (version !== 0) throw conflict();
    const id = `map_${crypto.randomUUID()}`;
    await db.prepare(
      `INSERT INTO campaign_maps
       (id, campaign_id, grid_enabled, grid_size, grid_offset_x, grid_offset_y,
        version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, access.campaignInternalId, gridEnabled ? 1 : 0, gridSize, gridOffsetX, gridOffsetY, now, now).run();
    const row = await findCampaignMap(db, access.campaignInternalId);
    if (!row) throw new Error("Campaign map creation did not persist.");
    return mapPayload(publicId, row);
  }

  if (version !== access.row.version) throw conflict();
  const result = await db.prepare(
    `UPDATE campaign_maps
     SET grid_enabled = ?, grid_size = ?, grid_offset_x = ?, grid_offset_y = ?,
         version = version + 1, updated_at = ?
     WHERE campaign_id = ? AND version = ?`,
  ).bind(gridEnabled ? 1 : 0, gridSize, gridOffsetX, gridOffsetY, now, access.campaignInternalId, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const row = await findCampaignMap(db, access.campaignInternalId);
  if (!row) throw new Error("Campaign map disappeared after update.");
  return mapPayload(publicId, row);
}

export async function replaceCampaignMapBackground(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: {
    version: number;
    key: string;
    contentType: MapBackgroundContentType;
    dimensions: MapImageDimensions;
  },
  now = new Date().toISOString(),
): Promise<{ map: CampaignMapPayload; previousKey: string | null }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const version = expectedVersion(input.version);
  const previousKey = access.row?.backgroundKey ?? null;

  if (!access.row) {
    if (version !== 0) throw conflict();
    const id = `map_${crypto.randomUUID()}`;
    await db.prepare(
      `INSERT INTO campaign_maps
       (id, campaign_id, background_key, background_content_type, background_width,
        background_height, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(id, access.campaignInternalId, input.key, input.contentType, input.dimensions.width, input.dimensions.height, now, now).run();
  } else {
    if (version !== access.row.version) throw conflict();
    const result = await db.prepare(
      `UPDATE campaign_maps
       SET background_key = ?, background_content_type = ?, background_width = ?,
           background_height = ?, version = version + 1, updated_at = ?
       WHERE campaign_id = ? AND version = ?`,
    ).bind(input.key, input.contentType, input.dimensions.width, input.dimensions.height, now, access.campaignInternalId, version).run();
    if (result.meta.changes !== 1) throw conflict();
  }

  const row = await findCampaignMap(db, access.campaignInternalId);
  if (!row) throw new Error("Campaign map background did not persist.");
  return { map: mapPayload(publicId, row), previousKey };
}

export async function removeCampaignMapBackground(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  versionValue: unknown,
  now = new Date().toISOString(),
): Promise<{ map: CampaignMapPayload | null; previousKey: string | null }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  if (!access.row) return { map: null, previousKey: null };
  const version = expectedVersion(versionValue);
  if (version !== access.row.version) throw conflict();
  const result = await db.prepare(
    `UPDATE campaign_maps
     SET background_key = NULL, background_content_type = NULL,
         background_width = NULL, background_height = NULL,
         version = version + 1, updated_at = ?
     WHERE campaign_id = ? AND version = ?`,
  ).bind(now, access.campaignInternalId, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const row = await findCampaignMap(db, access.campaignInternalId);
  return {
    map: row ? mapPayload(publicId, row) : null,
    previousKey: access.row.backgroundKey,
  };
}
