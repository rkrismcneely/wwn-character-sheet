import { env } from "cloudflare:workers";
import type { DriveSettings } from "@/lib/account/recap-google-drive-oauth";
import { getSessionActor } from "@/lib/auth-session";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { getCampaignD1 } from "@/lib/campaigns/service";
import {
  consumeDriveState, driveAccountLabel, encryptDriveRefreshToken,
  exchangeDriveCode, hasDriveStateCookie, requireDriveConfiguration, stateCookie,
} from "@/lib/account/recap-google-drive-oauth";

/** Completes one-use, user-bound Google Drive consent. Never redirects with a token. */
export async function GET(request: Request): Promise<Response> {
  const end = (state: "connected" | "error" | "cancelled") => new Response(null, {
    status: 303, headers: {
      location: CANONICAL_ORIGIN + "/account?drive=" + state + "#recap-setup",
      "set-cookie": stateCookie("", true),
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    },
  });
  try {
    if (new URL(request.url).origin !== CANONICAL_ORIGIN) return end("error");
    const actor = await getSessionActor(request);
    if (!actor) return end("error");
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    // Google's explicit denial is a cancellation, not a broken account.
    if (params.get("error") === "access_denied") return end("cancelled");
    const code = params.get("code");
    if (!state || !code || !hasDriveStateCookie(request, state)) return end("error");
    const db = await getCampaignD1();
    if (!await consumeDriveState(db, actor.userId, state)) return end("error");
    const config = env as unknown as DriveSettings;
    requireDriveConfiguration(config);
    const token = await exchangeDriveCode(config, code);
    const label = await driveAccountLabel(token.access_token);
    const connectionId = crypto.randomUUID();
    const encrypted = await encryptDriveRefreshToken(config, actor.userId, connectionId, token.refresh_token);
    const now = new Date().toISOString();
    await db.prepare(
      "INSERT INTO user_recap_storage_connections " +
      "(id,user_id,provider,display_name,granted_scopes,status,credential_ciphertext,credential_nonce,credential_version,connected_at,created_at,updated_at) " +
      "VALUES (?,?,'google-drive',?,?,'connected',?,?,?,?,?,?)",
    ).bind(connectionId, actor.userId, label, token.scope, encrypted.ciphertext, encrypted.nonce,
      encrypted.version, now, now, now).run();
    return end("connected");
  } catch {
    // No OAuth codes, access tokens, upstream payloads or private file IDs in responses or logs.
    return end("error");
  }
}
