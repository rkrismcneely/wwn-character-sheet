import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
test("Craig metadata checker uses a fixed origin, GM access, and redacted results", async () => {
  const [route, ui] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/craig-check/route.ts"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  assert.match(route, /canManageCampaignContent/u);
  assert.match(route, /loadCampaignAccess/u);
  assert.match(route, /parseCraigRecording/u);
  assert.match(route, /https:\/\/craig\.horse\/api\/v1\/recordings\//u);
  assert.match(route, /AbortSignal\.timeout\(12000\)/u);
  assert.match(route, /cache-control": "no-store"/u);
  assert.doesNotMatch(route, /Response\.json\(\{[^}]*key:/u);
  assert.match(ui, /Check Craig Recording/u);
  assert.match(ui, /Remember this speaker/u);
  assert.match(ui, /Recognized: /u);
});