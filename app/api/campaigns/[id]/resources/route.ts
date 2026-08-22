import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { createCampaignResource, listCampaignResources } from "@/lib/campaigns/resources";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const resources = await listCampaignResources(await getCampaignD1(), actor, id);
    return Response.json({ resources });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign resources could not be loaded.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      title?: unknown;
      type?: unknown;
      content?: unknown;
    };
    const resources = await createCampaignResource(await getCampaignD1(), actor, id, body ?? {});
    return Response.json({ resources }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The campaign resource could not be created.");
  }
}
