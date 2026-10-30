import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { parseCraigRecording } from "@/lib/campaigns/recap-import-validation";
import { getCampaignD1, loadCampaignAccess } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
type CraigUser = { id?: unknown; userId?: unknown; name?: unknown; username?: unknown; displayName?: unknown; track?: unknown };
function safeName(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 80
    ? value.trim() : null;
}

/** Metadata-only preflight. Never download audio or return Craig's access key. */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const record = await loadCampaignAccess(await getCampaignD1(), actor, id);
    if (!canManageCampaignContent(actor, record.campaign, record.membership)) {
      return Response.json({ error: "Only campaign GMs can inspect Craig recordings." }, { status: 403 });
    }
    const input = await readBoundedJson(request, 2048) as { link?: unknown };
    let parsed: ReturnType<typeof parseCraigRecording>;
    try { parsed = parseCraigRecording(input?.link); } catch(error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invalid Craig recording link." }, { status: 422 });
    }
    const url = new URL(parsed.reference);
    const recordingId = url.pathname.split("/")[2];
    const api = "https://craig.horse/api/v1/recordings/" + encodeURIComponent(recordingId) + "?key=" + encodeURIComponent(url.searchParams.get("key")!);
    // Fixed origin and fixed API path prevent caller-controlled SSRF; do not log request URL.
    const response = await fetch(api, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      return Response.json({ error: response.status === 404 || response.status === 403
        ? "Craig recording unavailable or access key expired."
        : "Craig could not provide recording metadata." }, { status: 502 });
    }
    const type = response.headers.get("content-type") || "";
    if (!type.toLowerCase().includes("application/json")) {
      return Response.json({ error: "Craig returned an unexpected response." }, { status: 502 });
    }
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 256 * 1024) return Response.json({ error: "Craig metadata is too large." }, { status: 502 });
    const raw = await response.text();
    if (raw.length > 256 * 1024) return Response.json({ error: "Craig metadata is too large." }, { status: 502 });
    let body: { users?: unknown; recording?: { id?: unknown; guild?: { name?: unknown } }; live?: unknown };
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "Craig returned invalid metadata." }, { status: 502 }); }
    if (!Array.isArray(body.users)) return Response.json({ error: "Craig did not return a speaker list." }, { status: 502 });
    const speakers = body.users.slice(0, 64).map((u: CraigUser, index) => {
      const stableId = u.userId ?? u.id;
      return { discordUserId: typeof stableId === "string" && /^\d{15,22}$/u.test(stableId) ? stableId : null,
        discordName: safeName(u.username) ?? safeName(u.name) ?? safeName(u.displayName) ?? "Speaker " + (index + 1),
        displayName: safeName(u.displayName) ?? safeName(u.name) ?? null,
        track: typeof u.track === "number" && Number.isSafeInteger(u.track) ? u.track : null };
    });
    return Response.json({ recordingLabel: parsed.label, speakers, live: body.live === true }, { headers: { "cache-control": "no-store" } });
  } catch(error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "TimeoutError") return Response.json({ error: "Craig took too long to respond." }, { status: 504 });
    return campaignErrorResponse(error, "Craig recording could not be checked.");
  }
}
