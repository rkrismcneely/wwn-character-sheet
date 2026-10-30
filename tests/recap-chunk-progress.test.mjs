import assert from "node:assert/strict";
import test from "node:test";
import { chunkWindow, newChunkProgress, validateChunkProgress, summarizeChunkProgress } from "../lib/campaigns/recap-chunk-progress.ts";
test("three-hour recordings plan 360 independently tracked pieces per speaker", () => {
  const duration = 3 * 60 * 60 * 1000;
  assert.deepEqual(chunkWindow(0, duration), { startMs: 0, endMs: 30000, count: 360 });
  assert.deepEqual(chunkWindow(359, duration), { startMs: duration-30000, endMs: duration, count: 360 });
  assert.throws(() => chunkWindow(360, duration), /outside/);
  const progress = newChunkProgress(3, 359, duration);
  assert.equal(progress.state, "pending");
  assert.equal(progress.trackIndex, 3);
  assert.equal(summarizeChunkProgress([progress], 360*6).pending, 2160);
});
test("failed pieces remain retryable without discarding completed pieces", () => {
  const duration = 2 * 60 * 60 * 1000;
  const completed = { ...newChunkProgress(0,0,duration), state: "completed" };
  const failed = { ...newChunkProgress(0,1,duration), state: "failed", attempts: 2, errorCode: "provider" };
  assert.equal(validateChunkProgress(failed,duration).attempts,2);
  assert.deepEqual(summarizeChunkProgress([completed,failed],240), {
    pending:238, processing:0, completed:1, failed:1,total:240,percentComplete:0
  });
  assert.throws(() => summarizeChunkProgress([completed,completed],240), /Duplicate/);
});
test("chunk progress rejects fabricated timing and excessive duration", () => {
  assert.throws(() => chunkWindow(0, 9*60*60*1000), /duration/);
  const record = newChunkProgress(0, 0, 100000);
  assert.throws(() => validateChunkProgress({...record,endMs:5}, 100000), /timestamps/);
});
