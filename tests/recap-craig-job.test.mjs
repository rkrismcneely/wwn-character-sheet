import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
test("Craig conversion job is restricted to GMs and does not reveal access keys or output paths", async () => {
 const [route, service, ui] = await Promise.all([
  read("../app/api/campaigns/[id]/recap-imports/craig-job/route.ts"),
  read("../lib/campaigns/recap-imports.ts"),
  read("../app/campaigns/session-recap-recording-setup.tsx"),
 ]);
 assert.match(service,/getCraigRecordingForDownloadJob/u);
 assert.match(service,/gmAccess\(db, actor, campaignId, true\)/u);
 assert.match(service,/row\.status !== "ready"/u);
 assert.match(route,/https:\/\/craig\.horse\/api\/v1\/recordings\//u);
 assert.match(route,/JSON\.stringify\(\{ type: "recording", options: \{ format: "flac" \} \}\)/u);
 assert.match(route,/outputReady/u);
 assert.match(route,/AbortSignal\.timeout\(12000\)/u);
 assert.doesNotMatch(route,/Response\.json\(\{[^\n]*outputFileName/u);
 assert.match(ui,/Prepare Craig Audio/u);
 assert.match(ui,/Check Job/u);
});