import { DRIVE_MAX_AUDIO_BYTES, validateAudioUploadDraft } from "./recap-drive-upload.ts";

const fileTypes: Readonly<Record<string, "audio/mpeg" | "audio/mp4" | "audio/wav" | "audio/flac" | "audio/aac">> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
};

export function describeAudioUploadFile(file: Pick<File, "name" | "size">) {
  const suffix = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = fileTypes[suffix];
  if (!mimeType) throw new Error("Choose an MP3, M4A, WAV, FLAC or AAC audio file.");
  const draft = validateAudioUploadDraft({
    filename: file.name,
    mimeType,
    byteSize: file.size,
    durationMs: null,
  });
  return draft;
}
export function uploadPercent(bytes: number, total: number) {
  if (!Number.isFinite(bytes) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(bytes / total * 100)));
}
export function formatAudioUploadSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > DRIVE_MAX_AUDIO_BYTES) return "Unknown size";
  return bytes >= 1024 * 1024 * 1024
    ? (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB"
    : (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
