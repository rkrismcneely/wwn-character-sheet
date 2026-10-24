import test from "node:test";
import assert from "node:assert/strict";
import { JOURNAL_PAGE_ICONS, DEFAULT_JOURNAL_PAGE_ICON, journalPageIcon, validateJournalPageIcon } from "../lib/campaigns/journal-icons.ts";

test("article icon catalog includes the exact twelve agreed page categories",()=>{
 assert.deepEqual(JOURNAL_PAGE_ICONS.map(item=>item.id),[
  "castle","user-round","skull","sparkles","sword",
  "map-pin","landmark","scroll-text","book-open","map","calendar-days","file-text"
 ]);
 assert.equal(new Set(JOURNAL_PAGE_ICONS.map(item=>item.id)).size,12);
});
test("missing and obsolete page icons default safely",()=>{
 assert.equal(journalPageIcon(null),DEFAULT_JOURNAL_PAGE_ICON);
 assert.equal(journalPageIcon(undefined),"file-text");
 assert.equal(journalPageIcon("unknown"),"file-text");
});
test("every catalog icon is accepted and arbitrary names are rejected",()=>{
 for(const item of JOURNAL_PAGE_ICONS)assert.equal(validateJournalPageIcon(item.id),item.id);
 assert.throws(()=>validateJournalPageIcon("script"));
 assert.throws(()=>validateJournalPageIcon(123));
});
