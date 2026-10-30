import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = p => readFile(new URL(p, import.meta.url), "utf8");
test("Craig free AAC is default while lossless FLAC remains optional", async () => {
  const [job, transfer, extract, setup] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/craig-job/route.ts"),
    read("../app/api/campaigns/[id]/recap-imports/craig-transfer/route.ts"),
    read("../app/api/campaigns/[id]/recap-imports/craig-extract/route.ts"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  assert.match(job, /: "aac"/u);
  assert.match(job, /body\?\.format === "flac"/u);
  assert.match(transfer, /\["flac", "aac"\]/u);
  assert.match(extract, /flac\|aac\|m4a/u);
  assert.match(extract, /audio\/aac/u);
  assert.match(setup, /Prepare Craig Audio \(AAC\)/u);
  assert.match(setup, /Prepare Lossless FLAC/u);
});
test("Craig info text is GM-only, bounded, and never leaks the Craig secret", async () => {
  const [route, setup] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/craig-info/route.ts"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  assert.match(route, /getCraigRecordingForDownloadJob/u);
  assert.match(route, /\/info\.txt\?key=/u);
  assert.match(route, /redirect: "manual"/u);
  assert.match(route, /count > MAX_INFO_BYTES/u);
  assert.match(route, /cache-control": "no-store"/u);
  assert.doesNotMatch(route, /Response\.json\(\{\s*key\b/u);
  assert.match(setup, /Craig Notes &amp; Info/u);
});

test("no paid inference can run without explicit verified free-only guard", async () => {
 const [route,ui] = await Promise.all([
   read("../app/api/campaigns/[id]/recap-imports/transcribe-short/route.ts"),
   read("../app/campaigns/session-recap-recording-setup.tsx"),
 ]);
 assert.match(route, /RECAP_FREE_AI_QUOTA_VERIFIED/u);
 assert.match(route, /No paid AI usage is permitted/u);
 assert.match(ui, /disabled title="Free-only AI quota protection is not yet configured"/u);
});
