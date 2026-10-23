import test from "node:test";
import assert from "node:assert/strict";
import {validateJournalFile,verifyJournalFileSignature,journalStorageKey} from "../lib/campaigns/journal-files.ts";
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

test("rejects disguised image payloads",()=>{
 assert.equal(verifyJournalFileSignature("image/png",new TextEncoder().encode("<html>")),false);
 assert.equal(verifyJournalFileSignature("image/png",Uint8Array.from([137,80,78,71,13,10,26,10])),true);
});

test("uses campaign-scoped opaque storage keys",()=>{
 const key=journalStorageKey("11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222");
 assert.equal(key,"campaign-journal/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222");
 assert.throws(()=>journalStorageKey("../unsafe","22222222-2222-4222-8222-222222222222"));
});
