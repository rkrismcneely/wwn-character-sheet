import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { createCampaignStoreItem } from "@/lib/campaigns/stores";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string; storeId: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, storeId } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    return Response.json({
      item: await createCampaignStoreItem(await getCampaignD1(), actor, id, storeId, body),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Store item could not be added.");
  }
}
