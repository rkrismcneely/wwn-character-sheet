import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  loadCampaignMapAccess,
  readCampaignMap,
  updateCampaignMapSettings,
} from "@/lib/campaigns/map";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

async function encounterAvailable(db: D1Database, campaignId: string): Promise<boolean> {
  const session = await db.prepare("SELECT id FROM campaign_sessions WHERE campaign_id = ? AND ended_at IS NULL")
    .bind(campaignId).first<{ id: string }>();
  if (!session) return false;
  try {
    return Boolean(await env.CAMPAIGN_LIVE_SESSION.getByName(`campaign:${campaignId}`).encounter(session.id));
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const db = await getCampaignD1();
    const result = await readCampaignMap(db, actor, id);
    if (result.permissions.canManage) {
      const access = await loadCampaignMapAccess(db, actor, id);
      result.encounterAvailable = await encounterAvailable(db, access.campaignInternalId);
    }
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
    const body = await request.json() as Record<string, unknown>;
    const map = await updateCampaignMapSettings(await getCampaignD1(), actor, id, body);
    return Response.json({ map }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign map settings could not be saved.");
  }
}
