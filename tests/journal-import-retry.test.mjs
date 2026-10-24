import test from "node:test";
import assert from "node:assert/strict";
import {mayLinkImportedAssets} from "../lib/campaigns/journal-import-retry.ts";

test("untouched newly imported and existing pages can receive attachment links",()=>{
 assert.equal(mayLinkImportedAssets("original","original"),true);
});
test("GM edits to old or newly imported pages are preserved",()=>{
 assert.equal(mayLinkImportedAssets("original","GM edit"),false);
});
test("exactly recognized partial imports can resume",()=>{
 assert.equal(mayLinkImportedAssets("original","partially linked","partially linked"),true);
});
test("different or manually edited partial imports never get overwritten",()=>{
 assert.equal(mayLinkImportedAssets("original","GM edit","partially linked"),false);
});
test("an absent partial-import record does not authorize changed content",()=>{
 assert.equal(mayLinkImportedAssets("original","partially linked"),false);
});
