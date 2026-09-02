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

interface CampaignMapTokenRow {
  id: string;
  campaignId: string;
  kind: "pc" | "npc";
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
  kind: "pc" | "npc";
  sourceId: string;
  name: string;
  x: number;
  y: number;
  version: number;
  canMove: boolean;
}

export interface CampaignMapCharacterOption {
  id: string;
  name: string;
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
  tokens: CampaignMapToken[];
  version: number;
  updatedAt: string;
}

export interface CampaignMapResponse {
  map: CampaignMapPayload | null;
  permissions: { canManage: boolean };
  characters: CampaignMapCharacterOption[];
  encounterAvailable?: boolean;
}

export interface CampaignMapAccess {
  campaignInternalId: string;
  campaignPublicId: string;
  archived: boolean;
  canManage: boolean;
  row: CampaignMapRow | null;
}

function backgroundUrl(publicId: string, row: CampaignMapRow): string | null {
  return row.backgroundKey ? `/api/campaigns/${publicId}/map/background?v=${row.version}` : null;
}

async function ownCampaignCharacterIds(db: D1Database, actor: CampaignActor, campaignId: string): Promise<Set<string>> {
  const result = await db.prepare(`SELECT ch.public_id AS id
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.owner_user_id = ?`)
    .bind(campaignId, actor.userId).all<{ id: string }>();
  return new Set(result.results.map(character => character.id));
}

async function linkedCampaignCharacters(db: D1Database, campaignId: string): Promise<CampaignMapCharacterOption[]> {
  const result = await db.prepare(`SELECT ch.public_id AS id, ch.name
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ?
    ORDER BY lower(ch.name), ch.public_id`)
    .bind(campaignId).all<CampaignMapCharacterOption>();
  return result.results;
}

async function campaignMapTokens(
  db: D1Database,
  actor: CampaignActor,
  access: CampaignMapAccess,
): Promise<CampaignMapToken[]> {
  const result = await db.prepare(`SELECT id, campaign_id AS campaignId, kind, source_id AS sourceId,
      name, x, y, version, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_map_tokens WHERE campaign_id = ? ORDER BY created_at ASC, id ASC`)
    .bind(access.campaignInternalId).all<CampaignMapTokenRow>();
  const ownedCharacterIds = access.canManage ? new Set<string>() : await ownCampaignCharacterIds(db, actor, access.campaignInternalId);
  return result.results.map(token => ({
    id: token.id,
    kind: token.kind,
    sourceId: token.sourceId,
    name: token.name,
    x: token.x,
    y: token.y,
    version: token.version,
    canMove: access.canManage || (token.kind === "pc" && ownedCharacterIds.has(token.sourceId)),
  }));
}

async function mapPayload(
  db: D1Database,
  actor: CampaignActor,
  access: CampaignMapAccess,
  row: CampaignMapRow,
): Promise<CampaignMapPayload> {
  return {
    backgroundUrl: backgroundUrl(access.campaignPublicId, row),
    backgroundWidth: row.backgroundWidth,
    backgroundHeight: row.backgroundHeight,
    grid: {
      enabled: Boolean(row.gridEnabled),
      size: row.gridSize,
      offsetX: row.gridOffsetX,
      offsetY: row.gridOffsetY,
    },
    tokens: await campaignMapTokens(db, actor, access),
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
  };
}

export async function readCampaignMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
): Promise<CampaignMapResponse> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  return {
    map: access.row ? await mapPayload(db, actor, access, access.row) : null,
    permissions: { canManage: access.canManage },
    characters: access.canManage ? await linkedCampaignCharacters(db, access.campaignInternalId) : [],
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

function requireMapBackground(access: CampaignMapAccess): CampaignMapRow {
  if (!access.row?.backgroundKey || !access.row.backgroundWidth || !access.row.backgroundHeight) {
    throw new CampaignServiceError("Upload a campaign map image before placing tokens.", 409);
  }
  return access.row;
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

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > 120 || /[\u0000-\u001f\u007f]/u.test(text)) throw new CampaignServiceError(`${label} is invalid.`, 422);
  return text;
}

function conflict(label = "campaign map"): CampaignServiceError {
  return new CampaignServiceError(`The ${label} was updated elsewhere. Reload it and try again.`, 409);
}

