import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = p => readFile(new URL(p, import.meta.url), "utf8");
test("Craig FLAC track extraction is GM-scoped, bounded, and streamed to private R2", async () => {
  const [route, scanner, setup] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/craig-extract/route.ts"),
    read("../lib/campaigns/craig-zip-manifest.ts"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  assert.match(route, /getCraigRecordingForDownloadJob/u);
  assert.match(route, /MAX_TRACK_BYTES/u);
  assert.match(route, /DecompressionStream\("deflate-raw"\)/u);
  assert.match(route, /guardedStream\(stream, entry\.uncompressedBytes\)/u);
  assert.match(route, /saved\.size !== entry\.uncompressedBytes/u);
  assert.match(route, /BUCKET\.put\(outputKey, stream/u);
  assert.match(route, /BUCKET\.delete\(outputKey\)/u);
  assert.match(scanner, /localOffset/u);
  assert.match(setup, /Extract Track/u);
});
