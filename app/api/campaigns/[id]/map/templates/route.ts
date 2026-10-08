import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  createCampaignMapAreaTemplate,
  deleteCampaignMapAreaTemplate,
  readCampaignMapAreaTemplates,
  updateCampaignMapAreaTemplate,
} from "@/lib/campaigns/map-area-templates";
import { loadCampaignMapAccess } from "@/lib/campaigns/map";
import { CampaignServiceError, getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

async function activeSessionId(db: D1Database, campaignId: string): Promise<string | null> {
  const row = await db.prepare("SELECT id FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL")
    .bind(campaignId).first<{ id: string }>();
  return row?.id ?? null;
}

async function announceMapChanged(db: D1Database, campaignId: string): Promise<void> {
  const sessionId = await activeSessionId(db, campaignId);
  if (!sessionId) return;
  try {
    await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).announceMapChanged(sessionId);
  } catch (error) {
    console.error("Campaign map area-template realtime notification failed", error);
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const mapId = new URL(request.url).searchParams.get("mapId");
    if (!mapId) throw new CampaignServiceError("Map is required.", 422);
    const templates = await readCampaignMapAreaTemplates(await getCampaignD1(), actor, id, mapId);
    return Response.json({ templates }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "Campaign map area templates could not be loaded.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 12 * 1024) as Record<string, unknown>;
    const db = await getCampaignD1();
    const access = await loadCampaignMapAccess(db, actor, id);

    if (body.action === "create") {
      const template = await createCampaignMapAreaTemplate(db, actor, id, body);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json({ template }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "update") {
      const template = await updateCampaignMapAreaTemplate(db, actor, id, body);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json({ template }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "delete") {
      await deleteCampaignMapAreaTemplate(db, actor, id, body.mapId, body.templateId);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    throw new CampaignServiceError("A valid area-template action is required.", 422);
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Campaign map area templates could not be updated.");
  }
}
