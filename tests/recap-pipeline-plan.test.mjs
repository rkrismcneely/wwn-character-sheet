import assert from "node:assert/strict";
import test from "node:test";
import { planRecapProcessing } from "../lib/campaigns/recap-pipeline-plan.ts";
test("2–3 hour multitrack sessions are treated as normal capacity", () => {
  const p = planRecapProcessing({
    lane: "craig-multitrack", durationMs: 3 * 60 * 60 * 1000,
    tracks: 6, transcriptionUsdPerMinute: 0.000513,
  });
  assert.equal(p.maxSegmentsPerTrack, 360);
  assert.equal(p.maxSegmentsTotal, 2160);
  assert.equal(p.estimatedAudioMinutes, 1080);
  assert.equal(p.estimatedTranscriptionUsd, 0.55404);
  assert.equal(p.parallelTranscriptions, 2);
  assert.equal(p.needsMediaDecoder, true);
  assert.ok(p.stages.includes("review-recap"));
  const twoHours = planRecapProcessing({lane:"audio-upload",durationMs:7200000,tracks:1});
  assert.equal(twoHours.maxSegmentsTotal, 240);
  assert.equal(twoHours.estimatedTranscriptionUsd, null);
});
test("Craig timestamped captions bypass audio inference when already available", () => {
  const p = planRecapProcessing({lane:"timed-captions",durationMs:10800000,tracks:1,transcriptionUsdPerMinute:0.000513});
  assert.equal(p.maxSegmentsTotal, 0);
  assert.equal(p.needsMediaDecoder, false);
  assert.equal(p.estimatedTranscriptionUsd, 0);
  assert.deepEqual(p.stages.slice(0,2), ["validate-captions", "attribute-speakers"]);
});
test("rejects excessive duration, tracks and unconstrained concurrency", () => {
  const input = {lane:"craig-multitrack",durationMs:10800000,tracks:6};
  assert.throws(() => planRecapProcessing({...input, durationMs: 9*3600000}),/duration/);
  assert.throws(() => planRecapProcessing({...input, tracks: 33}),/tracks/);
  assert.throws(() => planRecapProcessing({...input, parallelism: 100}),/simultaneous/);
  assert.throws(() => planRecapProcessing({...input, segmentMs: 500}),/Segment/);
  assert.throws(() => planRecapProcessing({...input, transcriptionUsdPerMinute: -1}),/rate/);
});
