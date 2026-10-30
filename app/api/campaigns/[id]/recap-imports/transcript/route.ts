import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { normalizeTranscriptSegments, type TranscriptSpeaker } from "@/lib/campaigns/recap-transcript";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
type AssignmentStore = { version: 1; assignments: {
  index: number; displayName: string; role: "gm" | "player" | "guest"; characterName: string | null;
}[] };
async function scoped(request: Request, context: Context) {
  const actor = await getSessionActor(request);
  if (!actor) return { error: Response.json({ error: "Sign in required." }, { status: 401 }) } as const;
  const { id } = await context.params;
  const importId = new URL(request.url).searchParams.get("importId");
  const db = await getCampaignD1();
  await getCraigRecordingForDownloadJob(db, actor, id, importId);
  const row = await db.prepare("SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports WHERE id=? AND source_type='craig'")
    .bind(importId).first<{ campaignId: string }>();
  if (!row) return { error: Response.json({ error: "Recording not found." }, { status: 404 }) } as const;
  return { key: "recap-transcripts/" + row.campaignId + "/" + importId,
    assignmentKey: "recap-track-speakers/" + row.campaignId + "/" + importId } as const;
}
export async function GET(request: Request, context: Context) {
  try {
    const source = await scoped(request, context);
    if ("error" in source) return source.error;
    const object = await env.BUCKET.get(source.key);
    if (!object) return Response.json({ segments: [] }, { headers: { "cache-control": "no-store" } });
    return Response.json(await object.json(), { headers: { "cache-control": "no-store" } });
  } catch (error) { return campaignErrorResponse(error, "Transcript unavailable."); }
}
/** Store imported/provider-produced segments; never invoke external AI or reveal GM-only audio. */
export async function PUT(request: Request, context: Context) {
  try {
    const source = await scoped(request, context);
    if ("error" in source) return source.error;
    const assignment = await env.BUCKET.get(source.assignmentKey);
    if (!assignment) return Response.json({ error: "Assign and save recording speakers first." }, { status: 409 });
    const snapshot = await assignment.json<AssignmentStore>();
    if (snapshot.version !== 1 || !Array.isArray(snapshot.assignments) || snapshot.assignments.length === 0) {
      return Response.json({ error: "No confirmed track associations." }, { status: 409 });
    }
    const allowed: TranscriptSpeaker[] = snapshot.assignments;
    const payload = await readBoundedJson(request, 450_000) as { segments?: unknown };
    let segments: ReturnType<typeof normalizeTranscriptSegments>;
    try { segments = normalizeTranscriptSegments(payload?.segments, allowed); }
    catch(error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid transcript." }, { status: 422 }); }
    const document = { version: 1, segments, updatedAt: new Date().toISOString() };
    await env.BUCKET.put(source.key, JSON.stringify(document), { httpMetadata: { contentType: "application/json" } });
    return Response.json({ saved: true, count: segments.length }, { headers: { "cache-control": "no-store" } });
  } catch(error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Transcript could not be saved.");
  }
}
