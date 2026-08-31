import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { connectedAccounts } from "@/lib/account/connected-accounts";

export async function GET(request: Request) {
  const actor = await getSessionActor(request);
  if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
  return Response.json({ accounts: await connectedAccounts(env.DB, actor.userId, env) }, {
    headers: { "cache-control": "no-store" },
  });
}
