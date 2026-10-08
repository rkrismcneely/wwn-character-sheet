import { CampaignServiceError } from "./service.ts";
import { loadCampaignMapAccess } from "./map.ts";
import type { CampaignActor } from "./types.ts";
import {
  campaignMapAreaTemplateMaxSize,
  campaignMapAreaTemplateMinSize,
  clampCampaignMapAreaTemplateSize,
  isCampaignMapAreaTemplateShape,
  normalizeCampaignMapAreaTemplateAngle,
  parseCampaignMapAreaTemplateColor,
  type CampaignMapAreaTemplate,
  type CampaignMapAreaTemplateShape,
} from "./map-area-template-model.ts";

type AreaTemplateMapRow = {
  id: string;
  isActive: number;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
};

type AreaTemplateRow = {
  id: string;
  shape: CampaignMapAreaTemplateShape;
  x: number;
  y: number;
  sizeSpaces: number;
  angleDegrees: number;
  color: string;
  creatorUserId: string;
  createdAt: string;
  updatedAt: string;
};

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > 160 || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return text;
}

function finitePoint(value: unknown, maximum: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new CampaignServiceError(`${label} is outside the map.`, 422);
  }
  return Math.round(value * 100) / 100;
}

async function areaTemplateMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<{ access: Awaited<ReturnType<typeof loadCampaignMapAccess>>; map: AreaTemplateMapRow }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  const mapId = identifier(mapIdValue, "Map");
  const map = await db.prepare(`SELECT id, is_active AS isActive,
      background_width AS backgroundWidth, background_height AS backgroundHeight
    FROM campaign_maps WHERE campaign_id = ? AND id = ?`)
    .bind(access.campaignInternalId, mapId).first<AreaTemplateMapRow>();
  if (!map || (!access.canManage && !map.isActive)) throw new CampaignServiceError("Campaign map not found.", 404);
  if (!map.backgroundWidth || !map.backgroundHeight) {
    throw new CampaignServiceError("Add a map image before placing an area template.", 409);
  }
  return { access, map };
}

function requireWritable(access: Awaited<ReturnType<typeof loadCampaignMapAccess>>): void {
  if (access.archived) throw new CampaignServiceError("This campaign is archived. Restore it before making changes.", 409);
}

function missingAreaTemplateTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*campaign_map_area_templates/iu.test(error.message);
}

function canEditAreaTemplate(
  access: Awaited<ReturnType<typeof loadCampaignMapAccess>>,
  actor: CampaignActor,
  creatorUserId: string,
): boolean {
  return access.canManage || creatorUserId === actor.userId;
}

