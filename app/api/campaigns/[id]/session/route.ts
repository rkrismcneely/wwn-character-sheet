import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { endLiveSession, joinLiveSession, readLiveSessionContext, startLiveSession } from "@/lib/campaigns/live-session-service";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import { memberEncounterProjection } from "@/lib/campaigns/live-session";

type Context = { params: Promise<{ id: string }> };

async function actorFor(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return null;
  return actor;
}

function sessionObjectName(campaignId: string): string { return `campaign:${campaignId}`; }

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const result = await readLiveSessionContext(await getCampaignD1(), actor, id);
    if (result.state.session && result.state.permissions.joined) {
      try {
        const durable = env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(result.campaignId));
        const [recentRolls, encounter] = await Promise.all([
          durable.recentRolls(result.state.session.id),
          durable.encounter(result.state.session.id),
        ]);
        result.state.session.recentRolls = recentRolls;
        result.state.session.encounter = result.state.permissions.canManageEncounter ? encounter : memberEncounterProjection(encounter);
      } catch (error) { console.error("Live session roll feed could not be loaded", error); }
    }
    return Response.json({ liveSession: result.state });
  } catch (error) { return campaignErrorResponse(error, "The live session could not be opened."); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const body = await readBoundedJson(request, 4 * 1024) as { action?: unknown };
    const { id } = await context.params;
    const result = body?.action === "start"
      ? await startLiveSession(await getCampaignD1(), actor, id)
      : body?.action === "join"
      ? await joinLiveSession(await getCampaignD1(), actor, id)
      : null;
    if (!result) return Response.json({ error: "A valid live-session action is required." }, { status: 422 });
    if (result.state.session) {
      try { await env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(result.campaignId)).announceParticipantsChanged(result.state.session.id); }
      catch (error) { console.error("Live session participant notification failed", error); }
    }
    return Response.json({ liveSession: result.state });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The live session could not be updated.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const result = await endLiveSession(await getCampaignD1(), actor, id);
    if (result.endedSessionId) {
      try { await env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(result.campaignId)).endSession(result.endedSessionId); }
      catch (error) { console.error("Live session end notification failed", error); }
    }
    return Response.json({ liveSession: result.state });
  } catch (error) { return campaignErrorResponse(error, "The live session could not be ended."); }
}
