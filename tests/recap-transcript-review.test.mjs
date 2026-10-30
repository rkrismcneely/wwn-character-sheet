import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("GM recording setup supports a bounded timestamped transcript review", async () => {
 const ui = await readFile(new URL("../app/campaigns/session-recap-recording-setup.tsx", import.meta.url), "utf8");
 assert.match(ui, /Review Transcript/u);
 assert.match(ui, /recap-imports\/transcript\?importId=/u);
 assert.match(ui, /speakerName/u);
 assert.match(ui, /characterName/u);
 assert.match(ui, /transcriptTime\(segment.startMs\)/u);
 assert.match(ui, /slice\(0, 250\)/u);
 assert.match(ui, /Close Transcript/u);
});
