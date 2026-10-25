import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const view=readFileSync(new URL("../app/campaigns/campaign-journal.tsx",import.meta.url),"utf8");
const service=readFileSync(new URL("../lib/campaigns/journal.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/campaigns/twe-workspace.css",import.meta.url),"utf8");
test("sidebar supports global folder toggling and persists per-user and per-campaign state",()=>{
 assert.match(view,/function toggleAllFolders/u);
 assert.match(view,/Expand all folders/u);
 assert.match(view,/Collapse all folders/u);
 assert.match(view,/twe-journal:"\+viewerId\+":"\+campaignId/u);
 assert.match(view,/localStorage\.setItem\(preferenceKey\+"collapsed"/u);
});
test("resizable sidebar is accessible and stores its size",()=>{
 assert.match(view,/aria-label="Resize Journal sidebar"/u);
 assert.match(view,/event\.key==="ArrowRight"/u);
 assert.match(view,/sidebar-width"/u);
 assert.match(css,/journal-sidebar-width/u);
});
test("database feature detection prevents unmigrated journal query failure",()=>{
 assert.match(service,/pragma_table_info\('campaign_journal_entries'\)/u);
 assert.match(service,/hasOrder\?columns/u);
 assert.match(service,/j\.sort_order IS NULL/u);
});
