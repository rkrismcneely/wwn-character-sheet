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
