import { toNextJsHandler } from "better-auth/next-js";
import { auth, isAuthRuntimeConfigured } from "@/lib/auth";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

const handlers = toNextJsHandler(auth);

function unavailable(): Response {
  return Response.json(
    { error: "Authentication is temporarily unavailable." },
    { status: 503 },
  );
}

function canonicalFallbackRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== FALLBACK_WORKER_HOST) return null;
  return Response.redirect(new URL(url.pathname + url.search, CANONICAL_ORIGIN), 307);
}

export async function GET(request: Request): Promise<Response> {
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  if (!isAuthRuntimeConfigured()) return unavailable();
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  if (!isAuthRuntimeConfigured()) return unavailable();
  return handlers.POST(request);
}
