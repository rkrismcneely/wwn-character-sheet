import { toNextJsHandler } from "better-auth/next-js";
import { auth, missingAuthBindings } from "@/lib/auth";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

const handlers = toNextJsHandler(auth);

function unavailable(): Response {
  return Response.json(
    { error: "Authentication is temporarily unavailable." },
    { status: 503 },
  );
}

function logMissingAuthBindings(request: Request, missingBindings: string[]): void {
  console.error(JSON.stringify({
    event: "auth_runtime_unavailable",
    errorType: "AuthConfigurationError",
    message: "Required authentication bindings are missing or empty.",
    method: request.method,
    path: new URL(request.url).pathname,
    missingBindings,
  }));
}

function logAuthException(request: Request, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownThrownValue";
  const message = error instanceof Error
    ? error.message
    : "A non-Error value was thrown by the authentication handler.";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(JSON.stringify({
    event: "auth_handler_exception",
    errorType,
    message,
    stack,
    method: request.method,
    path: new URL(request.url).pathname,
  }));
}

function canonicalFallbackRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== FALLBACK_WORKER_HOST) return null;
  return Response.redirect(new URL(url.pathname + url.search, CANONICAL_ORIGIN), 307);
}

export async function GET(request: Request): Promise<Response> {
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  const missingBindings = missingAuthBindings();
  if (missingBindings.length > 0) {
    logMissingAuthBindings(request, missingBindings);
    return unavailable();
  }
  try {
    return await handlers.GET(request);
  } catch (error) {
    logAuthException(request, error);
    return unavailable();
  }
}

export async function POST(request: Request): Promise<Response> {
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  const missingBindings = missingAuthBindings();
  if (missingBindings.length > 0) {
    logMissingAuthBindings(request, missingBindings);
    return unavailable();
  }
  try {
    return await handlers.POST(request);
  } catch (error) {
    logAuthException(request, error);
    return unavailable();
  }
}