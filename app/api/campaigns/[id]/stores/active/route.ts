import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { readActiveCampaignStore } from "@/lib/campaigns/stores";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const characterId = new URL(request.url).searchParams.get("characterId");
    return Response.json({
      store: await readActiveCampaignStore(await getCampaignD1(), actor, id, characterId),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The active store could not be opened.");
  }
}
