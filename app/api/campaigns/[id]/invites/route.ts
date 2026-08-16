import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  createCampaignInvite,
  revokeCampaignInvite,
} from "@/lib/campaigns/invite-service";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const { id } = await context.params;
    const invite = await createCampaignInvite(
      await getCampaignD1(),
      actor,
      id,
    );
    return Response.json({ invite }, { status: 201 });
  } catch (error) {
    return campaignErrorResponse(
      error,
      "The campaign invitation could not be created.",
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
      token?: unknown;
    };
    const { id } = await context.params;
    await revokeCampaignInvite(
      await getCampaignD1(),
      actor,
      id,
      body?.token,
    );
    return Response.json({ revoked: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(
      error,
      "The campaign invitation could not be revoked.",
    );
  }
}
