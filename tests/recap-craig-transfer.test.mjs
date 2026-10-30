import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = p => readFile(new URL(p,import.meta.url),"utf8");
test("Craig archives transfer only after confirmed speaker mapping and verified completed job",async()=>{
 const [route,service,ui]=await Promise.all([
  read("../app/api/campaigns/[id]/recap-imports/craig-transfer/route.ts"),
  read("../lib/campaigns/recap-imports.ts"),
  read("../app/campaigns/session-recap-recording-setup.tsx"),
 ]);
 assert.match(route,/getSessionActor\(request\)/u);
 assert.match(route,/getCraigRecordingForDownloadJob/u);
 assert.match(service,/row\.status !== "ready"/u);
 assert.match(route,/job\.status !== "complete"/u);
 assert.match(route,/job\.options\?\.format !== "flac"/u);
 assert.match(route,/redirect: "manual"/u);
 assert.match(route,/length > MAX_ARCHIVE_BYTES/u);
 assert.match(route,/env\.BUCKET\.put\(key, download\.body/u);
 assert.match(route,/cache-control": "no-store"/u);
 assert.doesNotMatch(route,/Response\.json\(\{[^}]*accessKey/u);
 assert.match(ui,/Save Craig Archive/u);
});