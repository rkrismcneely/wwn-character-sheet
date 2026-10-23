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

test("does not mistake external or unsafe links for local vault assets",()=>{
 const references=[
  "![remote](https://example.com/map.png)",
  "![remote](//example.com/map.png)",
  "[remote](ftp://example.com/map.png)",
  "![[../assets/map.png]]",
  "![absolute](/Town/assets/map.png)",
  "![encoded](%2E%2E/assets/map.png)"
 ];
 for(const reference of references){
  assert.deepEqual(referencedJournalAssets(reference,"Town/Notes.md",[image]),[],reference);
  assert.equal(replaceJournalAssetLinks(reference,"Town/Notes.md",[image],new Map([[image.path,"/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/11111111-1111-4111-8111-111111111111"]])),reference);
 }
});
test("preserves safe relative paths with a dot-segment",()=>{
 assert.deepEqual(referencedJournalAssets("![[./assets/map.png]]","Town/Notes.md",[image]).map(x=>x.path),[image.path]);
});

test("imports ordinary Obsidian PDF wikilinks without treating note links as files",()=>{
 const source="[[docs/guide.pdf|Read the guide]] and [[Campaign Timeline]]";
 assert.deepEqual(referencedJournalAssets(source,"Town/Notes.md",[image,pdf]).map(asset=>asset.path),[pdf.path]);
 const url="/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/22222222-2222-4222-8222-222222222222";
 assert.equal(replaceJournalAssetLinks(source,"Town/Notes.md",[image,pdf],new Map([[pdf.path,url]])),
  "[Read the guide]("+url+") and [[Campaign Timeline]]");
});

test("code examples never cause attachment uploads or link rewriting",()=>{
 const source=[
  "~~~md",
  "![[assets/map.png]]",
  "~~~",
  "````markdown",
  "[Handout](docs/guide.pdf)",
  "````",
  "Example: `![[assets/map.png]]` and ``[Handout](docs/guide.pdf)``",
  "Actual: ![[assets/map.png]]"
 ].join("\n");
 assert.deepEqual(referencedJournalAssets(source,"Town/Notes.md",[image,pdf]).map(asset=>asset.path),[image.path]);
 const url="/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/11111111-1111-4111-8111-111111111111";
 const expected=source.replace("Actual: ![[assets/map.png]]","Actual: ![map.png]("+url+")");
 assert.equal(replaceJournalAssetLinks(source,"Town/Notes.md",[image,pdf],new Map([[image.path,url]])),expected);
});
test("unclosed fenced code remains untouched",()=>{
 const source="~~~markdown\n![[assets/map.png]]";
 assert.deepEqual(referencedJournalAssets(source,"Town/Notes.md",[image]),[]);
 assert.equal(replaceJournalAssetLinks(source,"Town/Notes.md",[image],new Map([[image.path,"/protected"]])),source);
});

test("Obsidian image dimensions do not replace the imported filename",()=>{
 const url="/api/campaigns/cmp_abcdefghijklmnopqrstuv/journal/files/11111111-1111-4111-8111-111111111111";
 const urls=new Map([[image.path,url]]);
 for(const embed of ["![[assets/map.png|400]]","![[assets/map.png|400x300]]"]){
  assert.equal(replaceJournalAssetLinks(embed,"Town/Notes.md",[image],urls),"![map.png]("+url+")");
 }
 assert.equal(replaceJournalAssetLinks("![[assets/map.png|Town map]]","Town/Notes.md",[image],urls),"![Town map]("+url+")");
});
