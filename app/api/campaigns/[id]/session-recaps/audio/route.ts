import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { listRecapAudioForPlayer } from "@/lib/campaigns/recap-audio-assets";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

/** Read-only metadata. No remote file identifiers or playable URLs until OAuth is implemented. */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const recapId = new URL(request.url).searchParams.get("recapId");
    return Response.json({ assets: await listRecapAudioForPlayer(await getCampaignD1(), actor, id, recapId) }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return campaignErrorResponse(error, "Session recording metadata could not be loaded.");
  }
}
