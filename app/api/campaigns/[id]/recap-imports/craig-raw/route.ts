import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";

type Context = { params: Promise<{ id: string }> };

/**
 * GM-only, no-buffer streaming bridge for Craig's original raw.dat.
 * Craig's free local processor (Minizel) reads this with HTTP Range retries.
 * The browser never receives Craig's private recording key.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const importId = new URL(request.url).searchParams.get("importId");
    const db = await getCampaignD1();
    const record = await getCraigRecordingForDownloadJob(db, actor, id, importId);
    const original = new URL(record.reference);
    const recordingId = original.pathname.split("/")[2];
    const secret = original.searchParams.get("key");
    if (!secret) return Response.json({ error: "Craig recording key unavailable." }, { status: 422 });

    const range = request.headers.get("range");
    if (range && (!/^bytes=\d+-(?:\d+)?$/u.test(range) || range.length > 80)) {
      return Response.json({ error: "Invalid audio byte range." }, { status: 416 });
    }
    const url = "https://craig.horse/api/v1/recordings/" + encodeURIComponent(recordingId) +
      "/raw.dat?key=" + encodeURIComponent(secret);
    const upstream = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: range ? { range, accept: "application/octet-stream" } : { accept: "application/octet-stream" },
      signal: request.signal,
    });
    if (![200,206].includes(upstream.status) || !upstream.body) {
      return Response.json({ error: "Craig raw recording unavailable or expired." }, { status: 502 });
    }
    if (range && upstream.status !== 206) {
      await upstream.body.cancel();
      return Response.json({ error: "Craig did not honor the requested resume range." }, { status: 502 });
    }
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-type": "application/octet-stream",
      "x-content-type-options": "nosniff",
      "accept-ranges": "bytes",
    });
    for (const header of ["content-length","content-range"]) {
      const value = upstream.headers.get(header);
      if (value) headers.set(header,value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch(error) {
    return campaignErrorResponse(error, "Craig raw audio stream unavailable.");
  }
}
