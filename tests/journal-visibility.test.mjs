import test from "node:test";
import assert from "node:assert/strict";
import { redactJournalSecrets, visibleJournalEntries } from "../lib/campaigns/journal.ts";

test("hidden parent suppresses its otherwise visible descendants",()=>{
 const entries=[{id:"visible",parentId:null,kind:"folder"},{id:"page",parentId:"hidden",kind:"page"},{id:"child",parentId:"visible",kind:"page"}];
 assert.deepEqual(visibleJournalEntries(entries).map(e=>e.id),["visible","child"]);
});
test("nested pages require a complete chain of visible folders",()=>{
 const entries=[{id:"top",parentId:null,kind:"folder"},{id:"middle",parentId:"top",kind:"folder"},{id:"page",parentId:"middle",kind:"page"}];
 assert.equal(visibleJournalEntries(entries).length,3);
});
test("cycles and non-folder parents are not exposed",()=>{
 const entries=[{id:"a",parentId:"b",kind:"folder"},{id:"b",parentId:"a",kind:"folder"},{id:"bad",parentId:"page",kind:"page"},{id:"page",parentId:null,kind:"page"}];
 assert.deepEqual(visibleJournalEntries(entries).map(e=>e.id),["page"]);
});

test("GM-only Markdown never reaches the player response",()=>{
 const source="Shared\n<!-- gm-only:start -->\nSecret clue\n<!-- gm-only:end -->\nPublic";
 assert.equal(redactJournalSecrets(source),"Shared\n\nPublic");
 assert.equal(redactJournalSecrets("Public\n<!-- gm-only:start -->\nUnclosed secret"),"Public\n");
});
