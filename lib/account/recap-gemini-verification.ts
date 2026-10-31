/** Read-only Gemini credential check used by each GM's Account settings.
 * Google receives the credential only in a request header; never log, redirect,
 * persist or echo it in the response. This sends no audio or generation request.
 */
export type GeminiModelCheck =
  | { kind: "verified" }
  | { kind: "invalid_key" }
  | { kind: "permission_denied" }
  | { kind: "rate_limited" }
  | { kind: "provider_redirect" }
  | { kind: "service_unavailable" }
  | { kind: "invalid_response" }
  | { kind: "timeout" }
  | { kind: "network_error" };

const MODELS_URL="https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";

/** Cloudflare Workers supports redirect:"manual", but NOT redirect:"error".
 * An unsupported redirect mode throws before the request can reach Google.
 */
export async function checkGeminiModelAccess(
  apiKey: string,
  requester: typeof fetch=fetch,
): Promise<GeminiModelCheck> {
  try {
    const response=await requester(MODELS_URL,{
      method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000),
      headers:{"x-goog-api-key":apiKey},
    });
    // Never forward an API key or follow an untrusted provider redirect.
    if(response.redirected || (response.status>=300 && response.status<400))
      return {kind:"provider_redirect"};
    if(response.status===400||response.status===401)return {kind:"invalid_key"};
    if(response.status===403)return {kind:"permission_denied"};
    if(response.status===429)return {kind:"rate_limited"};
    if(!response.ok)return {kind:"service_unavailable"};
    let body:unknown;
    try{body=await response.json();}
    catch{return {kind:"invalid_response"};}
    if(!body||typeof body!=="object"||!Array.isArray((body as {models?:unknown}).models)||
      (body as {models:unknown[]}).models.length===0)
      return {kind:"invalid_response"};
    return {kind:"verified"};
  } catch (error) {
    // Never show the raw error: it can include URLs or provider details.
    if(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError"))
      return {kind:"timeout"};
    return {kind:"network_error"};
  }
}
