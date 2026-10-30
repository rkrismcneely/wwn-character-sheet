/** Provider-neutral, GM-approved full transcripts stored independently of recap Markdown. */
export const MAX_RECAP_TRANSCRIPT_CUES = 10000;
export const MAX_RECAP_TRANSCRIPT_TEXT = 1_000_000;
export const MAX_RECAP_TRANSCRIPT_SPEAKERS = 32;
export type CaptionCue = { startMs: number; endMs: number; rawSpeaker: string; text: string };
export type StoredCaptionCue = CaptionCue & {
  speakerName: string; role: "gm" | "player" | "guest"; characterName: string | null;
};
export type SavedRecapTranscript = {
  version: 1; published: boolean; updatedAt: string; cues: StoredCaptionCue[];
};
export function recapTranscriptObjectKey(campaignId: string, recapId: string): string {
  if (!/^cmp_[A-Za-z0-9_-]{22}$/u.test(campaignId) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(recapId)) {
    throw new Error("Invalid recap transcript identifier.");
  }
  return "recap-transcripts/" + campaignId + "/" + recapId + ".json";
}
export function validateRecapCaptionCues(raw: unknown): CaptionCue[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RECAP_TRANSCRIPT_CUES)
    throw new Error("Transcript requires 1–10,000 caption cues.");
  let total = 0;
  const speakers = new Set<string>();
  const cues: CaptionCue[] = [];
  for (const input of raw) {
    if (!input || typeof input !== "object") throw new Error("Invalid caption cue.");
    const row = input as Record<string,unknown>;
    const { startMs, endMs } = row;
    const rawSpeaker = typeof row.rawSpeaker === "string" ? row.rawSpeaker.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) ||
      (startMs as number) < 0 || (endMs as number) <= (startMs as number) ||
      (endMs as number) > 8*60*60*1000)
      throw new Error("Caption timestamps must be within an eight-hour session.");
    if (!rawSpeaker || rawSpeaker.length > 80 || /[\u0000-\u001f\u007f]/u.test(rawSpeaker) ||
      !text || text.length > 1500 || /[\u0000-\u001f\u007f]/u.test(text))
      throw new Error("Invalid caption speaker or dialogue.");
    total += text.length;
    if (total > MAX_RECAP_TRANSCRIPT_TEXT) throw new Error("Transcript exceeds 1,000,000 dialogue characters.");
    speakers.add(rawSpeaker);
    if (speakers.size > MAX_RECAP_TRANSCRIPT_SPEAKERS) throw new Error("Transcript has more than 32 speakers.");
    cues.push({startMs:startMs as number,endMs:endMs as number,rawSpeaker,text});
  }
  return cues.sort((a,b)=>a.startMs-b.startMs || a.endMs-b.endMs);
}
export function normalizeCaptionAssignments(raw: unknown, labels: string[]): Record<string,string|null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Confirm every transcript speaker.");
  const selections=raw as Record<string,unknown>;
  const result: Record<string,string|null> = Object.create(null) as Record<string,string|null>;
  for (const label of labels) {
    if (!Object.prototype.hasOwnProperty.call(selections,label)) throw new Error("Confirm every transcript speaker.");
    const value=selections[label];
    if (value !== null && (typeof value !== "string" || !/^[0-9a-f-]{36}$/iu.test(value)))
      throw new Error("Choose a saved speaker or mark this voice as a guest.");
    result[label]=value as string|null;
  }
  return result;
}
