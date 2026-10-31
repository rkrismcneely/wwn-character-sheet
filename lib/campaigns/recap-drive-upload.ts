/**
 * GM-owned Drive resumable upload protocol. The Worker initiates a Google upload
 * session, then forwards small authenticated chunks without storing audio.
 * OAuth tokens stay server-side. Google session URLs are bearer capabilities
 * and must remain private to the initiating authorized GM.
 */
export const DRIVE_UPLOAD_BLOCK_BYTES = 256 * 1024;
export const DRIVE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const DRIVE_MAX_AUDIO_BYTES = 4 * 1024 * 1024 * 1024;
export const DRIVE_MAX_AUDIO_MS = 8 * 60 * 60 * 1000;

export type UploadDraft = {
  filename: string;
  mimeType: "audio/mpeg" | "audio/mp4" | "audio/wav" | "audio/flac" | "audio/aac";
  byteSize: number;
  durationMs: number | null;
};
export function validateAudioUploadDraft(raw: unknown): UploadDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Select an audio recording.");
  const obj = raw as Record<string,unknown>;
  const filename = typeof obj.filename === "string" ? obj.filename.trim() : "";
  if (filename.length < 1 || filename.length > 160 || /[\/\\\u0000-\u001f\u007f]/u.test(filename)) {
    throw new Error("Invalid recording filename.");
  }
  const mimeType = obj.mimeType;
  if (!["audio/mpeg","audio/mp4","audio/wav","audio/flac","audio/aac"].includes(mimeType as string)) {
    throw new Error("Select an MP3, M4A, WAV, FLAC or AAC recording.");
  }
  const byteSize = obj.byteSize;
  if (!Number.isSafeInteger(byteSize) || (byteSize as number) < 1 ||
      (byteSize as number) > DRIVE_MAX_AUDIO_BYTES) {
    throw new Error("Audio recording size exceeds the supported limit.");
  }
  const durationMs = obj.durationMs === undefined || obj.durationMs === null ? null : obj.durationMs;
  if (durationMs !== null && (!Number.isSafeInteger(durationMs) ||
      (durationMs as number) <= 0 || (durationMs as number) > DRIVE_MAX_AUDIO_MS)) {
    throw new Error("Invalid recording duration.");
  }
  return { filename, mimeType: mimeType as UploadDraft["mimeType"], byteSize: byteSize as number,
    durationMs: durationMs as number | null };
}
export function driveChunkRange(total: number, offset: number, chunkSize = DRIVE_UPLOAD_CHUNK_BYTES) {
  if (!Number.isSafeInteger(total) || total <= 0 || total > DRIVE_MAX_AUDIO_BYTES) {
    throw new Error("Invalid total upload size.");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= total) {
    throw new Error("Invalid upload offset.");
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < DRIVE_UPLOAD_BLOCK_BYTES ||
    chunkSize > 32 * 1024 * 1024 || chunkSize % DRIVE_UPLOAD_BLOCK_BYTES !== 0) {
    throw new Error("Drive upload chunk size must be a 256 KiB multiple.");
  }
  const end = Math.min(total, offset + chunkSize);
  if (end < total && (end-offset) % DRIVE_UPLOAD_BLOCK_BYTES !== 0) {
    throw new Error("Partial upload chunks must be 256 KiB aligned.");
  }
  return { start: offset, endExclusive: end, bytes: end - offset,
    contentRange: "bytes " + offset + "-" + (end - 1) + "/" + total };
}
/** Resume on Google's acknowledged range, NOT on our assumed sent position. */
export function nextDriveUploadOffset(status: number, range: string | null, total: number): number {
  if (!Number.isSafeInteger(total) || total < 1 || total > DRIVE_MAX_AUDIO_BYTES) {
    throw new Error("Invalid upload size.");
  }
  if (status === 200 || status === 201) return total;
  if (status !== 308) throw new Error("Upload session failed or expired.");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/u.exec(range.trim());
  if (!match) throw new Error("Invalid Drive upload acknowledgement.");
  const next = Number(match[1]) + 1;
  if (!Number.isSafeInteger(next) || next < 1 || next >= total) {
    throw new Error("Drive acknowledged bytes outside the file.");
  }
  return next;
}
/** Never permit a session URL on an attacker-controlled upload host. */
export function validateDriveSessionUrl(raw: string): string {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Invalid Google upload session."); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.googleapis.com" ||
    parsed.port || parsed.pathname !== "/upload/drive/v3/files" ||
    parsed.searchParams.get("uploadType") !== "resumable" ||
    !parsed.searchParams.get("upload_id") ||
    parsed.username || parsed.password || parsed.hash) {
    throw new Error("Unexpected Google upload session location.");
  }
  return parsed.toString();
}
