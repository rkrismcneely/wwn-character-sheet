import assert from "node:assert/strict";
import test from "node:test";
import { autoLinkJournalTitles, journalBacklinks } from "../lib/campaigns/journal-auto-links.ts";
const pages=[
 {id:"11111111-1111-1111-1111-111111111111",title:"Thomas Morley",parentId:null,kind:"page",content:"Thomas Morley sailed to Rotthold."},
 {id:"22222222-2222-2222-2222-222222222222",title:"Rotthold",parentId:null,kind:"page",content:"A port city."},
 {id:"33333333-3333-3333-3333-333333333333",title:"Journal",parentId:null,kind:"page",content:"Rotthold is in danger."},
];
test("title links respect word boundaries, existing links, code, and headings",()=>{
 const result=autoLinkJournalTitles("Thomas Morley and Rotthold. Rotthold!\n# Rotthold\n\x60Rotthold\x60\n[Rotthold](https://example.com)",pages[2],pages);
 assert.match(result,/\[Thomas Morley\]\(\/journal-page\/11111111/u);
 assert.match(result,/\[Rotthold\]\(\/journal-page\/22222222/u);
 assert.match(result,/# Rotthold/u);
 assert.match(result,/\x60Rotthold\x60/u);
 assert.match(result,/\[Rotthold\]\(https:\/\/example.com\)/u);
 assert.equal((result.match(/\/journal-page\/22222222/g)||[]).length,1);
});
test("backlinks include only accessible supplied article pages",()=>{
 const result=journalBacklinks(pages[1],pages);
 assert.deepEqual(result.map(page=>page.title),["Thomas Morley","Journal"]);
});
test("ambiguous titles and self references are not linked",()=>{
 const duplicate={...pages[1],id:"44444444-4444-4444-4444-444444444444"};
 assert.equal(autoLinkJournalTitles("Rotthold",pages[0],[pages[0],pages[1],duplicate]),"Rotthold");
});
