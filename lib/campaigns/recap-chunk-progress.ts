/**
 * Durable recording-chunk progress records. One R2 object per chunk avoids
 * rewriting a giant manifest after every completed transcription.
 *
 * Audio chunk preparation and provider dispatch are separate stages.
 */
export const RECAP_MAX_SESSION_MS = 8 * 60 * 60 * 1000;
export const RECAP_CHUNK_MS = 30_000;
export type ChunkState = "pending" | "processing" | "completed" | "failed";
export type ChunkProgress = {
  version: 1;
  trackIndex: number;
  chunkIndex: number;
  startMs: number;
  endMs: number;
  state: ChunkState;
  attempts: number;
  updatedAt: string;
  errorCode?: "audio" | "provider" | "timeout" | "invalid_result";
};
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function chunkWindow(chunkIndex: number, totalMs: number, chunkMs = RECAP_CHUNK_MS) {
  check(Number.isSafeInteger(totalMs) && totalMs > 0 && totalMs <= RECAP_MAX_SESSION_MS, "Invalid recording duration.");
  check(Number.isSafeInteger(chunkMs) && chunkMs >= 1000 && chunkMs <= RECAP_CHUNK_MS, "Invalid chunk duration.");
  check(Number.isSafeInteger(chunkIndex) && chunkIndex >= 0, "Invalid chunk index.");
  const count = Math.ceil(totalMs / chunkMs);
  check(chunkIndex < count, "Chunk outside recording.");
  const startMs = chunkIndex * chunkMs;
  return { startMs, endMs: Math.min(totalMs, startMs + chunkMs), count };
}
export function validateChunkProgress(raw: unknown, totalMs: number): ChunkProgress {
  check(raw && typeof raw === "object", "Invalid chunk progress.");
  const r = raw as Record<string, unknown>;
  check(r.version === 1 && Number.isSafeInteger(r.trackIndex) &&
    (r.trackIndex as number) >= 0 && (r.trackIndex as number) < 128, "Invalid track identifier.");
  const window = chunkWindow(r.chunkIndex as number, totalMs);
  check(r.startMs === window.startMs && r.endMs === window.endMs, "Incorrect audio chunk timestamps.");
  check(["pending","processing","completed","failed"].includes(r.state as string), "Unknown chunk status.");
  check(Number.isSafeInteger(r.attempts) && (r.attempts as number) >= 0 && (r.attempts as number) <= 25,
    "Invalid retry count.");
  check(typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt)), "Invalid update time.");
  check(r.errorCode === undefined || ["audio","provider","timeout","invalid_result"].includes(r.errorCode as string),
    "Invalid chunk failure code.");
  return r as unknown as ChunkProgress;
}
export function newChunkProgress(trackIndex: number, chunkIndex: number, totalMs: number): ChunkProgress {
  const w = chunkWindow(chunkIndex, totalMs);
  return validateChunkProgress({
    version: 1, trackIndex, chunkIndex,
    startMs: w.startMs, endMs: w.endMs,
    state: "pending", attempts: 0, updatedAt: new Date().toISOString(),
  }, totalMs);
}
export function summarizeChunkProgress(records: ChunkProgress[], totalChunks: number) {
  check(Number.isSafeInteger(totalChunks) && totalChunks >= 0 && totalChunks <= 128 * 960,
    "Invalid session chunk count.");
  const seen = new Set<string>();
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const record of records) {
    const id = record.trackIndex + ":" + record.chunkIndex;
    check(!seen.has(id), "Duplicate chunk progress record.");
    seen.add(id);
    counts[record.state] += 1;
  }
  check(records.length <= totalChunks, "More progress records than planned chunks.");
  counts.pending += totalChunks - records.length;
  return { ...counts, total: totalChunks, percentComplete: totalChunks ? Math.round(100 * counts.completed / totalChunks) : 0 };
}
