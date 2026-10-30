import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChunkTranscript, replaceTranscriptChunk } from "../lib/campaigns/recap-transcript.ts";

const speakers = [
  { index: 0, displayName: "GM", role: "gm", characterName: null },
  { index: 2, displayName: "Player", role: "player", characterName: "Wizard" },
];

test("audio chunk timestamps shift to their session positions and retain identities", () => {
  const segments = normalizeChunkTranscript([
    { startMs: 1000, endMs: 2000, text: "  Hello. " },
  ], speakers[1], { startMs: 60000, endMs: 90000 });
  assert.deepEqual(segments.map(s => [s.startMs, s.endMs, s.trackIndex, s.speakerName, s.characterName]), [
    [61000, 62000, 2, "Player", "Wizard"],
  ]);
});
test("rejects invalid chunk-relative timestamps instead of silently extending audio", () => {
  assert.throws(() => normalizeChunkTranscript([{ startMs: 5000, endMs: 12000, text: "bad" }],
    speakers[0], { startMs: 0, endMs: 10000 }));
  assert.throws(() => normalizeChunkTranscript([{ startMs: -1, endMs: 5000, text: "bad" }],
    speakers[0], { startMs: 0, endMs: 10000 }));
});
test("retrying a chunk replaces that track's range without dropping another speaker", () => {
  const first = normalizeChunkTranscript([{ startMs: 1000, endMs: 2000, text: "First" }],
    speakers[1], { startMs: 60000, endMs: 90000 });
  const other = normalizeChunkTranscript([{ startMs: 1000, endMs: 3000, text: "GM speaks" }],
    speakers[0], { startMs: 60000, endMs: 90000 });
  const next = normalizeChunkTranscript([{ startMs: 1500, endMs: 2500, text: "Corrected" }],
    speakers[1], { startMs: 60000, endMs: 90000 });
  const merged = replaceTranscriptChunk([...first, ...other], next, speakers[1],
    { startMs: 60000, endMs: 90000 }, speakers);
  assert.deepEqual(merged.map(s => s.text), ["GM speaks", "Corrected"]);
});
