import { getSessionActor } from "@/lib/auth-session";
import { withAdditiveAdminCampaignPermissions } from "@/lib/campaigns/admin-payload";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { listCampaignCharacters } from "@/lib/campaigns/characters";
import { listCampaignResources } from "@/lib/campaigns/resources";
import { getCampaignD1, listCampaignMembers, loadCampaignAccess, readCampaign } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

// One browser round-trip and one session lookup for the initial campaign view.
// Authorization is resolved once and reused only within this authenticated request.
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const db = await getCampaignD1();
    const access = await loadCampaignAccess(db, actor, id);
    const campaign = withAdditiveAdminCampaignPermissions(actor, await readCampaign(db, actor, id, access));
    const [members, characters, resources] = await Promise.all([
      listCampaignMembers(db, actor, id, access),
      listCampaignCharacters(db, actor, id, access),
      listCampaignResources(db, actor, id, access),
    ]);
    return Response.json({ campaign, members, characters, resources });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign overview could not be loaded.");
  }
}
