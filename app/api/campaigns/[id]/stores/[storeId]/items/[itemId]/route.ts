import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  deleteCampaignStoreItem,
  updateCampaignStoreItem,
} from "@/lib/campaigns/stores";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string; storeId: string; itemId: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, storeId, itemId } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    return Response.json({
      item: await updateCampaignStoreItem(await getCampaignD1(), actor, id, storeId, itemId, body),
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Store item could not be saved.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, storeId, itemId } = await context.params;
    await deleteCampaignStoreItem(await getCampaignD1(), actor, id, storeId, itemId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return campaignErrorResponse(error, "Store item could not be deleted.");
  }
}
