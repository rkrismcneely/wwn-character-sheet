import assert from "node:assert/strict";
import test from "node:test";
import { parsePcmWavHeader, planPcmWavChunks, pcmWavChunkHeader } from "../lib/campaigns/recap-wav-chunks.ts";
test("PCM WAV chunks are frame-aligned, independently playable, and timestamped", () => {
  const pcm = { sampleRate: 16000, channels: 1, bitsPerSample: 16, blockAlign: 2, dataOffset: 44, dataBytes: 16000 * 2 * 75 };
  const chunks = planPcmWavChunks(pcm);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map(x => [x.startMs,x.endMs]), [[0,30000],[30000,60000],[60000,75000]]);
  for (const chunk of chunks) {
    const header = pcmWavChunkHeader(pcm, chunk.dataBytes);
    const parsed = parsePcmWavHeader(header, header.byteLength + chunk.dataBytes);
    assert.equal(parsed.dataBytes, chunk.dataBytes);
    assert.equal(chunk.dataBytes % pcm.blockAlign, 0);
  }
});
test("reject malformed RIFF and compressed formats", () => {
  const pcm = { sampleRate: 16000, channels: 1, bitsPerSample: 16, blockAlign: 2, dataOffset: 44, dataBytes: 32000 };
  const header = pcmWavChunkHeader(pcm,pcm.dataBytes);
  header[20] = 6;
  assert.throws(() => parsePcmWavHeader(header, 44+pcm.dataBytes), /Unsupported/);
  assert.throws(() => planPcmWavChunks(pcm, 60000));
});
