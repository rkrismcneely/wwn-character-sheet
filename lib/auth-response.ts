import { authErrorMessage } from "./auth-providers.ts";

export function safeAuthErrorCode(value: unknown): string {
  const code = typeof value === "string" ? value.toLowerCase() : "";
  return authErrorMessage(code) !== authErrorMessage() ? code : "callback_failed";
}

/** Do not let third-party error descriptions or adapter exceptions reach URLs/UI. */
export async function safeAuthResponse(response: Response, request: Request): Promise<Response> {
  const location = response.headers.get("location");
  if (location) {
    const target = new URL(location, request.url);
    if (target.origin === new URL(request.url).origin && target.pathname === "/auth/error") {
      const code = safeAuthErrorCode(target.searchParams.get("error"));
      target.search = new URLSearchParams({ error: code }).toString();
      const headers = new Headers(response.headers);
      headers.set("location", target.href);
      return new Response(null, { status: response.status, headers });
    }
  }
  if (response.status >= 400) {
    let code = "callback_failed";
    try { code = safeAuthErrorCode((await response.clone().json() as { code?: unknown }).code); } catch { /* fixed fallback */ }
    if (new URL(request.url).pathname.startsWith("/api/auth/callback/")) {
      return Response.redirect(new URL(`/auth/error?error=${code}`, request.url), 302);
    }
    return Response.json({ code, message: authErrorMessage(code) }, { status: response.status });
  }
  return response;
}
