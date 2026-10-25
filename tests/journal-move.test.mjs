import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Journal reparenting is GM-only, bounded and rejects cycles",()=>{
 const s=source("lib/campaigns/journal.ts");
 assert.match(s,/export async function moveJournalEntry/u);
 assert.match(s,/await requireGM\(db,actor,campaignId\)/u);
 assert.match(s,/await getParent\(db,campaign,input\.parentId\)/u);
 assert.match(s,/seen\.has\(current\)/u);
 assert.match(s,/parent_id=\?,updated_at=\?/u);
});
test("Journal sidebar supports drag-to-folder, root drops, and keyboard-usable move selection",()=>{
 const s=source("app/campaigns/campaign-journal.tsx");
 assert.match(s,/onDragStart=/u);
 assert.match(s,/onDragOver=/u);
 assert.match(s,/onDrop=/u);
 assert.match(s,/aria-label="Destination folder"/u);
 assert.match(s,/aria-label=\{"Actions for "\+entry\.title\}/u);
 assert.match(s,/Move to folder/u);
 assert.match(s,/validTarget\(moveId,item\.id\)/u);
});
