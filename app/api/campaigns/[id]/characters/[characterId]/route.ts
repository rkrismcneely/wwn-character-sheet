import { getSessionActor } from "@/lib/auth-session";
import { readCampaignLinkedCharacter } from "@/lib/campaigns/characters";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = {
  params: Promise<{ id: string; characterId: string }>;
};

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id, characterId } = await context.params;
    const character = await readCampaignLinkedCharacter(
      await getCampaignD1(),
      actor,
      id,
      characterId,
    );
    return Response.json(character);
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign character could not be opened.",
    );
  }
}
