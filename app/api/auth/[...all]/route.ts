import { toNextJsHandler } from "better-auth/next-js";
import { auth, missingAuthBindings } from "@/lib/auth";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

function logAuthCheckpoint(event: string): void {
  console.log(JSON.stringify({ event }));
}

function logAuthInitializationException(event: string, error: unknown): void {
  const errorType = error instanceof Error ? error.name : "UnknownThrownValue";
  const message = error instanceof Error
    ? error.message
    : "A non-Error value was thrown during authentication initialization.";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(JSON.stringify({ event, errorType, message, stack }));
}

const handlers = (() => {
  logAuthCheckpoint("auth_handler_create_start");

  try {
    const instance = toNextJsHandler(auth);
    logAuthCheckpoint("auth_handler_create_complete");
    return instance;
  } catch (error) {
    logAuthInitializationException("auth_handler_create_exception", error);
    throw error;
  }
})();

type AuthMethod = "GET" | "POST";

async function invokeAuthHandler(request: Request, method: AuthMethod): Promise<Response> {
  logAuthCheckpoint("auth_context_access_start");
  const context = auth.$context;
  logAuthCheckpoint("auth_context_access_complete");
  logAuthCheckpoint("auth_context_observer_attach_start");
  void context.then(
    () => logAuthCheckpoint("auth_context_observer_complete"),
    (error) => logAuthInitializationException("auth_context_observer_exception", error),
  );
  logAuthCheckpoint("auth_context_observer_attach_complete");

  logAuthCheckpoint("auth_next_handler_access_start");
  const handler = handlers[method];
  logAuthCheckpoint("auth_next_handler_access_complete");
  logAuthCheckpoint("auth_next_handler_invoke_start");
  const pendingResponse = handler(request);
  logAuthCheckpoint("auth_next_handler_invoke_returned");
  logAuthCheckpoint("auth_next_handler_await_start");
  const response = await pendingResponse;
  logAuthCheckpoint("auth_next_handler_await_complete");
  return response;
}

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
  logAuthCheckpoint("auth_route_enter");
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  const missingBindings = missingAuthBindings();
  if (missingBindings.length > 0) {
    logMissingAuthBindings(request, missingBindings);
    return unavailable();
  }

  logAuthCheckpoint("auth_bindings_valid");
  try {
    logAuthCheckpoint("auth_handler_start");
    const response = await invokeAuthHandler(request, "GET");
    logAuthCheckpoint("auth_handler_complete");
    return response;
  } catch (error) {
    logAuthException(request, error);
    return unavailable();
  }
}

export async function POST(request: Request): Promise<Response> {
  logAuthCheckpoint("auth_route_enter");
  const redirect = canonicalFallbackRedirect(request);
  if (redirect) return redirect;
  const missingBindings = missingAuthBindings();
  if (missingBindings.length > 0) {
    logMissingAuthBindings(request, missingBindings);
    return unavailable();
  }

  logAuthCheckpoint("auth_bindings_valid");
  try {
    logAuthCheckpoint("auth_handler_start");
    const response = await invokeAuthHandler(request, "POST");
    logAuthCheckpoint("auth_handler_complete");
    return response;
  } catch (error) {
    logAuthException(request, error);
    return unavailable();
  }
}
