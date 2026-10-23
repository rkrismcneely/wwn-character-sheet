import test from "node:test";
import assert from "node:assert/strict";
import { referencedJournalAssets, replaceJournalAssetLinks } from "../lib/campaigns/journal-asset-links.ts";

const image={path:"Town/assets/map.png",filename:"map.png",mime:"image/png",bytes:new Uint8Array([137,80,78,71,13,10,26,10])};
const pdf={path:"Town/docs/guide.pdf",filename:"guide.pdf",mime:"application/pdf",bytes:new Uint8Array([37,80,68,70,45])};
test("resolves Obsidian embeds and relative Markdown attachment paths",()=>{
 const source="![[assets/map.png]] and [Handout](docs/guide.pdf)";
 assert.deepEqual(referencedJournalAssets(source,"Town/Notes.md",[image,pdf]).map(a=>a.path),[image.path,pdf.path]);
 const urls=new Map([[image.path,"/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/11111111-1111-4111-8111-111111111111"],[pdf.path,"/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/22222222-2222-4222-8222-222222222222"]]);
 const text=replaceJournalAssetLinks(source,"Town/Notes.md",[image,pdf],urls);
 assert.match(text,/!\[map.png\]\(\/api\/campaigns\//u);
 assert.match(text,/\[Handout\]\(\/api\/campaigns\//u);
});
test("ignores nonexistent and ambiguous attachments",()=>{
 const source="![[map.png]]";
 const duplicate={...image,path:"Other/map.png"};
 assert.equal(referencedJournalAssets(source,"Elsewhere/Notes.md",[image,duplicate]).length,0);
 assert.equal(replaceJournalAssetLinks(source,"Elsewhere/Notes.md",[image,duplicate],new Map()),source);
});
