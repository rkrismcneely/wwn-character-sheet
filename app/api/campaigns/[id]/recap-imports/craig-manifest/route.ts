import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { zipDirectoryLocation, parseZipDirectory } from "@/lib/campaigns/craig-zip-manifest";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const importId = new URL(request.url).searchParams.get("importId");
    const db = await getCampaignD1();
    // Applies the same GM and ready-state restrictions as the archive transfer.
    await getCraigRecordingForDownloadJob(db, actor, id, importId);
    const record = await db.prepare(
      "SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports WHERE id=? AND source_type='craig'"
    ).bind(importId).first<{ campaignId: string }>();
    if (!record) return Response.json({ error: "Recording not found." }, { status: 404 });
    const object = await env.BUCKET.head("recap-craig/" + record.campaignId + "/" + importId);
    if (!object) return Response.json({ error: "Save the Craig archive before inspecting tracks." }, { status: 404 });
    if (object.size < 22 || object.size > 90 * 1024 * 1024) {
      return Response.json({ error: "ZIP archive size not supported." }, { status: 422 });
    }
    const tailLength = Math.min(65557, object.size);
    const tail = await env.BUCKET.get(object.key, { range: { offset: object.size - tailLength, length: tailLength } });
    if (!tail) return Response.json({ error: "Could not read ZIP directory." }, { status: 502 });
    const position = zipDirectoryLocation(new Uint8Array(await tail.arrayBuffer()), object.size);
    const dir = await env.BUCKET.get(object.key, { range: { offset: position.offset, length: position.length } });
    if (!dir) return Response.json({ error: "ZIP directory unavailable." }, { status: 502 });
    const entries = parseZipDirectory(new Uint8Array(await dir.arrayBuffer()), position.entries);
    return Response.json({ entries, totalEntries: entries.length }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && /ZIP|archive|compression|filename|tracks|directory/.test(error.message)) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return campaignErrorResponse(error, "Could not inspect Craig archive.");
  }
}
