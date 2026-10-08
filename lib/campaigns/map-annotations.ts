import { CampaignServiceError } from "./service.ts";
import { loadCampaignMapAccess } from "./map.ts";
import type { CampaignActor } from "./types.ts";
import {
  isCampaignMapAnnotationKind,
  isCampaignMapAnnotationVisibility,
  parseCampaignMapAnnotationColor,
  parseCampaignMapAnnotationGeometry,
  type CampaignMapAnnotation,
  type CampaignMapAnnotationGeometry,
  type CampaignMapAnnotationKind,
  type CampaignMapAnnotationVisibility,
} from "./map-annotation-model.ts";

type AnnotationMapRow = {
  id: string;
  isActive: number;
  backgroundWidth: number | null;
  backgroundHeight: number | null;
};

type AnnotationRow = {
  id: string;
  kind: CampaignMapAnnotationKind;
  visibility: CampaignMapAnnotationVisibility;
  geometryJson: string;
  createdAt: string;
};

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string") throw new CampaignServiceError(`${label} is required.`, 422);
  const text = value.trim();
  if (!text || text.length > 160 || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new CampaignServiceError(`${label} is invalid.`, 422);
  }
  return text;
}

async function annotationMap(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<{ access: Awaited<ReturnType<typeof loadCampaignMapAccess>>; map: AnnotationMapRow }> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  const mapId = identifier(mapIdValue, "Map");
  const map = await db.prepare(`SELECT id, is_active AS isActive,
      background_width AS backgroundWidth, background_height AS backgroundHeight
    FROM campaign_maps WHERE campaign_id = ? AND id = ?`)
    .bind(access.campaignInternalId, mapId).first<AnnotationMapRow>();
  if (!map || (!access.canManage && !map.isActive)) throw new CampaignServiceError("Campaign map not found.", 404);
  return { access, map };
}

function requireManagement(access: Awaited<ReturnType<typeof loadCampaignMapAccess>>): void {
  if (access.archived) throw new CampaignServiceError("This campaign is archived. Restore it before making changes.", 409);
  if (!access.canManage) throw new CampaignServiceError("Not permitted.", 403);
}

function mapDimensions(map: AnnotationMapRow): { width: number; height: number } {
  if (!map.backgroundWidth || !map.backgroundHeight) {
    throw new CampaignServiceError("Add a map image before drawing annotations.", 409);
  }
  return { width: map.backgroundWidth, height: map.backgroundHeight };
}

function annotationFromRow(row: AnnotationRow, width: number, height: number): CampaignMapAnnotation | null {
  try {
    const raw = JSON.parse(row.geometryJson) as Record<string, unknown>;
    const geometry = parseCampaignMapAnnotationGeometry(row.kind, raw, width, height);
    if (!geometry) return null;
    return {
      id: row.id,
      kind: row.kind,
      visibility: row.visibility,
      color: parseCampaignMapAnnotationColor(raw.color, row.visibility),
      geometry,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

function missingAnnotationTable(error: unknown): boolean {
  return error instanceof Error && /no such table:\s*campaign_map_annotations/iu.test(error.message);
}

export async function readCampaignMapAnnotations(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<CampaignMapAnnotation[]> {
  const { access, map } = await annotationMap(db, actor, publicId, mapIdValue);
  const { width, height } = mapDimensions(map);
  try {
    const visibilitySql = access.canManage ? "" : " AND visibility = 'players'";
    const result = await db.prepare(`SELECT id, kind, visibility,
        geometry_json AS geometryJson, created_at AS createdAt
      FROM campaign_map_annotations
      WHERE map_id = ?${visibilitySql}
      ORDER BY created_at ASC, id ASC
      LIMIT 500`)
      .bind(map.id).all<AnnotationRow>();
    return result.results.flatMap(row => {
      const annotation = annotationFromRow(row, width, height);
      return annotation ? [annotation] : [];
    });
  } catch (error) {
    // A Cloudflare Git deployment can briefly reach the Worker before the
    // dedicated map migration workflow finishes. Reads stay safe during that
    // window and begin returning annotations immediately after migration.
    if (missingAnnotationTable(error)) return [];
    throw error;
  }
}

export async function createCampaignMapAnnotation(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  input: Record<string, unknown>,
  now = new Date().toISOString(),
): Promise<CampaignMapAnnotation> {
  const { access, map } = await annotationMap(db, actor, publicId, input.mapId);
  requireManagement(access);
  const { width, height } = mapDimensions(map);
  if (!isCampaignMapAnnotationKind(input.kind)) throw new CampaignServiceError("Drawing tool is invalid.", 422);
  if (!isCampaignMapAnnotationVisibility(input.visibility)) throw new CampaignServiceError("Drawing visibility is invalid.", 422);
  const geometry = parseCampaignMapAnnotationGeometry(input.kind, input.geometry, width, height);
  if (!geometry) throw new CampaignServiceError("Drawing geometry is invalid or outside the map.", 422);
  const color = parseCampaignMapAnnotationColor(input.color, input.visibility);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM campaign_map_annotations WHERE map_id = ?")
    .bind(map.id).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= 500) {
    throw new CampaignServiceError("This map has reached the 500-drawing limit. Erase or clear drawings before adding more.", 409);
  }

  const id = `ann_${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO campaign_map_annotations
      (id, campaign_id, map_id, kind, visibility, geometry_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      access.campaignInternalId,
      map.id,
      input.kind,
      input.visibility,
      JSON.stringify({ ...geometry, color }),
      now,
    ).run();

  return {
    id,
    kind: input.kind,
    visibility: input.visibility,
    color,
    geometry: geometry as CampaignMapAnnotationGeometry,
    createdAt: now,
  };
}

export async function deleteCampaignMapAnnotation(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
  annotationIdValue: unknown,
): Promise<void> {
  const { access, map } = await annotationMap(db, actor, publicId, mapIdValue);
  requireManagement(access);
  const annotationId = identifier(annotationIdValue, "Drawing");
  const result = await db.prepare(`DELETE FROM campaign_map_annotations
      WHERE campaign_id = ? AND map_id = ? AND id = ?`)
    .bind(access.campaignInternalId, map.id, annotationId).run();
  if (result.meta.changes !== 1) throw new CampaignServiceError("Drawing not found.", 404);
}

export async function clearCampaignMapAnnotations(
  db: D1Database,
  actor: CampaignActor,
  publicId: string,
  mapIdValue: unknown,
): Promise<number> {
  const { access, map } = await annotationMap(db, actor, publicId, mapIdValue);
  requireManagement(access);
  const result = await db.prepare(`DELETE FROM campaign_map_annotations
      WHERE campaign_id = ? AND map_id = ?`)
    .bind(access.campaignInternalId, map.id).run();
  return Number(result.meta.changes ?? 0);
}
