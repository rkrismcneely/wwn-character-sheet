import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { requireLegacyRecapR2Capacity } from "@/lib/campaigns/recap-r2-capacity";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024;
const MAX_META_BYTES = 64 * 1024;

/** Transfer only a completed, server-identified Craig archive to private R2. */
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const payload = await readBoundedJson(request, 2048) as { importId?: unknown };
    const db = await getCampaignD1();
    const recording = await getCraigRecordingForDownloadJob(db, actor, id, payload?.importId);
    const original = new URL(recording.reference);
    const recordingId = original.pathname.split("/")[2];
    const accessKey = original.searchParams.get("key");
    if (!accessKey) return Response.json({ error: "Craig access key missing." }, { status: 422 });
    const upstreamRoot = "https://craig.horse";
    const jobResponse = await fetch(upstreamRoot + "/api/v1/recordings/" +
      encodeURIComponent(recordingId) + "/job?key=" + encodeURIComponent(accessKey), {
        headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000),
      });
    if (!jobResponse.ok || !jobResponse.headers.get("content-type")?.includes("json")
      || Number(jobResponse.headers.get("content-length") || 0) > MAX_META_BYTES) {
      return Response.json({ error: "Craig job status could not be verified." }, { status: 502 });
    }
    const raw = await jobResponse.text();
    if (raw.length > MAX_META_BYTES) return Response.json({ error: "Craig job metadata too large." }, { status: 502 });
    let job: { status?: unknown; outputFileName?: unknown; outputSize?: unknown; type?: unknown; options?: { format?: unknown } } | null;
    try { ({ job } = JSON.parse(raw) as { job: typeof job }); }
    catch { return Response.json({ error: "Craig job metadata invalid." }, { status: 502 }); }
    if (!job || job.status !== "complete" || job.type !== "recording" || !["flac", "aac"].includes(String(job.options?.format))
      || typeof job.outputFileName !== "string" || !/^[A-Za-z0-9._-]{1,180}$/u.test(job.outputFileName)
      || job.outputFileName.startsWith(".")) {
      return Response.json({ error: "Prepare and complete the Craig multitrack AAC or FLAC archive first." }, { status: 409 });
    }
    // Provider output filenames only; never use a user-supplied URL or redirect destination.
    const download = await fetch(upstreamRoot + "/dl/" + encodeURIComponent(job.outputFileName), {
      redirect: "manual", signal: AbortSignal.timeout(30000),
    });
    const length = Number(download.headers.get("content-length"));
    if (download.status !== 200 || !download.body || !Number.isSafeInteger(length)
      || length < 1 || length > MAX_ARCHIVE_BYTES) {
      download.body?.cancel().catch(() => {});
      return Response.json({ error: "Craig archive could not be transferred. Files over 90 MB need the larger-file importer." }, { status: 502 });
    }
    const campaign = (await db.prepare("SELECT campaign_id AS id FROM campaign_recap_recording_imports WHERE id=?")
      .bind(payload.importId).first<{ id: string }>())?.id;
    if (!campaign) return Response.json({ error: "Recording no longer exists." }, { status: 404 });
    const key = "recap-craig/" + campaign + "/" + payload.importId;
    await requireLegacyRecapR2Capacity(env.BUCKET,length,key);
    // This route remains GM-only; the deterministic R2 object is not publicly exposed.
    const stored = await env.BUCKET.put(key, download.body, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { source: "craig", recordingId, filename: job.outputFileName, format: String(job.options?.format) },
    });
    if (!stored) return Response.json({ error: "Craig archive storage failed." }, { status: 502 });
    return Response.json({ saved: true, bytes: stored.size, filename: "craig-" + recordingId + ".zip" },
      { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "TimeoutError")
      return Response.json({ error: "Craig archive transfer timed out. You can retry." }, { status: 504 });
    return campaignErrorResponse(error, "Craig archive transfer failed.");
  }
}
