import { getSessionActor } from "@/lib/auth-session";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { listActiveCharacterLiveSessionCampaigns } from "@/lib/campaigns/live-session-service";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

/** A small, owner-only discovery endpoint for the character-sheet panel. */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    if (!isPlausiblePublicCharacterId(id)) return Response.json({ error: "Character not found." }, { status: 404 });
    const campaigns = await listActiveCharacterLiveSessionCampaigns(await getCampaignD1(), actor, id);
    return Response.json({ campaigns });
  } catch (error) {
    return campaignErrorResponse(error, "Live sessions could not be checked for this character.");
  }
}
