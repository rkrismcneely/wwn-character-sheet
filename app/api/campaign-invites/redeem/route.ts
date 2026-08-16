import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { redeemCampaignInvite } from "@/lib/campaigns/invite-service";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) {
      return Response.json({ error: "Sign in is required." }, { status: 401 });
    }
    const body = (await readBoundedJson(request, 8 * 1024)) as {
      token?: unknown;
    };
    const redeemed = await redeemCampaignInvite(
      await getCampaignD1(),
      actor,
      body?.token,
    );
    return Response.json(redeemed);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return campaignErrorResponse(
      error,
      "The campaign invitation could not be redeemed.",
    );
  }
}
