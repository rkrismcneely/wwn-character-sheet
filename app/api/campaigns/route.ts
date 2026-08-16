import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  createCampaign,
  getCampaignD1,
  listCampaigns,
} from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const campaigns = await listCampaigns(
      await getCampaignD1(),
      actor,
    );
    return Response.json({ campaigns });
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign list is temporarily unavailable.",
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      name?: unknown;
    };
    const campaign = await createCampaign(
      await getCampaignD1(),
      actor,
      { name: body?.name },
    );
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The campaign could not be created.");
  }
}
