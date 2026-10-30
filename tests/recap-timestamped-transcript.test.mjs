import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeTranscriptSegments } from "../lib/campaigns/recap-transcript.ts";
const speakers = [
  { index: 0, displayName: "GM", role: "gm", characterName: null },
  { index: 2, displayName: "Ari", role: "player", characterName: "The Scout" },
];
test("transcript timestamps sort chronologically while retaining speaker snapshots", () => {
  const result = normalizeTranscriptSegments([
    { startMs: 4000, endMs: 5000, trackIndex: 2, text: "  Hello there. " },
    { startMs: 2000, endMs: 3000, trackIndex: 0, text: "Welcome." },
  ], speakers);
  assert.deepEqual(result.map(row => row.speakerName), ["GM", "Ari"]);
  assert.equal(result[1].characterName, "The Scout");
  assert.equal(result[1].text, "Hello there.");
});
test("transcript validation rejects unknown tracks, corrupt timings and excessive text", () => {
  assert.throws(() => normalizeTranscriptSegments([{ startMs: 0, endMs: 100, trackIndex: 3, text: "No" }], speakers));
  assert.throws(() => normalizeTranscriptSegments([{ startMs: 500, endMs: 100, trackIndex: 0, text: "No" }], speakers));
  assert.throws(() => normalizeTranscriptSegments([{ startMs: 0, endMs: 100, trackIndex: 0, text: "x".repeat(1501) }], speakers));
});
test("transcripts use private R2 with GM authorization and no AI calls", async () => {
 const [route, model] = await Promise.all([
   readFile(new URL("../app/api/campaigns/[id]/recap-imports/transcript/route.ts", import.meta.url), "utf8"),
   readFile(new URL("../lib/campaigns/recap-transcript.ts", import.meta.url), "utf8"),
 ]);
 assert.match(route, /getCraigRecordingForDownloadJob/u);
 assert.match(route, /recap-track-speakers\//u);
 assert.match(route, /recap-transcripts\//u);
 assert.match(route, /BUCKET\.put\(source\.key/u);
 assert.match(model, /sort\(\(a, b\) => a\.startMs - b\.startMs/u);
});
