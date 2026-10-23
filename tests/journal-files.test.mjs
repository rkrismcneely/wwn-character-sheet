import test from "node:test";
import assert from "node:assert/strict";
import {redactJournalSecrets} from "../lib/campaigns/journal.ts";
import {validateJournalFile,verifyJournalFileSignature,journalStorageKey,hasJournalAttachmentReference} from "../lib/campaigns/journal-files.ts";
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

test("only explicit visible Markdown links grant attachment access",()=>{
 const campaign="cmp_abcdefghijklmnopqrstuv";
 const id="22222222-2222-4222-8222-222222222222";
 const url="/api/campaigns/"+campaign+"/journal/files/"+id;
 assert.equal(hasJournalAttachmentReference("![Map]("+url+")",campaign,id),true);
 assert.equal(hasJournalAttachmentReference("[PDF]("+url+")",campaign,id),true);
 assert.equal(hasJournalAttachmentReference("Plain "+url,campaign,id),false);
 assert.equal(hasJournalAttachmentReference("[Other]("+url+"-extra)",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("[External]("+url+"?download=1)",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("![Map]("+url+")",campaign,"33333333-3333-4333-8333-333333333333"),false);
});

test("fenced Markdown code cannot grant player file access",()=>{
 const campaign="cmp_abcdefghijklmnopqrstuv";
 const id="22222222-2222-4222-8222-222222222222";
 const reference="![Map](/api/campaigns/"+campaign+"/journal/files/"+id+")";
 assert.equal(hasJournalAttachmentReference("```md\n"+reference+"\n```",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("~~~md\n"+reference+"\n~~~",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("```md\n"+reference+"\n```\n"+reference,campaign,id),true);
});

test("Markdown links inside GM-only blocks do not authorize players",()=>{
 const campaign="cmp_abcdefghijklmnopqrstuv";
 const id="22222222-2222-4222-8222-222222222222";
 const url="/api/campaigns/"+campaign+"/journal/files/"+id;
 const markdown=["Public","<!-- gm-only:start -->","![Secret]("+url+")","<!-- gm-only:end -->"].join("\n");
 const redacted=redactJournalSecrets(markdown);
 assert.equal(hasJournalAttachmentReference(redacted,campaign,id),false);
});

test("inline code examples never authorize player attachment access",()=>{
 const campaign="cmp_abcdefghijklmnopqrstuv";
 const id="22222222-2222-4222-8222-222222222222";
 const ref="![Map](/api/campaigns/"+campaign+"/journal/files/"+id+")";
 assert.equal(hasJournalAttachmentReference("Example: `"+ref+"`",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("Example: ``"+ref+"``",campaign,id),false);
 assert.equal(hasJournalAttachmentReference("Example: `"+ref+"` then "+ref,campaign,id),true);
});
