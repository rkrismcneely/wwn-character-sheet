import { CampaignServiceError } from "./service.ts";
import { loadCampaignMapAccess } from "./map.ts";
import {
  clampTokenSizeCells,
  snapTokenCenterOnGrid,
  type CampaignMapGridType,
} from "./map-grid.ts";
import type { CampaignActor } from "./types.ts";

interface InteractionMapRow {
  id: string;
  isActive: number;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
  gridType: CampaignMapGridType;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

interface InteractionTokenRow {
  id: string;
  x: number;
  y: number;
  version: number;
}

interface MapPreferenceRow {
  snapEnabled: number;
  sharedRollDiceEnabled: number;
}

export interface CampaignMapInteractions {
  snapEnabled: boolean;
  sharedRollDiceEnabled: boolean;
  tokenSizes: Record<string, number>;
}

export interface ResizedCampaignMapToken {
  id: string;
  x: number;
  y: number;
  version: number;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > 120 || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return text;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new CampaignServiceError(`${label} must be true or false.`, 422);
  return value;
}

async function interactionMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<{ access: Awaited<ReturnType<typeof loadCampaignMapAccess>>; map: InteractionMapRow }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  const mapId = identifier(mapIdValue, "Map");
  const map = await db.prepare(`SELECT id, is_active AS isActive,
      background_width AS backgroundWidth, background_height AS backgroundHeight,
      grid_type AS gridType, grid_size AS gridSize,
      grid_offset_x AS gridOffsetX, grid_offset_y AS gridOffsetY
    FROM campaign_maps WHERE campaign_id = ? AND id = ?`)
    .bind(access.campaignInternalId, mapId).first<InteractionMapRow>();
  if (!map || (!access.canManage && !map.isActive)) throw new CampaignServiceError("Campaign map not found.", 404);
  return { access, map };
}

function requireManagement(access: Awaited<ReturnType<typeof loadCampaignMapAccess>>): void {
  if (access.archived) throw new CampaignServiceError("This campaign is archived. Restore it before making changes.", 409);
  if (!access.canManage) throw new CampaignServiceError("Not permitted.", 403);
}

async function mapPreferences(db: D1Database, mapId: string): Promise<{ snapEnabled: boolean; sharedRollDiceEnabled: boolean }> {
  const row = await db.prepare(`SELECT snap_enabled AS snapEnabled,
      shared_roll_dice_enabled AS sharedRollDiceEnabled
    FROM campaign_map_preferences WHERE map_id = ?`)
    .bind(mapId).first<MapPreferenceRow>();
  return {
    snapEnabled: Boolean(row?.snapEnabled),
    sharedRollDiceEnabled: row ? Boolean(row.sharedRollDiceEnabled) : true,
  };
}

async function snapEnabled(db: D1Database, mapId: string): Promise<boolean> {
  return (await mapPreferences(db, mapId)).snapEnabled;
}

async function tokenSizeCells(db: D1Database, mapId: string, tokenId: string): Promise<number> {
  const row = await db.prepare("SELECT size_cells AS sizeCells FROM campaign_map_token_sizes WHERE map_id = ? AND token_id = ?")
    .bind(mapId, tokenId).first<{ sizeCells: number }>();
  return clampTokenSizeCells(row?.sizeCells ?? 1);
}

