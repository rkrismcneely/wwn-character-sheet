import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  deleteCampaign,
  getCampaignD1,
  readCampaign,
  updateCampaignName,
} from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const campaign = await readCampaign(
      await getCampaignD1(),
      actor,
      id,
    );
    return Response.json({ campaign });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign could not be opened.");
  }
}

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      name?: unknown;
      version?: unknown;
    };
    const campaign = await updateCampaignName(
      await getCampaignD1(),
      actor,
      id,
      { name: body?.name, version: body?.version },
    );
    return Response.json({ campaign });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The campaign could not be updated.");
  }
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    await deleteCampaign(
      await getCampaignD1(),
      actor,
      id,
    );
    return Response.json({ deleted: true });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign could not be deleted.");
  }
}
