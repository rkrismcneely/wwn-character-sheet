import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { canManageCampaignContent } from "@/lib/campaigns/authorization";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { createUploadedRecapRecording } from "@/lib/campaigns/recap-imports";
import { getCampaignD1, loadCampaignAccess, requireActiveCampaign } from "@/lib/campaigns/service";
import { parseRecapSessionDate } from "@/lib/campaigns/recap-import-validation";
import { requireLegacyRecapR2Capacity } from "@/lib/campaigns/recap-r2-capacity";

type Context = { params: Promise<{ id: string }> };
const MAX_AUDIO_BYTES = 90 * 1024 * 1024;
const audioTypes = new Map([
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/mp4", ".m4a"],
  ["audio/x-m4a", ".m4a"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
]);
/**
 * Ingest the raw request body as a bounded stream rather than parsing a
 * potentially huge multipart FormData object in Worker memory.
 * A later phase will add resumable multipart uploads for longer recordings.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  let uploadedKey: string | null = null;
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in required." }, { status: 401 });
    const { id } = await context.params;
    const db = await getCampaignD1();
    const access = await loadCampaignAccess(db, actor, id);
    if (!canManageCampaignContent(actor, access.campaign, access.membership)) {
      return Response.json({ error: "Only campaign GMs can upload recordings." }, { status: 403 });
    }
    requireActiveCampaign(access.campaign);
    const date = request.headers.get("x-recap-date");
    try { parseRecapSessionDate(date); } catch {
      return Response.json({ error: "Enter a valid session date." }, { status: 422 });
    }
    const size = Number(request.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_AUDIO_BYTES) {
      return Response.json({ error: "Audio must be between 1 byte and 90 MB. Larger recordings will use resumable uploads later." }, { status: 413 });
    }
    const mime = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extension = audioTypes.get(mime);
    const filename = request.headers.get("x-recap-filename") || "";
    if (!extension || filename.length < 5 || filename.length > 150
      || /[\u0000-\u001f\u007f/\\]/u.test(filename)
      || !filename.toLowerCase().endsWith(extension)) {
      return Response.json({ error: "Choose an MP3, M4A or WAV audio file." }, { status: 422 });
    }
    if (!request.body) return Response.json({ error: "Recording data is missing." }, { status: 422 });
    await requireLegacyRecapR2Capacity(env.BUCKET,size);
    uploadedKey = "recap-audio/" + access.campaign.id + "/" + crypto.randomUUID();
    // R2 receives the bounded request stream directly; never buffer it in the Worker.
    await env.BUCKET.put(uploadedKey, request.body, {
      httpMetadata: { contentType: mime },
      customMetadata: { filename, campaignId: access.campaign.id },
    });
    const recording = await createUploadedRecapRecording(db, actor, id, {
      storageKey: uploadedKey, filename, sessionDate: date,
    });
    return Response.json({ recording }, { status: 201 });
  } catch (error) {
    if (uploadedKey) {
      try { await env.BUCKET.delete(uploadedKey); } catch { /* preserve original error */ }
    }
    return campaignErrorResponse(error, "The audio recording could not be uploaded.");
  }
}
