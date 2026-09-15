import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  createCampaignStore,
  listCampaignStoresForManagement,
} from "@/lib/campaigns/stores";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    return Response.json(await listCampaignStoresForManagement(await getCampaignD1(), actor, id), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return campaignErrorResponse(error, "Campaign stores could not be opened.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as Record<string, unknown>;
    return Response.json({
      store: await createCampaignStore(await getCampaignD1(), actor, id, body),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Campaign store could not be created.");
  }
}