export async function readCampaignMapInteractions(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<CampaignMapInteractions> {
  const { map } = await interactionMap(db, actor, publicId, mapIdValue);
  const [preferences, sizes] = await Promise.all([
    mapPreferences(db, map.id),
    db.prepare(`SELECT s.token_id AS tokenId, s.size_cells AS sizeCells
      FROM campaign_map_token_sizes s
      JOIN campaign_map_tokens t ON t.id = s.token_id
      WHERE s.map_id = ? AND t.map_id = ?`)
      .bind(map.id, map.id).all<{ tokenId: string; sizeCells: number }>(),
  ]);
  return {
    snapEnabled: preferences.snapEnabled,
    sharedRollDiceEnabled: preferences.sharedRollDiceEnabled,
    tokenSizes: Object.fromEntries(sizes.results.map(row => [row.tokenId, clampTokenSizeCells(row.sizeCells)])),
  };
}

export async function snapCampaignMapTokenMove(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { map } = await interactionMap(db, actor, publicId, input.mapId);
  if (!await snapEnabled(db, map.id) || !map.backgroundWidth || !map.backgroundHeight) return input;
  if (typeof input.x !== "number" || !Number.isFinite(input.x) || typeof input.y !== "number" || !Number.isFinite(input.y)) {
    return input;
  }
  const tokenId = identifier(input.tokenId, "Map token");
  const sizeCells = await tokenSizeCells(db, map.id, tokenId);
  const snapped = snapTokenCenterOnGrid(
    { x: input.x, y: input.y },
    { type: map.gridType, size: map.gridSize, offsetX: map.gridOffsetX, offsetY: map.gridOffsetY },
    sizeCells,
    map.backgroundWidth,
    map.backgroundHeight,
  );
  return { ...input, ...snapped };
}

export async function setCampaignMapSnapPreference(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  enabledValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapInteractions> {
  const { access, map } = await interactionMap(db, actor, publicId, mapIdValue);
  requireManagement(access);
  const enabled = booleanValue(enabledValue, "Grid snapping");
  await db.prepare(`INSERT INTO campaign_map_preferences (map_id, campaign_id, snap_enabled, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(map_id) DO UPDATE SET snap_enabled = excluded.snap_enabled, updated_at = excluded.updated_at`)
    .bind(map.id, access.campaignInternalId, enabled ? 1 : 0, now).run();
  return readCampaignMapInteractions(db, actor, publicId, map.id);
}

export async function setCampaignMapSharedRollDicePreference(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  enabledValue: unknown,
  now = new Date().toISOString(),
): Promise<CampaignMapInteractions> {
  const { access, map } = await interactionMap(db, actor, publicId, mapIdValue);
  requireManagement(access);
  const enabled = booleanValue(enabledValue, "Shared roll dice");
  await db.prepare(`INSERT INTO campaign_map_preferences
      (map_id, campaign_id, snap_enabled, shared_roll_dice_enabled, updated_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(map_id) DO UPDATE SET shared_roll_dice_enabled = excluded.shared_roll_dice_enabled,
        updated_at = excluded.updated_at`)
    .bind(map.id, access.campaignInternalId, enabled ? 1 : 0, now).run();
  return readCampaignMapInteractions(db, actor, publicId, map.id);
}

export async function resizeCampaignMapToken(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  tokenIdValue: unknown,
  sizeCellsValue: unknown,
  now = new Date().toISOString(),
): Promise<{ interactions: CampaignMapInteractions; token: ResizedCampaignMapToken }> {
  const { access, map } = await interactionMap(db, actor, publicId, mapIdValue);
  requireManagement(access);
  const tokenId = identifier(tokenIdValue, "Map token");
  if (typeof sizeCellsValue !== "number" || !Number.isSafeInteger(sizeCellsValue) || sizeCellsValue < 1 || sizeCellsValue > 12) {
    throw new CampaignServiceError("Token size must be between 1 and 12 grid cells.", 422);
  }
  const sizeCells = clampTokenSizeCells(sizeCellsValue);
  const token = await db.prepare("SELECT id, x, y, version FROM campaign_map_tokens WHERE map_id = ? AND id = ?")
    .bind(map.id, tokenId).first<InteractionTokenRow>();
  if (!token) throw new CampaignServiceError("Map token not found.", 404);

  let x = token.x;
  let y = token.y;
  if (await snapEnabled(db, map.id)) {
    if (map.backgroundWidth && map.backgroundHeight) {
      const snapped = snapTokenCenterOnGrid(
        { x, y },
        { type: map.gridType, size: map.gridSize, offsetX: map.gridOffsetX, offsetY: map.gridOffsetY },
        sizeCells,
        map.backgroundWidth,
        map.backgroundHeight,
      );
      x = snapped.x;
      y = snapped.y;
    }
  }

  const statements = [
    db.prepare(`INSERT INTO campaign_map_token_sizes (token_id, map_id, campaign_id, size_cells, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(token_id) DO UPDATE SET size_cells = excluded.size_cells, updated_at = excluded.updated_at`)
      .bind(token.id, map.id, access.campaignInternalId, sizeCells, now),
  ];
  let version = token.version;
  if (x !== token.x || y !== token.y) {
    statements.push(db.prepare(`UPDATE campaign_map_tokens
        SET x = ?, y = ?, version = version + 1, updated_at = ?
        WHERE map_id = ? AND id = ?`)
      .bind(x, y, now, map.id, token.id));
    version += 1;
  }
  await db.batch(statements);

  return {
    interactions: await readCampaignMapInteractions(db, actor, publicId, map.id),
    token: { id: token.id, x, y, version },
  };
}
