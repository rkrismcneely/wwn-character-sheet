import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { driveConfiguration } from "@/lib/account/recap-google-drive-oauth";
import { getCampaignD1 } from "@/lib/campaigns/service";

/** Status is the only public shape; tokens, remote Drive IDs and scopes stay private. */
export async function GET(request: Request): Promise<Response> {
  const actor = await getSessionActor(request);
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
  const db = await getCampaignD1();
  const rows = await db.prepare(
    "SELECT id,provider,display_name AS displayName,status,connected_at AS connectedAt " +
    "FROM user_recap_storage_connections WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
  ).bind(actor.userId).all<{
    id: string; provider: string; displayName: string;
    status: "connected" | "disconnected" | "reconnect_required"; connectedAt: string | null;
  }>();
  return Response.json({
    available: driveConfiguration(env as CloudflareEnv & { RECAP_STORAGE_ENCRYPTION_KEY?: string }),
    connections: rows.results,
  }, { headers: { "cache-control": "private, no-store" } });
}
