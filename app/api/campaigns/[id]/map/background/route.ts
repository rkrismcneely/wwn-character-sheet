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
  loadCampaignMapAccess,
  removeCampaignMapBackground,
  replaceCampaignMapBackground,
} from "@/lib/campaigns/map";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

function requestVersion(request: Request): number | null {
  const raw = request.headers.get("x-campaign-map-version");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return new Response("Map background not found.", { status: 404 });
    const { id } = await context.params;
    const access = await loadCampaignMapAccess(await getCampaignD1(), actor, id);
    const key = access.row?.backgroundKey;
    if (!key || !validMapBackgroundObjectKey(key)) {
      return new Response("Map background not found.", { status: 404 });
    }
    const { env } = await import("cloudflare:workers");
    const object = await env.BUCKET.get(key);
    if (!object) return new Response("Map background not found.", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Map background unavailable.", { status: 503 });
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  let uploadedKey: string | null = null;
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const version = requestVersion(request);
    if (version === null) return Response.json({ error: "A current map version is required." }, { status: 400 });
    const { id } = await context.params;
    const db = await getCampaignD1();
    const access = await loadCampaignMapAccess(db, actor, id);
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
      return Response.json({ error: "The map image is invalid or its dimensions are too large." }, { status: 415 });
    }

    const { env } = await import("cloudflare:workers");
    uploadedKey = mapBackgroundObjectKey(id, contentType);
    await env.BUCKET.put(uploadedKey, bytes, { httpMetadata: { contentType } });
    const result = await replaceCampaignMapBackground(db, actor, id, {
      version,
      key: uploadedKey,
      contentType,
      dimensions,
    });
    if (result.previousKey && result.previousKey !== uploadedKey) {
      try { await env.BUCKET.delete(result.previousKey); } catch { /* old key is no longer reachable */ }
    }
    return Response.json({ map: result.map }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedKey) {
      try {
        const { env } = await import("cloudflare:workers");
        await env.BUCKET.delete(uploadedKey);
      } catch { /* best-effort rollback */ }
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
    const result = await removeCampaignMapBackground(await getCampaignD1(), actor, id, version);
    if (result.previousKey) {
      try {
        const { env } = await import("cloudflare:workers");
        await env.BUCKET.delete(result.previousKey);
      } catch { /* database state is authoritative; old key is no longer reachable */ }
    }
    return Response.json({ map: result.map }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign map image could not be removed.");
  }
}
