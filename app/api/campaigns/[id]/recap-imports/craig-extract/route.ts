import { env } from "cloudflare:workers";
import { getSessionActor } from "@/lib/auth-session";
import { campaignErrorResponse } from "@/lib/campaigns/http";
import { getCraigRecordingForDownloadJob } from "@/lib/campaigns/recap-imports";
import { getCampaignD1 } from "@/lib/campaigns/service";
import { zipDirectoryLocation, parseZipDirectory } from "@/lib/campaigns/craig-zip-manifest";
import type { CraigArchiveEntry } from "@/lib/campaigns/craig-zip-manifest";
import { readBoundedJson, RequestBodyError } from "@/lib/http-json";

type Context = { params: Promise<{ id: string }> };
const MAX_TRACK_BYTES = 80 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024;
async function readRange(key: string, offset: number, length: number) {
  const result = await env.BUCKET.get(key, { range: { offset, length } });
  if (!result) throw new Error("Unable to read archive range.");
  return new Uint8Array(await result.arrayBuffer());
}
async function directory(key: string, size: number) {
  const tailLength = Math.min(65557, size);
  const tail = await readRange(key, size - tailLength, tailLength);
  const loc = zipDirectoryLocation(tail, size);
  return parseZipDirectory(await readRange(key, loc.offset, loc.length), loc.entries);
}
function guardedStream(source: ReadableStream<Uint8Array>, maxBytes: number) {
  let total = 0;
  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error("Decompressed track exceeded safe size limit.");
      controller.enqueue(chunk);
    },
  }));
}
async function trackData(key: string, totalSize: number, entry: CraigArchiveEntry) {
  if (entry.uncompressedBytes < 1 || entry.uncompressedBytes > MAX_TRACK_BYTES ||
    entry.compressedBytes < 1 || entry.compressedBytes > MAX_ARCHIVE_BYTES) throw new Error("Track exceeds size limits.");
  const local = await readRange(key, entry.localOffset, 30);
  const header = new DataView(local.buffer, local.byteOffset, local.byteLength);
  if (header.getUint32(0, true) !== 0x04034b50 ||
    header.getUint16(8, true) !== entry.compression ||
    (header.getUint16(6, true) & 1)) throw new Error("ZIP local header is invalid.");
  const nameLen = header.getUint16(26, true), extraLen = header.getUint16(28, true);
  const offset = entry.localOffset + 30 + nameLen + extraLen;
  if (offset + entry.compressedBytes > totalSize || offset >= totalSize) throw new Error("Track exceeds archive bounds.");
  const source = await env.BUCKET.get(key, { range: { offset, length: entry.compressedBytes } });
  if (!source?.body) throw new Error("ZIP track could not be read.");
  const stream = entry.compression === 8
    ? source.body.pipeThrough(new DecompressionStream("deflate-raw"))
    : source.body;
  return guardedStream(stream, entry.uncompressedBytes);
}
export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    const actor = await getSessionActor(request);
    if (!actor) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const { id } = await context.params;
    const body = await readBoundedJson(request, 2048) as { importId?: unknown; entryIndex?: unknown };
    const db = await getCampaignD1();
    await getCraigRecordingForDownloadJob(db, actor, id, body?.importId);
    if (!Number.isSafeInteger(body?.entryIndex) || (body.entryIndex as number) < 0 || (body.entryIndex as number) > 127) {
      return Response.json({ error: "Select a valid track." }, { status: 422 });
    }
    const row = await db.prepare("SELECT campaign_id AS campaignId FROM campaign_recap_recording_imports WHERE id=? AND source_type='craig'")
      .bind(body.importId).first<{ campaignId: string }>();
    if (!row) return Response.json({ error: "Recording not found." }, { status: 404 });
    const archiveKey = "recap-craig/" + row.campaignId + "/" + body.importId;
    const archive = await env.BUCKET.head(archiveKey);
    if (!archive || archive.size < 22 || archive.size > MAX_ARCHIVE_BYTES) {
      return Response.json({ error: "Save a supported Craig archive first." }, { status: 404 });
    }
    const entries = await directory(archiveKey, archive.size);
    const index = body.entryIndex as number;
    const entry = entries[index];
    if (!entry || !/\.(?:flac|aac|m4a)$/iu.test(entry.filename)) {
      return Response.json({ error: "Select a FLAC or AAC audio track from the archive." }, { status: 422 });
    }
    const outputKey = "recap-tracks/" + row.campaignId + "/" + body.importId + "/" + index;
    const stream = await trackData(archiveKey, archive.size, entry);
    const contentType = /\.flac$/iu.test(entry.filename) ? "audio/flac" : "audio/aac";
    // Decompression is streamed and bounded. A failed transfer cannot leave
    // an earlier or partially written track masquerading as the new output.
    await env.BUCKET.delete(outputKey);
    const saved = await env.BUCKET.put(outputKey, stream, {
      httpMetadata: { contentType },
      customMetadata: { filename: entry.filename, importId: body.importId as string, index: String(index) },
    });
    if (!saved || saved.size !== entry.uncompressedBytes) {
      await env.BUCKET.delete(outputKey);
      return Response.json({ error: "Extracted track length did not match ZIP metadata." }, { status: 422 });
    }
    return Response.json({ extracted: true, index, filename: entry.filename, bytes: saved.size },
      { headers: { "cache-control": "no-store" } });
  } catch(error) {
    if (error instanceof RequestBodyError) return Response.json({ error: error.message }, { status: error.status });
    return campaignErrorResponse(error, "Craig track could not be extracted.");
  }
}
