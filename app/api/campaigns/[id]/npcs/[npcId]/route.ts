import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { deleteCampaignNpcTemplate, duplicateCampaignNpcTemplate, updateCampaignNpcTemplate } from "@/lib/campaigns/npcs";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string; npcId: string }> };

async function actorFor(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return null;
  return actor;
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, npcId } = await context.params;
    const body = await readBoundedJson(request, 16 * 1024) as Record<string, unknown>;
    return Response.json({ npc: await updateCampaignNpcTemplate(await getCampaignD1(), actor, id, npcId, body) });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "NPC template could not be updated.");
  }
}

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, npcId } = await context.params;
    const body = await readBoundedJson(request, 1024) as { action?: unknown };
    if (body.action !== "duplicate") return Response.json({ error: "A valid NPC action is required." }, { status: 422 });
    return Response.json({ npc: await duplicateCampaignNpcTemplate(await getCampaignD1(), actor, id, npcId) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "NPC template could not be duplicated.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await actorFor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, npcId } = await context.params;
    await deleteCampaignNpcTemplate(await getCampaignD1(), actor, id, npcId);
    return new Response(null, { status: 204 });
  } catch (error) { return campaignErrorResponse(error, "NPC template could not be deleted."); }
}
