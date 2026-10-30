import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { decryptDriveRefreshToken } from "@/lib/account/recap-google-drive-oauth";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

/** Detach the GM's Drive grant without ever deleting their Drive files. */
export async function POST(request: Request): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (request.headers.get("origin") !== CANONICAL_ORIGIN) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let body: { connectionId?: unknown };
  try { body = await readBoundedJson(request, 1024) as { connectionId?: unknown }; }
  catch(error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Invalid request." }, { status: 422 });
  }
  const id = body?.connectionId;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id)) {
    return Response.json({ error: "Invalid connection." }, { status: 422 });
  }
  const db = await getCampaignD1();
  const row = await db.prepare(
    "SELECT credential_ciphertext AS ciphertext, credential_nonce AS nonce, credential_version AS version " +
    "FROM user_recap_storage_connections WHERE id=? AND user_id=? AND provider='google-drive'",
  ).bind(id, actor.userId).first<{ ciphertext: string | null; nonce: string | null; version: number | null }>();
  if (!row) return Response.json({ error: "Storage connection not found." }, { status: 404 });
  await db.prepare(
    "UPDATE user_recap_storage_connections SET status='disconnected', credential_ciphertext=NULL, " +
    "credential_nonce=NULL, credential_version=NULL, updated_at=? WHERE id=? AND user_id=?",
  ).bind(new Date().toISOString(), id, actor.userId).run();
  // Revoke with Google if possible; local removal and player-access disabling are authoritative.
  if (row.ciphertext && row.nonce && row.version) {
    try {
      const settings = env as CloudflareEnv & { RECAP_STORAGE_ENCRYPTION_KEY?: string };
      const token = await decryptDriveRefreshToken(settings, actor.userId, id, {
        ciphertext: row.ciphertext, nonce: row.nonce, version: row.version,
      });
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000),
      });
    } catch { /* Permission has already been removed locally. */ }
  }
  return Response.json({ disconnected: true }, { headers: { "cache-control": "no-store" } });
}
