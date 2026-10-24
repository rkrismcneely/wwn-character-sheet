import test from "node:test";
import assert from "node:assert/strict";
import { JOURNAL_PAGE_ICONS, DEFAULT_JOURNAL_PAGE_ICON, journalPageIcon, validateJournalPageIcon } from "../lib/campaigns/journal-icons.ts";

test("article icon catalog contains the original 12 and all 48 additional choices",()=>{
 assert.deepEqual(JOURNAL_PAGE_ICONS.map(item=>item.id),[
  "castle",
  "user-round",
  "skull",
  "sparkles",
  "sword",
  "map-pin",
  "landmark",
  "scroll-text",
  "book-open",
  "map",
  "calendar-days",
  "file-text",
  "shield",
  "crown",
  "users",
  "church",
  "mountain",
  "trees",
  "house",
  "coins",
  "gem",
  "flask-conical",
  "book-marked",
  "compass",
  "ship",
  "tent",
  "key-round",
  "flag",
  "swords",
  "shield-alert",
  "ghost",
  "paw-print",
  "footprints",
  "scroll",
  "handshake",
  "land-plot",
  "route",
  "waves",
  "sun",
  "moon",
  "hourglass",
  "calendar-clock",
  "package",
  "hammer",
  "pickaxe",
  "axe",
  "shield-check",
  "wand-sparkles",
  "eye",
  "lock-keyhole",
  "message-circle",
  "scale",
  "warehouse",
  "anchor",
  "flame",
  "snowflake",
  "leaf",
  "bone",
  "dices",
  "bookmark",
 ]);
 assert.equal(new Set(JOURNAL_PAGE_ICONS.map(item=>item.id)).size,60);
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
