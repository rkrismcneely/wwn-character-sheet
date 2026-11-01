import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const section = readFileSync(new URL("../lib/campaigns/recap-long-audio-runner.ts", import.meta.url), "utf8");
const summary = readFileSync(new URL("../lib/campaigns/recap-only-runner.ts", import.meta.url), "utf8");

test("long-audio section notes preserve important late events and combat resources", () => {
  assert.match(section, /including its very end/);
  assert.match(section, /damage, spells, consumables and other resources spent/);
  assert.match(section, /compress earlier descriptions instead/);
});

test("both recap paths target dense complete coverage instead of longer recaps", () => {
  assert.match(summary, /600–900/);
  assert.match(summary, /1200–1800/);
  assert.match(summary, /2000–3000/);
  assert.match(summary, /entire recording/i);
  assert.match(summary, /EVERY supplied section/);
  assert.match(summary, /compress prose rather than deleting events/);
  assert.match(summary, /ALWAYS include these five exact headings/);
  assert.match(summary, /None noted/);
});
