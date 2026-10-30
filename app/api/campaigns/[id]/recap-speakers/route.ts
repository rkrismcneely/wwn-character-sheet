import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import { saveRecapSpeaker, deleteRecapSpeaker } from "@/lib/campaigns/recap-imports";
type Context = { params: Promise<{ id: string }> };

async function save(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024);
    return Response.json({ speaker: await saveRecapSpeaker(await getCampaignD1(), actor, id, body) });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The speaker association could not be saved.");
  }
}
export const POST = save;
export const PATCH = save;
export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024) as { id?: unknown };
    await deleteRecapSpeaker(await getCampaignD1(), actor, id, body?.id);
    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The speaker association could not be deleted.");
  }
}