function defaultTokenPosition(row: CampaignMapRow, index: number): { x: number; y: number } {
  const width = row.backgroundWidth as number;
  const height = row.backgroundHeight as number;
  const step = Math.max(24, Math.min(row.gridSize || 64, 256));
  const columns = Math.max(1, Math.floor(Math.max(step, width - step) / step));
  const x = Math.min(width - step / 2, step / 2 + (index % columns) * step);
  const y = Math.min(height - step / 2, step / 2 + Math.floor(index / columns) * step);
  return { x: Math.max(step / 2, x), y: Math.max(step / 2, y) };
}

async function tokenCount(db: D1Database, campaignId: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE campaign_id = ?")
    .bind(campaignId).first<{ count: number }>();
  return Number(row?.count ?? 0);
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
    return mapPayload(db, actor, { ...access, row }, row);
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
  return mapPayload(db, actor, { ...access, row }, row);
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
  return { map: await mapPayload(db, actor, { ...access, row }, row), previousKey };
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
    map: row ? await mapPayload(db, actor, { ...access, row }, row) : null,
    previousKey: access.row.backgroundKey,
  };
}

export async function placeCampaignMapCharacterToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  characterIdValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(access);
  const characterId = identifier(characterIdValue, "Character");
  const character = await db.prepare(`SELECT ch.public_id AS id, ch.name
    FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
    WHERE cc.campaign_id = ? AND ch.public_id = ?`)
    .bind(access.campaignInternalId, characterId).first<CampaignMapCharacterOption>();
  if (!character) throw new CampaignServiceError("The linked campaign character was not found.", 404);
  const position = defaultTokenPosition(row, await tokenCount(db, access.campaignInternalId));
  await db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens
    (id, campaign_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES (?, ?, 'pc', ?, ?, ?, ?, 1, ?, ?)`)
    .bind(`mpt_${crypto.randomUUID()}`, access.campaignInternalId, character.id, character.name, position.x, position.y, now, now).run();
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
  seeds: CampaignMapEncounterTokenSeed[],
  now = new Date().toISOString(),
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(access);
  if (!seeds.length) throw new CampaignServiceError("The active encounter has no combatants to place.", 409);
  const count = await tokenCount(db, access.campaignInternalId);
  const statements = seeds.slice(0, 100).map((seed, index) => {
    const position = defaultTokenPosition(row, count + index);
    return db.prepare(`INSERT OR IGNORE INTO campaign_map_tokens
      (id, campaign_id, kind, source_id, name, x, y, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .bind(
        `mpt_${crypto.randomUUID()}`,
        access.campaignInternalId,
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
  const row = requireMapBackground(access);
  const tokenId = identifier(input.tokenId, "Map token");
  const version = expectedVersion(input.version, "token");
  const token = await db.prepare(`SELECT id, campaign_id AS campaignId, kind, source_id AS sourceId,
      name, x, y, version, created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?`)
    .bind(access.campaignInternalId, tokenId).first<CampaignMapTokenRow>();
  if (!token) throw new CampaignServiceError("Map token not found.", 404);
  let canMove = access.canManage;
  if (!canMove && token.kind === "pc") {
    const own = await db.prepare(`SELECT 1 AS allowed
      FROM campaign_characters cc JOIN characters ch ON ch.id = cc.character_id
      WHERE cc.campaign_id = ? AND ch.public_id = ? AND ch.owner_user_id = ?`)
      .bind(access.campaignInternalId, token.sourceId, actor.userId).first<{ allowed: number }>();
    canMove = Boolean(own);
  }
  if (!canMove) throw new CampaignServiceError("You can move only your own campaign character token.", 403);
  const x = finiteNumber(input.x, "Token X position", 0, row.backgroundWidth as number);
  const y = finiteNumber(input.y, "Token Y position", 0, row.backgroundHeight as number);
  const result = await db.prepare(`UPDATE campaign_map_tokens
      SET x = ?, y = ?, version = version + 1, updated_at = ?
      WHERE campaign_id = ? AND id = ? AND version = ?`)
    .bind(x, y, now, access.campaignInternalId, tokenId, version).run();
  if (result.meta.changes !== 1) throw conflict("map token");
  return mapPayload(db, actor, access, row);
}

export async function removeCampaignMapToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  tokenIdValue: unknown,
): Promise<CampaignMapPayload> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  requireMapManagement(access);
  const row = requireMapBackground(access);
  const tokenId = identifier(tokenIdValue, "Map token");
  await db.prepare("DELETE FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?")
    .bind(access.campaignInternalId, tokenId).run();
  return mapPayload(db, actor, access, row);
}
