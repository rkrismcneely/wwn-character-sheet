import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };
const MAX_INFO_BYTES = 64 * 1024;

/**
 * Craig includes info.txt (session metadata and /note events) in ordinary
 * multitrack archives and exposes it as a direct authenticated download.
 * This route reads ONLY text; it never downloads or processes audio.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const importId = new URL(request.url).searchParams.get("importId");
    const record = await getCraigRecordingForDownloadJob(await getCampaignD1(), actor, id, importId);
    const parsed = new URL(record.reference);
    const recordingId = parsed.pathname.split("/")[2];
    const key = parsed.searchParams.get("key");
    if (!key) return Response.json({ error: "Craig recording key unavailable." }, { status: 422 });
    // No caller-controlled upstream host. Never expose or log the private key.
    const url = "https://craig.horse/api/v1/recordings/" + encodeURIComponent(recordingId) +
      "/info.txt?key=" + encodeURIComponent(key);
    const upstream = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000) });
    if (upstream.status !== 200 || !upstream.body) {
      return Response.json({ error: "Craig notes or info file unavailable. It may have expired." }, { status: 404 });
    }
    const length = Number(upstream.headers.get("content-length") || 0);
    if (length > MAX_INFO_BYTES) {
      await upstream.body.cancel();
      return Response.json({ error: "Craig info file exceeds 64 KB." }, { status: 422 });
    }
    let count = 0;
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        count += result.value.byteLength;
        if (count > MAX_INFO_BYTES) {
          await reader.cancel();
          return Response.json({ error: "Craig info file exceeds 64 KB." }, { status: 422 });
        }
        chunks.push(result.value);
      }
    } finally { reader.releaseLock(); }
    const output = new Uint8Array(count);
    let cursor = 0;
    for (const chunk of chunks) { output.set(chunk,cursor); cursor += chunk.byteLength; }
    const info = new TextDecoder("utf-8", { fatal: false }).decode(output)
      .replace(/\u0000/g, "").slice(0, MAX_INFO_BYTES);
    return Response.json({ info }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json({ error: "Craig info request timed out." }, { status: 504 });
    }
    return campaignErrorResponse(error, "Craig session info unavailable.");
  }
}
