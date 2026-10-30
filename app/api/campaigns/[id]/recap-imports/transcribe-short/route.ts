import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { normalizeTranscriptSegments, type TranscriptSpeaker } from "@/lib/campaigns/recap-transcript";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
const MAX_SAMPLE_BYTES = 2 * 1024 * 1024;
type WhisperOutput = { text?: string; segments?: Array<{ start?: number; end?: number; text?: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 1024) as { importId?: unknown; entryIndex?: unknown };
    const db = await getCampaignD1();
    await getCraigRecordingForDownloadJob(db, actor, id, body.importId);
    if (!Number.isSafeInteger(body.entryIndex) || (body.entryIndex as number) < 0 || (body.entryIndex as number) > 127)
      return Response.json({ error: "Select a valid track." }, { status: 422 });
    const row = await db.prepare("SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports WHERE id=? AND source_type='craig'")
      .bind(body.importId).first<{ campaignId: string }>();
    if (!row) return Response.json({ error: "Recording not found." }, { status: 404 });
    const prefix = row.campaignId + "/" + body.importId;
    const assignmentObject = await env.BUCKET.get("recap-track-speakers/" + prefix);
    if (!assignmentObject) return Response.json({ error: "Assign the track to a confirmed speaker first." }, { status: 409 });
    const snapshot = await assignmentObject.json<{ version: number; assignments: (TranscriptSpeaker & { index: number })[] }>();
    const speaker = snapshot.version === 1 && Array.isArray(snapshot.assignments)
      ? snapshot.assignments.find(item => item.index === body.entryIndex) : undefined;
    if (!speaker) return Response.json({ error: "This track has no confirmed speaker." }, { status: 409 });
    const audioKey = "recap-tracks/" + prefix + "/" + body.entryIndex;
    const head = await env.BUCKET.head(audioKey);
    if (!head || head.size < 1 || head.size > MAX_SAMPLE_BYTES || head.httpMetadata?.contentType !== "audio/flac")
      return Response.json({ error: "Initial transcription supports FLAC tracks up to 2 MB. Larger tracks require chunking." }, { status: 413 });
    const audio = await env.BUCKET.get(audioKey);
    if (!audio) return Response.json({ error: "Extracted track unavailable." }, { status: 404 });
    const bytes = new Uint8Array(await audio.arrayBuffer());
    // This action is explicit. AI inference may consume Cloudflare Workers AI quota.
    const model = env.AI as unknown as { run: (name: string, input: { audio: number[]; task: string }) => Promise<WhisperOutput> };
    const output = await model.run("@cf/openai/whisper-large-v3-turbo", { audio: Array.from(bytes), task: "transcribe" });
    if (!Array.isArray(output.segments) || output.segments.length === 0) {
      return Response.json({ error: "No timestamped speech detected; transcript was not changed." }, { status: 422 });
    }
    const raw = output.segments.map(part => ({
      startMs: Math.round((part.start ?? NaN) * 1000),
      endMs: Math.round((part.end ?? NaN) * 1000),
      text: part.text,
      trackIndex: body.entryIndex,
    }));
    let segments;
    try { segments = normalizeTranscriptSegments(raw, [speaker]); }
    catch { return Response.json({ error: "Provider timestamps failed validation; transcript unchanged." }, { status: 502 }); }
    const transcriptKey = "recap-transcripts/" + prefix;
    const existing = await env.BUCKET.get(transcriptKey);
    let previous: unknown[] = [];
    if (existing) {
      const document = await existing.json<{ version?: number; segments?: unknown[] }>();
      if (document.version !== 1 || !Array.isArray(document.segments))
        return Response.json({ error: "Existing transcript format unsupported." }, { status: 409 });
      previous = document.segments.filter(item => typeof item === "object" && item !== null && (item as { trackIndex?: unknown }).trackIndex !== body.entryIndex);
    }
    const all = normalizeTranscriptSegments([...previous, ...segments], snapshot.assignments);
    await env.BUCKET.put(transcriptKey, JSON.stringify({ version: 1, segments: all, updatedAt: new Date().toISOString() }),
      { httpMetadata: { contentType: "application/json" } });
    return Response.json({ saved: true, added: segments.length, total: all.length }, { headers: { "cache-control": "no-store" } });
  } catch(error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Short audio transcription failed.");
  }
}
