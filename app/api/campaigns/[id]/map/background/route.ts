import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  isMapBackgroundContentType,
  mapBackgroundObjectKey,
  mapImageDimensions,
  MAX_MAP_BACKGROUND_BYTES,
  validMapBackgroundObjectKey,
} from "@/lib/campaigns/map-images";
import {
  campaignMapBackgroundKey,
  createCampaignMapWithBackground,
  loadCampaignMapAccess,
  readCampaignMap,
  removeCampaignMapBackground,
  replaceCampaignMapBackground,
} from "@/lib/campaigns/map";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { retireR2ObjectWithRecovery } from "@/lib/r2-recovery";

type Context = { params: Promise<{ id: string }> };

function requestVersion(request: Request): number | null {
  const raw = request.headers.get("x-campaign-map-version");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function announceMapChanged(db: D1Database, campaignId: string): Promise<void> {
  const row = await db.prepare("SELECT id FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL")
    .bind(campaignId).first<{ id: string }>();
  if (!row) return;
  try {
    await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).announceMapChanged(row.id);
  } catch (error) {
    console.error("Campaign map realtime notification failed", error);
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return new Response("Map background not found.", { status: 404 });
    const { id } = await context.params;
    const mapId = new URL(request.url).searchParams.get("mapId");
    const key = await campaignMapBackgroundKey(await getCampaignD1(), actor, id, mapId);
    if (!key || !validMapBackgroundObjectKey(key)) {
      return new Response("Map background not found.", { status: 404 });
    }
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Map background not found.", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Map background not found.", { status: 404 });
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  let uploadedKey: string | null = null;
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const url = new URL(request.url);
    const mapId = url.searchParams.get("mapId");
    const version = requestVersion(request);
    if (mapId && version === null) return Response.json({ error: "A current map version is required." }, { status: 400 });
    const db = await getCampaignD1();
    const access = await loadCampaignMapAccess(db, actor, id);
    if (access.archived) {
      return Response.json({ error: "This campaign is archived. Restore it before making changes." }, { status: 409 });
    }
    if (!access.canManage) return Response.json({ error: "Not permitted." }, { status: 403 });

    const contentType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!isMapBackgroundContentType(contentType)) {
      return Response.json({ error: "Use a JPG or PNG map image." }, { status: 415 });
    }
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MAP_BACKGROUND_BYTES) {
      return Response.json({ error: "Map images must be smaller than 15 MB." }, { status: 413 });
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_MAP_BACKGROUND_BYTES) {
      return Response.json({ error: "Map images must be smaller than 15 MB." }, { status: 413 });
    }
    const dimensions = mapImageDimensions(bytes, contentType);
    if (!dimensions) {
      return Response.json({ error: "The map image is invalid or its dimensions are outside the supported range." }, { status: 415 });
    }

    uploadedKey = mapBackgroundObjectKey(id, contentType);
    await env.BUCKET.put(uploadedKey, bytes, { httpMetadata: { contentType } });

    let map;
    let previousKey: string | null = null;
    if (mapId) {
      const replaced = await replaceCampaignMapBackground(db, actor, id, {
        mapId,
        version: version as number,
        key: uploadedKey,
        contentType,
        dimensions,
      });
      map = replaced.map;
      previousKey = replaced.previousKey;
    } else {
      const requestedName = url.searchParams.get("name") ?? "Map";
      map = await createCampaignMapWithBackground(db, actor, id, {
        name: requestedName,
        key: uploadedKey,
        contentType,
        dimensions,
      });
    }

    const committedKey = uploadedKey;
    uploadedKey = null;
    if (previousKey && previousKey !== committedKey) {
      await retireR2ObjectWithRecovery(env.BUCKET, previousKey);
    }
    if (map.isActive) await announceMapChanged(db, access.campaignInternalId);
    return Response.json(await readCampaignMap(db, actor, id, map.id), { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedKey) {
      try { await env.BUCKET.delete(uploadedKey); } catch { /* best-effort rollback before D1 commit */ }
    }
    return campaignErrorResponse(error, "The campaign map image could not be uploaded.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const version = requestVersion(request);
    if (version === null) return Response.json({ error: "A current map version is required." }, { status: 400 });
    const { id } = await context.params;
    const mapId = new URL(request.url).searchParams.get("mapId");
    if (!mapId) return Response.json({ error: "Map is required." }, { status: 400 });
    const db = await getCampaignD1();
    const result = await removeCampaignMapBackground(db, actor, id, mapId, version);
    if (result.previousKey) {
      await retireR2ObjectWithRecovery(env.BUCKET, result.previousKey);
    }
    if (result.map.isActive) {
      const access = await loadCampaignMapAccess(db, actor, id);
      await announceMapChanged(db, access.campaignInternalId);
    }
    return Response.json(await readCampaignMap(db, actor, id, result.map.id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign map image could not be removed.");
  }
}
