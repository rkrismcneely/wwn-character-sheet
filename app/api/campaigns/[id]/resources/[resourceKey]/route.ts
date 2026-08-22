import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  deleteCampaignResource,
  reorderCampaignResource,
  updateCampaignResource,
} from "@/lib/campaigns/resources";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string; resourceKey: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, resourceKey } = await context.params;
    const body = (await readBoundedJson(request, 16 * 1024)) as {
      title?: unknown;
      type?: unknown;
      content?: unknown;
      direction?: unknown;
    };
    const resources = body && body.direction !== undefined
      ? await reorderCampaignResource(await getCampaignD1(), actor, id, resourceKey, body.direction)
      : await updateCampaignResource(await getCampaignD1(), actor, id, resourceKey, {
        title: body?.title,
        type: body?.type,
        content: body?.content,
      });
    return Response.json({ resources });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(error, "The campaign resource could not be updated.");
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id, resourceKey } = await context.params;
    const resources = await deleteCampaignResource(await getCampaignD1(), actor, id, resourceKey);
    return Response.json({ resources });
  } catch (error) {
    return campaignErrorResponse(error, "The campaign resource could not be deleted.");
  }
}
