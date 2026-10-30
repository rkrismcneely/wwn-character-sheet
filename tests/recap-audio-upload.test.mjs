import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("audio ingestion is GM-only, size bounded and not exposed publicly", async () => {
  const [route, service, setup] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/audio/route.ts"),
    read("../lib/campaigns/recap-imports.ts"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  assert.match(route, /canManageCampaignContent/u);
  assert.match(route, /requireActiveCampaign/u);
  assert.match(route, /90 \* 1024 \* 1024/u);
  assert.match(route, /env\.BUCKET\.put\(uploadedKey, request\.body/u);
  assert.match(route, /env\.BUCKET\.delete\(uploadedKey\)/u);
  assert.match(route, /"audio\/mpeg"/u);
  assert.match(route, /"audio\/mp4"/u);
  assert.match(route, /"audio\/wav"/u);
  assert.doesNotMatch(route, /await request\.arrayBuffer\(\)|await request\.formData\(\)/u);
  assert.match(service, /createUploadedRecapRecording/u);
  assert.match(service, /source_reference contains the Craig access key/u);
  assert.match(setup, /Save Audio Recording/u);
  assert.match(setup, /x-recap-date/u);
});
