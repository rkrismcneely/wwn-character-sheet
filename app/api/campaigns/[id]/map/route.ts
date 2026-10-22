import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  activateCampaignMap,
  deleteCampaignMap,
  loadCampaignMapAccess,
  readCampaignMap,
  renameCampaignMap,
  updateCampaignMapSettings,
  type CampaignMapResponse,
} from "@/lib/campaigns/map";
import { CampaignServiceError, getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import { retireR2Object } from "@/lib/r2-recovery";

type Context = { params: Promise<{ id: string }> };

async function activeSessionId(db: D1Database, campaignId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL")
    .bind(campaignId).first<{ id: string }>();
  return row?.id ?? null;
}

async function encounterAvailable(db: D1Database, campaignId: string): Promise<boolean> {
  const sessionId = await activeSessionId(db, campaignId);
  if (!sessionId) return false;
  try {
    return Boolean(await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).encounter(sessionId));
  } catch {
    return false;
  }
}

async function announceMapChanged(db: D1Database, campaignId: string): Promise<void> {
  const sessionId = await activeSessionId(db, campaignId);
  if (!sessionId) return;
  try {
    await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).announceMapChanged(sessionId);
  } catch (error) {
    console.error("Campaign map realtime notification failed", error);
  }
}

async function responseFor(
  db: D1Database,
  actor: NonNullable<Awaited<ReturnType<typeof getSessionActor>>>,
  publicId: string,
  mapId?: string | null,
): Promise<CampaignMapResponse> {
  const access = await loadCampaignMapAccess(db, actor, publicId);
  const result = await readCampaignMap(db, actor, publicId, mapId, access);
  if (access.canManage) {
    result.encounterAvailable = await encounterAvailable(db, access.campaignInternalId);
  }
  return result;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const mapId = new URL(request.url).searchParams.get("mapId");
    const result = await responseFor(await getCampaignD1(), actor, id, mapId);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign map could not be loaded.");
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    const db = await getCampaignD1();
    const map = await updateCampaignMapSettings(db, actor, id, body);
    if (map.isActive) {
      const access = await loadCampaignMapAccess(db, actor, id);
      await announceMapChanged(db, access.campaignInternalId);
    }
    return Response.json(await responseFor(db, actor, id, map.id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The campaign map settings could not be saved.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    const db = await getCampaignD1();
    const access = await loadCampaignMapAccess(db, actor, id);
    if (!access.canManage) throw new CampaignServiceError("Not permitted.", 403);

    let selectedMapId: string | null = null;
    let announce = false;
    if (body.action === "activate") {
      const map = await activateCampaignMap(db, actor, id, body.mapId);
      selectedMapId = map.id;
      announce = true;
    } else if (body.action === "rename") {
      const map = await renameCampaignMap(db, actor, id, body);
      selectedMapId = map.id;
      announce = map.isActive;
    } else if (body.action === "delete") {
      const deleted = await deleteCampaignMap(db, actor, id, body.mapId);
      selectedMapId = deleted.selectedMapId;
      announce = deleted.activeChanged;
      if (deleted.deletedKey) {
        try {
          await retireR2Object(env.BUCKET, deleted.deletedKey);
        } catch (error) {
          console.error("Deleted map recovery copy failed", error);
          // The old key can remain orphaned if recovery archival fails.
        }
      }
    } else {
      throw new CampaignServiceError("A valid map action is required.", 422);
    }

    if (announce) await announceMapChanged(db, access.campaignInternalId);
    return Response.json(await responseFor(db, actor, id, selectedMapId), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The campaign map could not be updated.");
  }
}
