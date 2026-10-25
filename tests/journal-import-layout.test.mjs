import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const render=readFileSync(new URL("../app/campaigns/session-recap-markdown.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/campaigns/twe-workspace.css",import.meta.url),"utf8");
test("imported property tables are only enhanced in Journal mode",()=>{
 assert.match(render,/isProperties=journal&&/u);
 assert.match(render,/normalizedHeaders\[0\]==="property"/u);
 assert.match(render,/journal-table-properties/u);
});
test("stat tables recognize standard NPC and monster attributes",()=>{
 assert.match(render,/isStatTable=journal&&/u);
 assert.match(render,/"str","dex","con"/u);
 assert.match(css,/journal-table-stats/u);
});
test("property presentation is scoped to campaign Journal and preserves accessible headers",()=>{
 assert.match(css,/\.campaign-journal .*\.journal-table-properties/u);
 assert.match(css,/journal-table-properties thead/u);
 assert.match(render,/<table><thead><tr>/u);
});
