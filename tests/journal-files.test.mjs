import test from "node:test";
import assert from "node:assert/strict";
import {validateJournalFile} from "../lib/campaigns/journal-files.ts";
test("accepts a bounded PNG",()=>{
 assert.deepEqual(validateJournalFile("portrait.png","image/png",100),{filename:"portrait.png",mime:"image/png",size:100});
});
test("rejects unsupported types and MIME mismatches",()=>{
 assert.throws(()=>validateJournalFile("script.svg","image/svg+xml",100));
 assert.throws(()=>validateJournalFile("portrait.png","text/html",100));
});
test("rejects oversized and unsafe names",()=>{
 assert.throws(()=>validateJournalFile("../portrait.png","image/png",100));
 assert.throws(()=>validateJournalFile("portrait.png","image/png",8_000_001));
});
