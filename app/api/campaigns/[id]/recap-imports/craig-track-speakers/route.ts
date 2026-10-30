import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
type Assignment = { index: number; discordName: string; displayName: string; role: "player" | "gm" | "guest"; characterName: string | null };
type Stored = { version: 1; assignments: Assignment[]; updatedAt: string };
async function scope(request: Request, context: Context) {
  const actor = await getSessionActor(request);
  if (!actor) throw new Error("AUTH_REQUIRED");
  const { id } = await context.params;
  const importId = new URL(request.url).searchParams.get("importId");
  const db = await getCampaignD1();
  await getCraigRecordingForDownloadJob(db, actor, id, importId);
  const row = await db.prepare("SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports WHERE id=? AND source_type='craig'")
    .bind(importId).first<{ campaignId: string }>();
  if (!row) throw new Error("NOT_FOUND");
  return { db, importId: importId!, campaignId: row.campaignId, key: "recap-track-speakers/" + row.campaignId + "/" + importId };
}
function fail(error: unknown) {
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return Response.json({ error: "Sign in required." }, { status: 401 });
  if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Recording not found." }, { status: 404 });
  if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
  return campaignErrorResponse(error, "Recording track associations unavailable.");
}
export async function GET(request: Request, context: Context) {
  try {
    const { key } = await scope(request, context);
    const object = await env.BUCKET.get(key);
    if (!object) return Response.json({ assignments: [] }, { headers: { "cache-control": "no-store" } });
    const saved = await object.json<Stored>();
    return Response.json({ assignments: saved.version === 1 ? saved.assignments : [] }, { headers: { "cache-control": "no-store" } });
  } catch(error) { return fail(error); }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { db, importId, campaignId, key } = await scope(request, context);
    const payload = await readBoundedJson(request, 8192) as { assignments?: unknown };
    if (!Array.isArray(payload?.assignments) || payload.assignments.length > 32) {
      return Response.json({ error: "Choose up to 32 track assignments." }, { status: 422 });
    }
    const rows = await db.prepare("SELECT discord_name AS discordName, display_name AS displayName,role,character_name AS characterName " +
      "FROM campaign_recap_recording_speakers WHERE import_id=?").bind(importId).all<Omit<Assignment,"index">>();
    const byName = new Map(rows.results.map(row => [row.discordName, row]));
    const assigned: Assignment[] = [];
    const indexes = new Set<number>();
    for (const item of payload.assignments) {
      if (!item || typeof item !== "object") return Response.json({ error: "Invalid track assignment." }, { status: 422 });
      const { index, discordName } = item as { index?: unknown; discordName?: unknown };
      if (!Number.isSafeInteger(index) || (index as number) < 0 || (index as number) > 127 ||
        typeof discordName !== "string" || !byName.has(discordName) || indexes.has(index as number)) {
        return Response.json({ error: "Each track must have one confirmed speaker." }, { status: 422 });
      }
      const track = await env.BUCKET.head("recap-tracks/" + campaignId + "/" + importId + "/" + index);
      if (!track || !["audio/flac", "audio/aac"].includes(track.httpMetadata?.contentType || "")) {
        return Response.json({ error: "Extract the audio track before assigning it." }, { status: 409 });
      }
      indexes.add(index as number);
      assigned.push({ index: index as number, ...byName.get(discordName)! });
    }
    const stored: Stored = { version: 1, assignments: assigned, updatedAt: new Date().toISOString() };
    await env.BUCKET.put(key, JSON.stringify(stored), { httpMetadata: { contentType: "application/json" } });
    return Response.json({ assignments: assigned }, { headers: { "cache-control": "no-store" } });
  } catch(error) { return fail(error); }
}
