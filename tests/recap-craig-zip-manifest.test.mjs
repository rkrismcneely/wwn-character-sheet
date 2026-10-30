import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseZipDirectory, zipDirectoryLocation } from "../lib/campaigns/craig-zip-manifest.ts";
test("Craig ZIP inventory parses a minimal ordinary ZIP directory", () => {
  const name = new TextEncoder().encode("track-1.flac");
  const directory = new Uint8Array(46 + name.length);
  const view = new DataView(directory.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(10, 8, true);
  view.setUint32(20, 12, true);
  view.setUint32(24, 20, true);
  view.setUint16(28, name.length, true);
  directory.set(name, 46);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, 1, true);
  e.setUint16(10, 1, true);
  e.setUint32(12, directory.length, true);
  e.setUint32(16, 0, true);
  const loc = zipDirectoryLocation(end, directory.length + end.length);
  assert.deepEqual(loc, { offset: 0, length: directory.length, entries: 1 });
  assert.deepEqual(parseZipDirectory(directory, loc.entries), [
    { filename: "track-1.flac", compressedBytes: 12, uncompressedBytes: 20, compression: 8, localOffset: 0 },
  ]);
  directory.set(new TextEncoder().encode("../evil.flac"), 46);
  assert.throws(() => parseZipDirectory(directory, 1));
});
test("manifest requires a GM and reads bounded R2 ranges, not archive body", async () => {
  const [route,ui] = await Promise.all([
    readFile(new URL("../app/api/campaigns/[id]/recap-imports/craig-manifest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/session-recap-recording-setup.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /getCraigRecordingForDownloadJob/u);
  assert.match(route, /BUCKET\.head/u);
  assert.match(route, /range: \{ offset:/u);
  assert.match(ui, /Inspect Tracks/u);
});
