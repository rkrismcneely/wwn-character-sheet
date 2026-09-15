import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  deleteCampaignStore,
  setCampaignStoreActive,
  updateCampaignStore,
} from "@/lib/campaigns/stores";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string; storeId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, storeId } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    const store = Object.prototype.hasOwnProperty.call(body, "active")
      ? await setCampaignStoreActive(await getCampaignD1(), actor, id, storeId, body.active)
      : await updateCampaignStore(await getCampaignD1(), actor, id, storeId, body);
    return Response.json({ store });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Campaign store could not be saved.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, storeId } = await context.params;
    await deleteCampaignStore(await getCampaignD1(), actor, id, storeId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return campaignErrorResponse(error, "Campaign store could not be deleted.");
  }
}
