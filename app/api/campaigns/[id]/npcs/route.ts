import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { createCampaignNpcTemplate, listCampaignNpcTemplates } from "@/lib/campaigns/npcs";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    return Response.json({ npcs: await listCampaignNpcTemplates(await getCampaignD1(), actor, id) });
  } catch (error) { return campaignErrorResponse(error, "NPC templates could not be opened."); }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 16 * 1024) as Record<string, unknown>;
    return Response.json({ npc: await createCampaignNpcTemplate(await getCampaignD1(), actor, id, body) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "NPC template could not be created.");
  }
}
