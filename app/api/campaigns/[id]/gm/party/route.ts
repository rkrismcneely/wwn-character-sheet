import { getSessionActor } from "@/lib/auth-session";
import { listGmPartyCharacters } from "@/lib/campaigns/gm-party";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const characters = await listGmPartyCharacters(await getCampaignD1(), actor, id);
    return Response.json({ characters }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return campaignErrorResponse(error, "The GM party status could not be loaded.");
  }
}
