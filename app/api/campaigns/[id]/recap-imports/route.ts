import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";
import {
  getRecapImportSetup, createRecapRecordingImport, confirmRecapRecordingSpeakers,
} from "@/lib/campaigns/recap-imports";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const { id } = await context.params;
    return Response.json(await getRecapImportSetup(await getCampaignD1(), actor, id));
  } catch (error) { return campaignErrorResponse(error, "Recording setup could not be loaded."); }
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024);
    return Response.json({ recording: await createRecapRecordingImport(await getCampaignD1(), actor, id, body) }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The recording could not be saved.");
  }
}
export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    const { id } = await context.params;
    const body = await readBoundedJson(request, 8 * 1024);
    await confirmRecapRecordingSpeakers(await getCampaignD1(), actor, id, body);
    return Response.json({ confirmed: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "The recording speakers could not be confirmed.");
  }
}
