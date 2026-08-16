import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  getCampaignD1,
  leaveCampaign,
} from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    await leaveCampaign(await getCampaignD1(), actor, id);
    return Response.json({ left: true });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign could not be left.");
  }
}
