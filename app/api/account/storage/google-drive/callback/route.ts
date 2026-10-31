import { env } from "cloudflare:workers";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import { getSessionActor } from "@/lib/auth-session";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { getCampaignD1 } from "@/lib/campaigns/service";
import {
  consumeDriveState, driveAccountLabel, encryptDriveRefreshToken,
  exchangeDriveCode, hasDriveStateCookie, driveConfiguration, stateCookie,
} from "@/lib/account/recap-google-drive-oauth";
import {
  DriveConnectionFailure, type DriveConnectionCode,
} from "@/lib/account/recap-drive-errors";

/** Completes one-use, user-bound Google Drive consent. Never redirects with tokens,
 * raw Google errors, OAuth code, scopes or the OAuth state.
 */
export async function GET(request: Request): Promise<Response> {
  const end = (state: "connected" | "error" | "cancelled", reason?: DriveConnectionCode) => {
    const url = new URL(CANONICAL_ORIGIN + "/account");
    url.searchParams.set("drive", state);
    if (state === "error" && reason) url.searchParams.set("drive_error", reason);
    url.hash = "#recap-setup";
    return new Response(null, {
      status: 303, headers: {
        location: url.toString(),
        "set-cookie": stateCookie("", true),
        "cache-control": "private, no-store",
        "referrer-policy": "no-referrer",
      },
    });
  };
  // Only this fixed stage label is used for unexpected exceptions. Exception
  // messages and Google response bodies must never reach client query strings.
  let stage: "session" | "state" | "token" | "drive" | "encrypt" | "database" = "session";
  try {
    if (new URL(request.url).origin !== CANONICAL_ORIGIN) return end("error", "invalid_origin");
    const actor = await getSessionActor(request);
    if (!actor) return end("error", "session_missing");
    const params = new URL(request.url).searchParams;
    // Google's explicit denial is a cancellation, not a broken account.
    if (params.get("error") === "access_denied") return end("cancelled");
    if (params.has("error")) return end("error", "oauth_denied");
    const state = params.get("state");
    const code = params.get("code");
    if (!state || !code) return end("error", "callback_incomplete");
    if (!hasDriveStateCookie(request, state)) return end("error", "state_cookie_missing");
    stage = "state";
    const db = await getCampaignD1();
    if (!await consumeDriveState(db, actor.userId, state)) return end("error", "state_expired");
    const config = env as unknown as DriveSettings;
    if (!driveConfiguration(config)) return end("error", "server_config");
    stage = "token";
    const token = await exchangeDriveCode(config, code);
    stage = "drive";
    const label = await driveAccountLabel(token.access_token);
    stage = "encrypt";
    const connectionId = crypto.randomUUID();
    const encrypted = await encryptDriveRefreshToken(config, actor.userId, connectionId, token.refresh_token);
    const now = new Date().toISOString();
    stage = "database";
    await db.prepare(
      "INSERT INTO user_recap_storage_connections " +
      "(id,user_id,provider,display_name,granted_scopes,status,credential_ciphertext,credential_nonce,credential_version,connected_at,created_at,updated_at) " +
      "VALUES (?,?,'google-drive',?,?,'connected',?,?,?,?,?,?)",
    ).bind(connectionId, actor.userId, label, token.scope, encrypted.ciphertext, encrypted.nonce,
      encrypted.version, now, now, now).run();
    return end("connected");
  } catch (error) {
    if (error instanceof DriveConnectionFailure) return end("error", error.code);
    if (stage === "state" || stage === "database") return end("error", "database_error");
    if (stage === "encrypt") return end("error", "secure_storage_error");
    // Network issues and bad provider responses have the same fixed, safe
    // categories. Server-side details are intentionally not exposed.
    if (stage === "token") return end("error", "token_exchange");
    if (stage === "drive") return end("error", "drive_api_unavailable");
    return end("error", "unexpected");
  }
}
