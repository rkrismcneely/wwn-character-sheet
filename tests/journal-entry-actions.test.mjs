import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const view=readFileSync(new URL("../app/campaigns/campaign-journal.tsx",import.meta.url),"utf8");
const server=readFileSync(new URL("../lib/campaigns/journal.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/campaigns/[id]/journal/route.ts",import.meta.url),"utf8");
test("Journal row menu offers entry actions and visibility",()=>{
 for(const label of ["Move to folder","Rename","Duplicate","GM only","All players","Delete"])
  assert.ok(view.includes(label),label);
 assert.match(view,/entry\.visibility==="gm".*twe-workspace-entry-lock/u);
});
test("quick visibility changes go through the authenticated Journal PATCH",()=>{
 assert.match(view,/method:"PATCH"/u);
 assert.match(route,/updateJournalEntry\(await getCampaignD1\(\), actor, id/u);
 assert.match(server,/const visibility = input.visibility === undefined \? old.visibility : cleanVisibility\(input.visibility\)/u);
});
test("delete is gated on GM permission, campaign scope, and confirmation",()=>{
 assert.match(view,/window\.confirm\(/u);
 assert.match(route,/body\?\.action==="delete"/u);
 assert.match(server,/export async function deleteJournalEntry/u);
 assert.match(server,/const campaign=await requireGM\(db,actor,campaignId\)/u);
 assert.match(server,/WITH RECURSIVE descendants/u);
});

test("duplicate copies a subtree with new IDs and keeps visibility",()=>{
 assert.match(server,/export async function duplicateJournalEntry/u);
 assert.match(server,/WITH RECURSIVE descendants/u);
 assert.match(server,/const ids=new Map\(entries\.map/u);
 assert.match(server,/entry\.visibility,now,now/u);
 assert.match(route,/body\?\.action==="duplicate"/u);
 assert.match(view,/action:"duplicate"/u);
});
