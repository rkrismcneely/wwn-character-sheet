import { env } from "cloudflare:workers";
import { availableAuthProviders } from "@/lib/account/connected-accounts";
import { isAuthRuntimeConfigured } from "@/lib/auth";

export async function GET() {
  return Response.json({ providers: isAuthRuntimeConfigured(env) ? await availableAuthProviders(env.DB, env) : [] }, {
    headers: { "cache-control": "no-store" },
  });
}
