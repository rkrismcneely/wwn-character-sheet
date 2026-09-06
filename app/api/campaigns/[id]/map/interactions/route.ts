import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  readCampaignMapInteractions,
  resizeCampaignMapToken,
  setCampaignMapSharedRollDicePreference,
  setCampaignMapSnapPreference,
} from "@/lib/campaigns/map-interactions";
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
    console.error("Campaign map interaction realtime notification failed", error);
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const mapId = new URL(request.url).searchParams.get("mapId");
    if (!mapId) throw new CampaignServiceError("Map is required.", 422);
    const interactions = await readCampaignMapInteractions(await getCampaignD1(), actor, id, mapId);
    return Response.json({ interactions }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign map interaction settings could not be loaded.");
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

    if (body.action === "set_snap") {
      const interactions = await setCampaignMapSnapPreference(db, actor, id, body.mapId, body.enabled);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json({ interactions }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "set_shared_roll_dice") {
      const interactions = await setCampaignMapSharedRollDicePreference(db, actor, id, body.mapId, body.enabled);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json({ interactions }, { headers: { "cache-control": "no-store" } });
    }
    if (body.action === "resize") {
      const result = await resizeCampaignMapToken(db, actor, id, body.mapId, body.tokenId, body.sizeCells);
      await announceMapChanged(db, access.campaignInternalId);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    }
    throw new CampaignServiceError("A valid map-interaction action is required.", 422);
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The campaign map interaction settings could not be updated.");
  }
}
