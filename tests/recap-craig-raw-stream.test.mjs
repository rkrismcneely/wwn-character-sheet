import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("raw Craig streaming stays GM-only, key-private and does not buffer audio", async () => {
  const route = await readFile(new URL("../app/api/campaigns/[id]/recap-imports/craig-raw/route.ts", import.meta.url), "utf8");
  assert.match(route, /getCraigRecordingForDownloadJob/u);
  assert.match(route, /raw\.dat\?key=/u);
  assert.match(route, /redirect: "manual"/u);
  assert.match(route, /signal: request\.signal/u);
  assert.match(route, /new Response\(upstream\.body/u);
  assert.match(route, /cache-control": "private, no-store"/u);
  assert.match(route, /\^bytes=\\d\+-/u);
  assert.match(route, /content-range/u);
  assert.doesNotMatch(route, /arrayBuffer\(\)|await upstream\.text\(\)|await upstream\.json\(\)/u);
  assert.doesNotMatch(route, /headers\.set\(.+secret/u);
});
