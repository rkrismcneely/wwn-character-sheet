import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const view=readFileSync(new URL("../app/campaigns/campaign-journal.tsx",import.meta.url),"utf8");
const service=readFileSync(new URL("../lib/campaigns/journal.ts",import.meta.url),"utf8");
test("Journal folder visibility preferences are keyed by authenticated user and campaign",()=>{
 assert.match(service,/viewerId: actor!\.userId/u);
 assert.match(view,/twe-journal:"\+viewerId\+":"\+campaignId/u);
 assert.match(view,/preferenceKey\+"collapsed"/u);
 assert.match(view,/setCollapsedFolders\(new Set\(folders\)\)/u);
});
test("Stored preferences are restored before first writeback",()=>{
 assert.match(view,/loadedPreferencesKey!==preferenceKey\)return/u);
 assert.match(view,/setLoadedPreferencesKey\(preferenceKey\)/u);
});
test("Journal sidebar open state is independently retained",()=>{
 assert.match(view,/preferenceKey\+"sidebar-open"/u);
 assert.match(view,/setSidebarOpen\(open\)/u);
});
