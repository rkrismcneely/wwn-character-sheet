/** Validated, speaker-aware transcript format independent of transcription provider. */
export type TranscriptSegment = {
  startMs: number; endMs: number; text: string;
  trackIndex: number; speakerName: string; role: "gm" | "player" | "guest";
  characterName: string | null;
};
export type TranscriptSpeaker = { index: number; displayName: string; role: "gm" | "player" | "guest"; characterName: string | null };
export function normalizeTranscriptSegments(raw: unknown, assigned: TranscriptSpeaker[]): TranscriptSegment[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1500) throw new Error("Provide 1–1500 timestamped transcript segments.");
  const speakers = new Map(assigned.map(row => [row.index, row]));
  let totalText = 0;
  const segments = raw.map((item: unknown): TranscriptSegment => {
    if (!item || typeof item !== "object") throw new Error("Invalid transcript segment.");
    const row = item as Record<string, unknown>;
    const startMs = row.startMs, endMs = row.endMs, trackIndex = row.trackIndex;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) ||
      (startMs as number) < 0 || (endMs as number) <= (startMs as number) ||
      (endMs as number) > 8 * 60 * 60 * 1000 ||
      !Number.isSafeInteger(trackIndex) || !speakers.has(trackIndex as number)) {
      throw new Error("A transcript segment has invalid timestamps or an unassigned track.");
    }
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text || text.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
      throw new Error("Transcript segment text must be 1–1500 characters.");
    }
    totalText += text.length;
    if (totalText > 300_000) throw new Error("Transcript exceeds maximum text length.");
    const speaker = speakers.get(trackIndex as number)!;
    return { startMs: startMs as number, endMs: endMs as number, text,
      trackIndex: trackIndex as number, speakerName: speaker.displayName,
      role: speaker.role, characterName: speaker.characterName };
  });
  return segments.sort((a, b) => a.startMs - b.startMs || a.trackIndex - b.trackIndex || a.endMs - b.endMs);
}


/**
 * Convert timestamped transcription segments from one already-decoded audio
 * chunk into session-relative positions. Audio segmentation happens elsewhere.
 * Ranges are half-open [startMs, endMs) and must not be fabricated from bytes.
 */
export function normalizeChunkTranscript(
  raw: unknown,
  speaker: TranscriptSpeaker,
  chunk: { startMs: number; endMs: number },
): TranscriptSegment[] {
  if (!Number.isSafeInteger(chunk.startMs) || !Number.isSafeInteger(chunk.endMs) ||
      chunk.startMs < 0 || chunk.endMs <= chunk.startMs ||
      chunk.endMs > 8 * 60 * 60 * 1000) {
    throw new Error("Invalid audio chunk time range.");
  }
  const duration = chunk.endMs - chunk.startMs;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1500) {
    throw new Error("Audio chunk must contain 1–1500 transcript segments.");
  }
  const shifted = raw.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid chunk transcript.");
    const part = item as Record<string, unknown>;
    if (!Number.isSafeInteger(part.startMs) || !Number.isSafeInteger(part.endMs) ||
        (part.startMs as number) < 0 || (part.endMs as number) <= (part.startMs as number) ||
        (part.endMs as number) > duration) {
      throw new Error("Chunk timestamps must fit inside the actual audio chunk.");
    }
    return {
      startMs: (part.startMs as number) + chunk.startMs,
      endMs: (part.endMs as number) + chunk.startMs,
      text: part.text,
      trackIndex: speaker.index,
    };
  });
  return normalizeTranscriptSegments(shifted, [speaker]);
}

/**
 * Replace only the specified track's segments within an audio time range.
 * Retries of the same chunk therefore do not duplicate speech, while other
 * speakers and other portions of the recording remain untouched.
 */
export function replaceTranscriptChunk(
  existing: TranscriptSegment[],
  incoming: TranscriptSegment[],
  speaker: TranscriptSpeaker,
  chunk: { startMs: number; endMs: number },
  assigned: TranscriptSpeaker[],
): TranscriptSegment[] {
  const kept = existing.filter(segment =>
    segment.trackIndex !== speaker.index ||
    segment.endMs <= chunk.startMs || segment.startMs >= chunk.endMs);
  return normalizeTranscriptSegments([...kept, ...incoming], assigned);
}