function publicTemplate(
  row: AreaTemplateRow,
  access: Awaited<ReturnType<typeof loadCampaignMapAccess>>,
  actor: CampaignActor,
): CampaignMapAreaTemplate {
  return {
    id: row.id,
    shape: row.shape,
    x: row.x,
    y: row.y,
    sizeSpaces: row.sizeSpaces,
    angleDegrees: row.angleDegrees,
    color: parseCampaignMapAreaTemplateColor(row.color),
    canEdit: canEditAreaTemplate(access, actor, row.creatorUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validatedShape(value: unknown): CampaignMapAreaTemplateShape {
  if (!isCampaignMapAreaTemplateShape(value)) throw new CampaignServiceError("Area shape is invalid.", 422);
  return value;
}

function validatedSize(value: unknown): number {
  const size = clampCampaignMapAreaTemplateSize(value);
  if (typeof value !== "number" || !Number.isFinite(value) || Math.round(value) !== value
      || value < campaignMapAreaTemplateMinSize || value > campaignMapAreaTemplateMaxSize) {
    throw new CampaignServiceError(`Area size must be a whole number from ${campaignMapAreaTemplateMinSize} to ${campaignMapAreaTemplateMaxSize}.`, 422);
  }
  return size;
}

async function templateRow(
  db: D1Database,
  campaignId: string,
  mapId: string,
  templateIdValue: unknown,
): Promise<AreaTemplateRow> {
  const templateId = identifier(templateIdValue, "Area template");
  const row = await db.prepare(`SELECT id, shape, x, y, size_spaces AS sizeSpaces,
      angle_degrees AS angleDegrees, color, creator_user_id AS creatorUserId,
      created_at AS createdAt, updated_at AS updatedAt
    FROM campaign_map_area_templates
    WHERE campaign_id = ? AND map_id = ? AND id = ?`)
    .bind(campaignId, mapId, templateId).first<AreaTemplateRow>();
  if (!row) throw new CampaignServiceError("Area template not found.", 404);
  return row;
}

export async function readCampaignMapAreaTemplates(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<CampaignMapAreaTemplate[]> {
  const { access, map } = await areaTemplateMap(db, actor, publicId, mapIdValue);
  try {
    const result = await db.prepare(`SELECT id, shape, x, y, size_spaces AS sizeSpaces,
        angle_degrees AS angleDegrees, color, creator_user_id AS creatorUserId,
        created_at AS createdAt, updated_at AS updatedAt
      FROM campaign_map_area_templates
      WHERE map_id = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 100`)
      .bind(map.id).all<AreaTemplateRow>();
    return result.results.map(row => publicTemplate(row, access, actor));
  } catch (error) {
    if (missingAreaTemplateTable(error)) return [];
    throw error;
  }
}

export async function createCampaignMapAreaTemplate(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapAreaTemplate> {
  const { access, map } = await areaTemplateMap(db, actor, publicId, input.mapId);
  requireWritable(access);
  const count = await db.prepare("SELECT COUNT(*) AS count FROM campaign_map_area_templates WHERE map_id = ?")
    .bind(map.id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 100) {
    throw new CampaignServiceError("This map has reached the 100-area-template limit. Remove one before adding another.", 409);
  }

  const shape = validatedShape(input.shape);
  const sizeSpaces = validatedSize(input.sizeSpaces);
  const x = finitePoint(input.x, map.backgroundWidth as number, "Horizontal position");
  const y = finitePoint(input.y, map.backgroundHeight as number, "Vertical position");
  const angleDegrees = normalizeCampaignMapAreaTemplateAngle(input.angleDegrees);
  const color = parseCampaignMapAreaTemplateColor(input.color);
  const id = `area_${crypto.randomUUID()}`;

  await db.prepare(`INSERT INTO campaign_map_area_templates
      (id, campaign_id, map_id, creator_user_id, shape, x, y, size_spaces, angle_degrees, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, access.campaignInternalId, map.id, actor.userId, shape, x, y, sizeSpaces, angleDegrees, color, now, now).run();

  return { id, shape, x, y, sizeSpaces, angleDegrees, color, canEdit: true, createdAt: now, updatedAt: now };
}

export async function updateCampaignMapAreaTemplate(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapAreaTemplate> {
  const { access, map } = await areaTemplateMap(db, actor, publicId, input.mapId);
  requireWritable(access);
  const row = await templateRow(db, access.campaignInternalId, map.id, input.templateId);
  if (!canEditAreaTemplate(access, actor, row.creatorUserId)) {
    throw new CampaignServiceError("You can only edit your own area templates.", 403);
  }

  const shape = validatedShape(input.shape ?? row.shape);
  const sizeSpaces = validatedSize(input.sizeSpaces ?? row.sizeSpaces);
  const x = finitePoint(input.x ?? row.x, map.backgroundWidth as number, "Horizontal position");
  const y = finitePoint(input.y ?? row.y, map.backgroundHeight as number, "Vertical position");
  const angleDegrees = normalizeCampaignMapAreaTemplateAngle(input.angleDegrees ?? row.angleDegrees);
  const color = parseCampaignMapAreaTemplateColor(input.color ?? row.color);

  const result = await db.prepare(`UPDATE campaign_map_area_templates
    SET shape = ?, x = ?, y = ?, size_spaces = ?, angle_degrees = ?, color = ?, updated_at = ?
    WHERE campaign_id = ? AND map_id = ? AND id = ?`)
    .bind(shape, x, y, sizeSpaces, angleDegrees, color, now, access.campaignInternalId, map.id, row.id).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Area template could not be updated.", 409);

  return {
    id: row.id,
    shape,
    x,
    y,
    sizeSpaces,
    angleDegrees,
    color,
    canEdit: true,
    createdAt: row.createdAt,
    updatedAt: now,
  };
}

export async function deleteCampaignMapAreaTemplate(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  templateIdValue: unknown,
): Promise<void> {
  const { access, map } = await areaTemplateMap(db, actor, publicId, mapIdValue);
  requireWritable(access);
  const row = await templateRow(db, access.campaignInternalId, map.id, templateIdValue);
  if (!canEditAreaTemplate(access, actor, row.creatorUserId)) {
    throw new CampaignServiceError("You can only remove your own area templates.", 403);
  }
  const result = await db.prepare(`DELETE FROM campaign_map_area_templates
      WHERE campaign_id = ? AND map_id = ? AND id = ?`)
    .bind(access.campaignInternalId, map.id, row.id).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Area template not found.", 404);
}
