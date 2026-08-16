import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  getCampaignD1,
  listCampaignMembers,
} from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const members = await listCampaignMembers(
      await getCampaignD1(),
      actor,
      id,
    );
    return Response.json({ members });
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign roster is temporarily unavailable.",
    );
  }
}
