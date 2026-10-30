import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
type CraigJob = {
  status?: unknown; outputFileName?: unknown; outputSize?: unknown;
  options?: { format?: unknown }; type?: unknown;
};
function responseJob(job: CraigJob | null) {
  if (!job) return null;
  const status = typeof job.status === "string" && ["queued","running","complete","failed","cancelled","idle"].includes(job.status) ? job.status : "unknown";
  const size = typeof job.outputSize === "number" && Number.isSafeInteger(job.outputSize) && job.outputSize >= 0 ? job.outputSize : null;
  return { status, outputReady: status === "complete" && typeof job.outputFileName === "string" && job.outputFileName.length > 0, outputSize: size };
}
async function jobRequest(request: Request, context: Context, method: "GET" | "POST"): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const body = method === "POST" ? await readBoundedJson(request, 2048) as { importId?: unknown } : null;
    const importId = method === "GET" ? new URL(request.url).searchParams.get("importId") : body?.importId;
    const record = await getCraigRecordingForDownloadJob(await getCampaignD1(), actor, id, importId);
    const source = new URL(record.reference);
    const recordingId = source.pathname.split("/")[2];
    const url = "https://craig.horse/api/v1/recordings/" + encodeURIComponent(recordingId) + "/job?key=" + encodeURIComponent(source.searchParams.get("key")!);
    const upstream = await fetch(url, {
      method, headers: method === "POST" ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: method === "POST" ? JSON.stringify({ type: "recording", options: { format: "flac" } }) : undefined,
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) return Response.json({ error: upstream.status === 409
      ? "Craig already has an active conversion job. Check its status instead."
      : "Craig could not " + (method === "POST" ? "prepare" : "check") + " the recording." }, { status: 502 });
    const length = Number(upstream.headers.get("content-length") || 0);
    if (length > 128 * 1024 || !upstream.headers.get("content-type")?.includes("json")) {
      return Response.json({ error: "Craig returned unexpected job metadata." }, { status: 502 });
    }
    const payload = await upstream.text();
    if (payload.length > 128 * 1024) return Response.json({ error: "Craig job response too large." }, { status: 502 });
    let data: { job?: CraigJob | null };
    try { data = JSON.parse(payload); } catch { return Response.json({ error: "Craig job response invalid." }, { status: 502 }); }
    return Response.json({ job: responseJob(data.job ?? null) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "TimeoutError") return Response.json({ error: "Craig did not respond in time." }, { status: 504 });
    return campaignErrorResponse(error, "Craig recording preparation failed.");
  }
}
export async function POST(request: Request, context: Context) { return jobRequest(request, context, "POST"); }
export async function GET(request: Request, context: Context) { return jobRequest(request, context, "GET"); }
