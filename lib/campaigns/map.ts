import { canManageCampaignContent } from "./authorization.ts";
import {
  CampaignServiceError,
  loadCampaignAccess,
} from "./service.ts";
import type { CampaignActor } from "./types.ts";
import type { MapBackgroundContentType, MapImageDimensions } from "./map-images.ts";
import {
  campaignMapCompanionCharacterId,
  campaignMapCompanionsFromCharacterData,
  type CampaignMapCompanionOption,
} from "./map-companions.ts";
import {
  isCampaignMapGridType,
  MAX_CAMPAIGN_MAP_GRID_SIZE,
  snapTokenCenterOnGrid,
  type CampaignMapGridType,
} from "./map-grid.ts";

interface CampaignMapRow {
  id: string;
  campaignId: string;
  name: string;
  isActive: number;
  backgroundKey: string | null;
  backgroundContentType: MapBackgroundContentType | null;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  gridEnabled: number;
  gridType: CampaignMapGridType;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface CampaignMapTokenRow {
  id: string;
  campaignId: string;
  mapId: string;
  kind: "pc" | "npc" | "companion";
  sourceId: string;
  name: string;
  x: number;
  y: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMapToken {
  id: string;
  kind: "pc" | "npc" | "companion";
  sourceId: string;
  name: string;
  x: number;
  y: number;
  version: number;
  canMove: boolean;
}

export interface CampaignMapFogCell {
  q: number;
  r: number;
}

export interface CampaignMapCharacterOption {
  id: string;
  name: string;
}

export interface CampaignMapSummary {
  id: string;
  name: string;
  isActive: boolean;
  hasBackground: boolean;
  updatedAt: string;
}

export interface CampaignMapPayload {
  id: string;
  name: string;
  isActive: boolean;
  backgroundUrl: string | null;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  grid: {
    enabled: boolean;
    type: CampaignMapGridType;
    size: number;
    offsetX: number;
    offsetY: number;
  };
  fogCells: CampaignMapFogCell[];
  tokens: CampaignMapToken[];
  version: number;
  updatedAt: string;
}

export interface CampaignMapResponse {
  map: CampaignMapPayload | null;
  maps: CampaignMapSummary[];
  permissions: { canManage: boolean };
  characters: CampaignMapCharacterOption[];
  companions: CampaignMapCompanionOption[];
  encounterAvailable?: boolean;
}

export interface CampaignMapAccess {
  campaignInternalId: string;
  campaignPublicId: string;
  archived: boolean;
  canManage: boolean;
}

function backgroundUrl(publicId: string, row: CampaignMapRow): string | null {
  if (!row.backgroundKey) return null;
  const params = new URLSearchParams({ mapId: row.id, v: String(row.version) });
  return `/api/campaigns/${publicId}/map/background?${params.toString()}`;
}

function mapSummary(row: CampaignMapRow): CampaignMapSummary {
  return {
    id: row.id,
    name: row.name,
    isActive: Boolean(row.isActive),
    hasBackground: Boolean(row.backgroundKey),
    updatedAt: row.updatedAt,
  };
}

function mapSelectSql(where: string): string {
  return `SELECT id, campaign_id AS campaignId, name, is_active AS isActive,
      background_key AS backgroundKey, background_content_type AS backgroundContentType,
      background_width AS backgroundWidth, background_height AS backgroundHeight,
      grid_enabled AS gridEnabled, grid_size AS gridSize,
      grid_type AS gridType,
      grid_offset_x AS gridOffsetX, grid_offset_y AS gridOffsetY,
      version, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_maps ${where}`;
}

async function findCampaignMapById(db: D1Database, campaignId: string, mapId: string): Promise<CampaignMapRow | null> {
  return db.prepare(`${mapSelectSql("WHERE campaign_id = ? AND id = ?")} LIMIT 1`)
    .bind(campaignId, mapId).first<CampaignMapRow>();
}

async function findActiveCampaignMap(db: D1Database, campaignId: string): Promise<CampaignMapRow | null> {
  return db.prepare(`${mapSelectSql("WHERE campaign_id = ? AND is_active = 1")} LIMIT 1`)
    .bind(campaignId).first<CampaignMapRow>();
}

async function firstCampaignMap(db: D1Database, campaignId: string): Promise<CampaignMapRow | null> {
  return db.prepare(`${mapSelectSql("WHERE campaign_id = ?")} ORDER BY created_at ASC, id ASC LIMIT 1`)
    .bind(campaignId).first<CampaignMapRow>();
}

async function allCampaignMaps(db: D1Database, campaignId: string): Promise<CampaignMapRow[]> {
  const result = await db.prepare(`${mapSelectSql("WHERE campaign_id = ?")} ORDER BY is_active DESC, lower(name), created_at ASC, id ASC`)
    .bind(campaignId).all<CampaignMapRow>();
  return result.results;
}

async function ownCampaignCharacterIds(db: D1Database, actor: CampaignActor, campaignId: string): Promise<Set<string>> {
  const result = await db.prepare(`SELECT ch.public_id AS id
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.owner_user_id = ?`)
    .bind(campaignId, actor.userId).all<{ id: string }>();
  return new Set(result.results.map(character => character.id));
}

type CampaignMapCompanionCharacterRow = { id: string; name: string; data: string };

// Both selectors are derived from the same authorized campaign character set.
// Read the rows once instead of querying the same join twice for every map load.
async function linkedCampaignMapRoster(
  db: D1Database,
  campaignId: string,
): Promise<{ characters: CampaignMapCharacterOption[]; companions: CampaignMapCompanionOption[] }> {
  const result = await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ?
    ORDER BY lower(ch.name), ch.public_id`)
    .bind(campaignId).all<CampaignMapCompanionCharacterRow>();
  return {
    characters: result.results.map(({ id, name }) => ({ id, name })),
    companions: result.results.flatMap(character =>
      campaignMapCompanionsFromCharacterData(character.id, character.name, character.data)),
  };
}

async function actorOwnsActiveCompanionSource(
  db: D1Database,
  actor: CampaignActor,
  campaignId: string,
  sourceId: string,
): Promise<boolean> {
  const characterId = campaignMapCompanionCharacterId(sourceId);
  if (!characterId) return false;
  const character = await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)
    .bind(campaignId, characterId, actor.userId).first<CampaignMapCompanionCharacterRow>();
  return Boolean(character && campaignMapCompanionsFromCharacterData(
    character.id, character.name, character.data).some(companion => companion.id === sourceId));
}

async function campaignMapTokens(
  db: D1Database,
  actor: CampaignActor,
  access: CampaignMapAccess,
  row: CampaignMapRow,
): Promise<CampaignMapToken[]> {
  const result = await db.prepare(`SELECT id, campaign_id AS campaignId, map_id AS mapId, kind,
      source_id AS sourceId, name, x, y, version, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_map_tokens WHERE map_id = ? ORDER BY created_at ASC, id ASC`)
    .bind(row.id).all<CampaignMapTokenRow>();
  const ownedCharacterIds = access.canManage ? new Set<string>() : await ownCampaignCharacterIds(db, actor, access.campaignInternalId);
  const ownedCompanionIds = access.canManage
    ? new Set<string>()
    : new Set((await db.prepare(`SELECT ch.public_id AS id, ch.name, ch.data
        FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
        WHERE cc.campaign_id = ? AND ch.owner_user_id = ?`)
      .bind(access.campaignInternalId, actor.userId).all<CampaignMapCompanionCharacterRow>()).results
      .flatMap(character => campaignMapCompanionsFromCharacterData(character.id, character.name, character.data))
      .map(companion => companion.id));
  return result.results.map(token => ({
    id: token.id,
    kind: token.kind,
    sourceId: token.sourceId,
    name: token.name,
    x: token.x,
    y: token.y,
    version: token.version,
    canMove: access.canManage
      || (token.kind === "pc" && ownedCharacterIds.has(token.sourceId))
      || (token.kind === "companion" && ownedCompanionIds.has(token.sourceId)),
  }));
}

async function campaignMapFogCells(db: D1Database, row: CampaignMapRow): Promise<CampaignMapFogCell[]> {
  const result = await db.prepare(`SELECT cell_q AS q, cell_r AS r
    FROM campaign_map_fog_cells WHERE map_id = ? ORDER BY cell_r, cell_q LIMIT 5000`)
    .bind(row.id).all<CampaignMapFogCell>();
  return result.results;
}

async function mapPayload(
  db: D1Database,
  actor: CampaignActor,
  access: CampaignMapAccess,
  row: CampaignMapRow,
): Promise<CampaignMapPayload> {
  return {
    id: row.id,
    name: row.name,
    isActive: Boolean(row.isActive),
    backgroundUrl: backgroundUrl(access.campaignPublicId, row),
    backgroundWidth: row.backgroundWidth,
    backgroundHeight: row.backgroundHeight,
    grid: {
      enabled: Boolean(row.gridEnabled),
      type: row.gridType,
      size: row.gridSize,
      offsetX: row.gridOffsetX,
      offsetY: row.gridOffsetY,
    },
    fogCells: await campaignMapFogCells(db, row),
    tokens: await campaignMapTokens(db, actor, access, row),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export async function loadCampaignMapAccess(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<CampaignMapAccess> {
  const { campaign, membership } = await loadCampaignAccess(db, actor, publicId);
  const canManage = !campaign.archivedAt && canManageCampaignContent(actor, campaign, membership);
  return {
    campaignInternalId: campaign.id,
    campaignPublicId: campaign.publicId,
    archived: Boolean(campaign.archivedAt),
    canManage,
  };
}

async function selectedCampaignMap(
  db: D1Database,
  access: CampaignMapAccess,
  requestedMapId?: string | null,
): Promise<CampaignMapRow | null> {
  const active = await findActiveCampaignMap(db, access.campaignInternalId);
  if (!access.canManage) {
    if (requestedMapId && active?.id !== requestedMapId) {
      throw new CampaignServiceError("Campaign map not found.", 404);
    }
    return active;
  }
  if (requestedMapId) {
    const requested = await findCampaignMapById(db, access.campaignInternalId, requestedMapId);
    if (!requested) throw new CampaignServiceError("Campaign map not found.", 404);
    return requested;
  }
  return active ?? firstCampaignMap(db, access.campaignInternalId);
}

export async function readCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  requestedMapId?: string | null,
  authorizedAccess?: CampaignMapAccess,
): Promise<CampaignMapResponse> {
  const access = authorizedAccess ?? await loadCampaignMapAccess(db, actor, publicId);
  const row = await selectedCampaignMap(db, access, requestedMapId);
  const [map, maps, roster] = await Promise.all([
    row ? mapPayload(db, actor, access, row) : Promise.resolve(null),
    access.canManage ? allCampaignMaps(db, access.campaignInternalId) : Promise.resolve([]),
    access.canManage ? linkedCampaignMapRoster(db, access.campaignInternalId)
      : Promise.resolve({ characters: [], companions: [] }),
  ]);
  return {
    map,
    maps: maps.map(mapSummary),
    permissions: { canManage: access.canManage },
    characters: roster.characters,
    companions: roster.companions,
  };
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

async function requireCampaignMap(
  db: D1Database,
  access: CampaignMapAccess,
  mapIdValue: unknown,
): Promise<CampaignMapRow> {
  const mapId = identifier(mapIdValue, "Map");
  const row = await findCampaignMapById(db, access.campaignInternalId, mapId);
  if (!row) throw new CampaignServiceError("Campaign map not found.", 404);
  if (!access.canManage && !row.isActive) throw new CampaignServiceError("Campaign map not found.", 404);
  return row;
}

function requireMapBackground(row: CampaignMapRow): CampaignMapRow {
  if (!row.backgroundKey || !row.backgroundWidth || !row.backgroundHeight) {
    throw new CampaignServiceError("Upload a campaign map image before placing tokens.", 409);
  }
  return row;
}

function expectedVersion(value: unknown, label = "map"): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new CampaignServiceError(`A current ${label} version is required.`, 422);
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

function gridType(value: unknown): CampaignMapGridType {
  if (!isCampaignMapGridType(value)) {
    throw new CampaignServiceError("Grid type must be square or hex.", 422);
  }
  return value;
}

function fogCells(value: unknown): CampaignMapFogCell[] {
  if (!Array.isArray(value) || !value.length || value.length > 500) {
    throw new CampaignServiceError("Choose between 1 and 500 map cells.", 422);
  }
  const seen = new Set<string>();
  return value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new CampaignServiceError(`Map cell ${index + 1} is invalid.`, 422);
    }
    const { q, r } = candidate as Record<string, unknown>;
    if (typeof q !== "number" || typeof r !== "number"
      || !Number.isSafeInteger(q) || !Number.isSafeInteger(r)
      || Math.abs(q) > 100000 || Math.abs(r) > 100000) {
      throw new CampaignServiceError(`Map cell ${index + 1} is invalid.`, 422);
    }
    const key = `${q}:${r}`;
    if (seen.has(key)) throw new CampaignServiceError("Map cells must be unique.", 422);
    seen.add(key);
    return { q, r };
  });
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > 120 || /[\u0000-\u001f\u007f]/u.test(text)) throw new CampaignServiceError(`${label} is invalid.`, 422);
  return text;
}

function mapName(value: unknown): string {
  if (typeof value !== "string") throw new CampaignServiceError("Map name is required.", 422);
  const text = value.trim().replace(/\s+/gu, " ");
  if (!text || text.length > 80 || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError("Map name must be between 1 and 80 readable characters.", 422);
  }
  return text;
}

function conflict(label = "campaign map"): CampaignServiceError {
  return new CampaignServiceError(`The ${label} was updated elsewhere. Reload it and try again.`, 409);
}

function defaultTokenPosition(row: CampaignMapRow, index: number): { x: number; y: number } {
  const width = row.backgroundWidth as number;
  const height = row.backgroundHeight as number;
  const desiredStep = Math.max(24, Math.min(row.gridSize || 64, 256));
  const step = Math.min(desiredStep, width, height);
  const columns = Math.max(1, Math.floor(Math.max(step, width - step) / step));
  const x = Math.min(width - step / 2, step / 2 + (index % columns) * step);
  const y = Math.min(height - step / 2, step / 2 + Math.floor(index / columns) * step);
  return snapTokenCenterOnGrid(
    { x: Math.max(step / 2, x), y: Math.max(step / 2, y) },
    { type: row.gridType, size: row.gridSize, offsetX: row.gridOffsetX, offsetY: row.gridOffsetY },
    1,
    width,
    height,
  );
}

async function tokenCount(db: D1Database, mapId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE map_id = ?")
    .bind(mapId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function createCampaignMapWithBackground(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: {
    name: string;
    key: string;
    contentType: MapBackgroundContentType;
    dimensions: MapImageDimensions;
  },
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const id = `map_${crypto.randomUUID()}`;
  const active = await findActiveCampaignMap(db, access.campaignInternalId);
  await db.prepare(`INSERT INTO campaign_maps
      (id, campaign_id, name, is_active, background_key, background_content_type,
       background_width, background_height, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(
      id,
      access.campaignInternalId,
      mapName(input.name),
      active ? 0 : 1,
      input.key,
      input.contentType,
      input.dimensions.width,
      input.dimensions.height,
      now,
      now,
    ).run();
  const row = await findCampaignMapById(db, access.campaignInternalId, id);
  if (!row) throw new Error("Campaign map creation did not persist.");
  return mapPayload(db, actor, access, row);
}

export async function renameCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = await requireCampaignMap(db, access, input.mapId);
  const version = expectedVersion(input.version);
  if (row.version !== version) throw conflict();
  const result = await db.prepare(`UPDATE campaign_maps
      SET name = ?, version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ? AND version = ?`)
    .bind(mapName(input.name), now, access.campaignInternalId, row.id, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const updated = await findCampaignMapById(db, access.campaignInternalId, row.id);
  if (!updated) throw new Error("Campaign map disappeared after rename.");
  return mapPayload(db, actor, access, updated);
}

export async function activateCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const target = await requireCampaignMap(db, access, mapIdValue);
  if (target.isActive) return mapPayload(db, actor, access, target);
  const active = await findActiveCampaignMap(db, access.campaignInternalId);
  const statements = [];
  if (active) {
    statements.push(db.prepare(`UPDATE campaign_maps
        SET is_active = 0, version = version + 1, updated_at = ?
        WHERE campaign_id = ? AND id = ? AND is_active = 1`)
      .bind(now, access.campaignInternalId, active.id));
  }
  statements.push(db.prepare(`UPDATE campaign_maps
      SET is_active = 1, version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ?`)
    .bind(now, access.campaignInternalId, target.id));
  await db.batch(statements);
  const updated = await findCampaignMapById(db, access.campaignInternalId, target.id);
  if (!updated) throw new Error("Active campaign map did not persist.");
  return mapPayload(db, actor, access, updated);
}

export async function deleteCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  now = new Date().toISOString(),
): Promise<{ selectedMapId: string | null; deletedKey: string | null; activeChanged: boolean }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = await requireCampaignMap(db, access, mapIdValue);
  const remaining = (await allCampaignMaps(db, access.campaignInternalId)).filter(candidate => candidate.id !== row.id);
  const replacement = row.isActive ? (remaining[0] ?? null) : null;
  const statements = [db.prepare("DELETE FROM campaign_maps WHERE campaign_id = ? AND id = ?").bind(access.campaignInternalId, row.id)];
  if (replacement) {
    statements.push(db.prepare(`UPDATE campaign_maps
        SET is_active = 1, version = version + 1, updated_at = ?
        WHERE campaign_id = ? AND id = ?`)
      .bind(now, access.campaignInternalId, replacement.id));
  }
  await db.batch(statements);
  return {
    selectedMapId: replacement?.id ?? remaining[0]?.id ?? null,
    deletedKey: row.backgroundKey,
    activeChanged: Boolean(row.isActive),
  };
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
  const row = await requireCampaignMap(db, access, input.mapId);
  const version = expectedVersion(input.version);
  const gridEnabled = booleanValue(input.gridEnabled, "Grid visibility");
  const nextGridType = gridType(input.gridType);
  const gridSize = finiteNumber(input.gridSize, "Grid size", 8, MAX_CAMPAIGN_MAP_GRID_SIZE);
  const gridOffsetX = finiteNumber(input.gridOffsetX, "Horizontal grid offset", -100000, 100000);
  const gridOffsetY = finiteNumber(input.gridOffsetY, "Vertical grid offset", -100000, 100000);
  if (version !== row.version) throw conflict();
  const result = await db.prepare(`UPDATE campaign_maps
      SET grid_enabled = ?, grid_type = ?, grid_size = ?, grid_offset_x = ?, grid_offset_y = ?,
          version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ? AND version = ?`)
    .bind(gridEnabled ? 1 : 0, nextGridType, gridSize, gridOffsetX, gridOffsetY, now, access.campaignInternalId, row.id, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const updated = await findCampaignMapById(db, access.campaignInternalId, row.id);
  if (!updated) throw new Error("Campaign map disappeared after update.");
  return mapPayload(db, actor, access, updated);
}

/** Hide or reveal a bounded group of grid cells without changing map pixels. */
export async function setCampaignMapFogCells(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = await requireCampaignMap(db, access, input.mapId);
  const mode = input.mode;
  if (mode !== "hide" && mode !== "reveal") {
    throw new CampaignServiceError("Choose whether to hide or reveal map cells.", 422);
  }
  const cells = fogCells(input.cells);
  const statements = cells.map(cell => mode === "hide"
    ? db.prepare(`INSERT OR IGNORE INTO campaign_map_fog_cells
        (map_id, campaign_id, cell_q, cell_r, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(row.id, access.campaignInternalId, cell.q, cell.r, now)
    : db.prepare("DELETE FROM campaign_map_fog_cells WHERE map_id = ? AND cell_q = ? AND cell_r = ?")
      .bind(row.id, cell.q, cell.r));
  await db.batch(statements);
  return mapPayload(db, actor, access, row);
}

export async function replaceCampaignMapBackground(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: {
    mapId: string;
    version: number;
    key: string;
    contentType: MapBackgroundContentType;
    dimensions: MapImageDimensions;
  },
  now = new Date().toISOString(),
): Promise<{ map: CampaignMapPayload; previousKey: string | null }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = await requireCampaignMap(db, access, input.mapId);
  const version = expectedVersion(input.version);
  if (version !== row.version) throw conflict();
  const result = await db.prepare(`UPDATE campaign_maps
      SET background_key = ?, background_content_type = ?, background_width = ?,
          background_height = ?, version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ? AND version = ?`)
    .bind(input.key, input.contentType, input.dimensions.width, input.dimensions.height, now, access.campaignInternalId, row.id, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const updated = await findCampaignMapById(db, access.campaignInternalId, row.id);
  if (!updated) throw new Error("Campaign map background did not persist.");
  return { map: await mapPayload(db, actor, access, updated), previousKey: row.backgroundKey };
}

export async function removeCampaignMapBackground(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  versionValue: unknown,
  now = new Date().toISOString(),
): Promise<{ map: CampaignMapPayload; previousKey: string | null }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = await requireCampaignMap(db, access, mapIdValue);
  const version = expectedVersion(versionValue);
  if (version !== row.version) throw conflict();
  const result = await db.prepare(`UPDATE campaign_maps
      SET background_key = NULL, background_content_type = NULL,
          background_width = NULL, background_height = NULL,
          version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ? AND version = ?`)
    .bind(now, access.campaignInternalId, row.id, version).run();
  if (result.meta.changes !== 1) throw conflict();
  const updated = await findCampaignMapById(db, access.campaignInternalId, row.id);
  if (!updated) throw new Error("Campaign map disappeared after background removal.");
  return {
    map: await mapPayload(db, actor, access, updated),
    previousKey: row.backgroundKey,
  };
}

export async function campaignMapBackgroundKey(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  requestedMapId?: string | null,
): Promise<string | null> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  const row = await selectedCampaignMap(db, access, requestedMapId);
  return row?.backgroundKey ?? null;
}

export async function placeCampaignMapCharacterToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  characterIdValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(await requireCampaignMap(db, access, mapIdValue));
  const characterId = identifier(characterIdValue, "Character");
  const character = await db.prepare(`SELECT ch.public_id AS id, ch.name
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.public_id = ?`)
    .bind(access.campaignInternalId, characterId).first<CampaignMapCharacterOption>();
  if (!character) throw new CampaignServiceError("The linked campaign character was not found.", 404);
  const position = defaultTokenPosition(row, await tokenCount(db, row.id));
  await db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens
    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES (?, ?, ?, 'pc', ?, ?, ?, ?, 1, ?, ?)`)
    .bind(`mpt_${crypto.randomUUID()}`, access.campaignInternalId, row.id, character.id, character.name, position.x, position.y, now, now).run();
  return mapPayload(db, actor, access, row);
}

export async function placeCampaignMapCompanionToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  companionIdValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(await requireCampaignMap(db, access, mapIdValue));
  const companionId = identifier(companionIdValue, "Companion");
  const companion = (await linkedCampaignMapRoster(db, access.campaignInternalId)).companions
    .find(option => option.id === companionId);
  if (!companion) throw new CampaignServiceError("The active linked companion was not found.", 404);
  const position = defaultTokenPosition(row, await tokenCount(db, row.id));
  await db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens
    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES (?, ?, ?, 'companion', ?, ?, ?, ?, 1, ?, ?)`)
    .bind(`mpt_${crypto.randomUUID()}`, access.campaignInternalId, row.id, companion.id, companion.name, position.x, position.y, now, now).run();
  return mapPayload(db, actor, access, row);
}

export interface CampaignMapEncounterTokenSeed {
  kind: "pc" | "npc";
  sourceId: string;
  name: string;
}

export async function placeCampaignMapEncounterTokens(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  seeds: CampaignMapEncounterTokenSeed[],
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(await requireCampaignMap(db, access, mapIdValue));
  if (!seeds.length) throw new CampaignServiceError("The active encounter has no combatants to place.", 409);
  const count = await tokenCount(db, row.id);
  const statements = seeds.slice(0, 100).map((seed, index) => {
    const position = defaultTokenPosition(row, count + index);
    return db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens
      (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(
        `mpt_${crypto.randomUUID()}`,
        access.campaignInternalId,
        row.id,
        seed.kind,
        identifier(seed.sourceId, "Combatant"),
        identifier(seed.name, "Combatant name"),
        position.x,
        position.y,
        now,
        now,
      );
  });
  if (statements.length) await db.batch(statements);
  return mapPayload(db, actor, access, row);
}

export async function moveCampaignMapToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  if (access.archived) throw new CampaignServiceError("This campaign is archived. Restore it before making changes.", 409);
  const row = requireMapBackground(await requireCampaignMap(db, access, input.mapId));
  const tokenId = identifier(input.tokenId, "Map token");
  const version = expectedVersion(input.version, "token");
  const token = await db.prepare(`SELECT id, campaign_id AS campaignId, map_id AS mapId, kind,
      source_id AS sourceId, name, x, y, version, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_map_tokens WHERE map_id = ? AND id = ?`)
    .bind(row.id, tokenId).first<CampaignMapTokenRow>();
  if (!token) throw new CampaignServiceError("Map token not found.", 404);
  let canMove = access.canManage;
  if (!canMove && token.kind === "pc") {
    const own = await db.prepare(`SELECT 1 AS allowed
      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
      WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)
      .bind(access.campaignInternalId, token.sourceId, actor.userId).first<{ allowed: number }>();
    canMove = Boolean(own);
  }
  if (!canMove && token.kind === "companion") {
    canMove = await actorOwnsActiveCompanionSource(db, actor, access.campaignInternalId, token.sourceId);
  }
  if (!canMove) throw new CampaignServiceError("You can move only your own campaign character or companion token.", 403);
  const x = finiteNumber(input.x, "Token X position", 0, row.backgroundWidth as number);
  const y = finiteNumber(input.y, "Token Y position", 0, row.backgroundHeight as number);
  const result = await db.prepare(`UPDATE campaign_map_tokens
      SET x = ?, y = ?, version = version + 1, updated_at = ?
      WHERE map_id = ? AND id = ? AND version = ?`)
    .bind(x, y, now, row.id, tokenId, version).run();
  if (result.meta.changes !== 1) throw conflict("map token");
  return mapPayload(db, actor, access, row);
}

export async function removeCampaignMapToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  tokenIdValue: unknown,
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(await requireCampaignMap(db, access, mapIdValue));
  const tokenId = identifier(tokenIdValue, "Map token");
  await db.prepare("DELETE FROM campaign_map_tokens WHERE map_id = ? AND id = ?")
    .bind(row.id, tokenId).run();
  return mapPayload(db, actor, access, row);
}
