import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  getCampaignD1,
  listCampaignMembers,
  removeCampaignMemberByKey,
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
    const members = await listCampaignMembers(
      await getCampaignD1(),
      actor,
      id,
    );
    return Response.json({ members });
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign roster is temporarily unavailable.",
    );
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
    const body = (await readBoundedJson(request, 8 * 1024)) as {
      memberKey?: unknown;
    };
    const { id } = await context.params;
    await removeCampaignMemberByKey(
      await getCampaignD1(),
      actor,
      id,
      body?.memberKey,
    );
    return Response.json({ removed: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The campaign member could not be removed.");
  }
}
