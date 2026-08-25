import { env } from "cloudflare:workers";
import { resolveRoll } from "@/app/rolls";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { authorizeLiveSessionRoll } from "@/lib/campaigns/live-session-service";
import { normalizeSharedRollRequest, toCampaignSharedRoll } from "@/lib/campaigns/shared-roll";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

function sessionObjectName(campaignId: string): string { return `campaign:${campaignId}`; }

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const body = await readBoundedJson(request, 16 * 1024) as { action?: unknown; characterId?: unknown; request?: unknown; rollId?: unknown };
    const { id } = await context.params;
    if (typeof body.characterId !== "string") return Response.json({ error: "A valid character is required." }, { status: 422 });
    const authorization = await authorizeLiveSessionRoll(await getCampaignD1(), actor, id, body.characterId);
    const durable = env.CAMPAIGN_LIVE_SESSION.getByName(sessionObjectName(authorization.campaignId));

    if (body.action === "prepare") {
      const rollRequest = normalizeSharedRollRequest(body.request, authorization.character);
      const roll = toCampaignSharedRoll(await resolveRoll(rollRequest));
      await durable.prepareRoll(authorization.sessionId, authorization.participantKey, roll);
      return Response.json({ roll }, { status: 201 });
    }
    if (body.action === "publish" && typeof body.rollId === "string" && body.rollId.length <= 100) {
      const roll = await durable.publishRoll(authorization.sessionId, authorization.participantKey, body.rollId);
      return Response.json({ roll });
    }
    return Response.json({ error: "A valid shared-roll action is required." }, { status: 422 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The roll could not be shared.");
  }
}
