import { env } from "cloudflare:workers";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import { getSessionActor } from "@/lib/auth-session";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import {
  authorizationUrl, newDriveState, stateCookie, storeDriveState,
  requireDriveConfiguration,
} from "@/lib/account/recap-google-drive-oauth";

/** Starts a separate Drive consent flow. Existing Google sign-in is not sufficient. */
export async function GET(request: Request): Promise<Response> {
  try {
    if (new URL(request.url).origin !== CANONICAL_ORIGIN) {
      return Response.json({ error: "Connect Drive from the production site." }, { status: 409 });
    }
    const actor = await getSessionActor(request);
    if (!actor) return Response.redirect(CANONICAL_ORIGIN + "/account", 303);
    const config = env as unknown as DriveSettings;
    requireDriveConfiguration(config);
    const state = newDriveState();
    await storeDriveState(await getCampaignD1(), actor.userId, state);
    return new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl(config, state),
        "set-cookie": stateCookie(state),
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch(error) { return campaignErrorResponse(error, "Google Drive authorization is unavailable."); }
}
