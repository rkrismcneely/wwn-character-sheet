import assert from "node:assert/strict";import { readFile } from "node:fs/promises";import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
test("short-track AI transcription enforces opt-in size speaker and transcript checks", async () => {
 const [route,setup,wrangler] = await Promise.all([
 read("../app/api/campaigns/[id]/recap-imports/transcribe-short/route.ts"),
 read("../app/campaigns/session-recap-recording-setup.tsx"),
 read("../wrangler.jsonc"),
 ]);
 assert.match(wrangler, /"ai": \{ "binding": "AI" \}/u);
 assert.match(route, /getCraigRecordingForDownloadJob/u);
 assert.match(route, /MAX_SAMPLE_BYTES = 2 \* 1024 \* 1024/u);
 assert.match(route, /recap-track-speakers\//u);
 assert.match(route, /whisper-large-v3-turbo/u);
 assert.match(route, /normalizeTranscriptSegments/u);
 assert.match(route, /transcript unchanged/u);
 assert.match(setup, /window\.confirm\(/u);
 assert.match(setup, /Transcribe Short Track \(AI\)/u);
});