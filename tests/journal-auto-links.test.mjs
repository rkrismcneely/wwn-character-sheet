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

test("auto-links existing names inside lists, quotes and inline HTML",()=>{
 const current=pages[2];
 const input="- Thomas Morley visited Rotthold.\n> Thomas Morley returned.\n<p>Thomas Morley passed through the harbour.</p>";
 const linked=autoLinkJournalTitles(input,current,pages);
 assert.match(linked,/^- \[Thomas Morley\]\(\/journal-page\//mu);
 assert.match(linked,/Rotthold\]\(\/journal-page\//u);
 assert.match(linked,/<p>Thomas Morley passed through the harbour.<\/p>/u);
});
test("backlinks discover title mentions in imported lists",()=>{
 const target=pages[1];
 const imported={...pages[0],content:"- The expedition stopped in Rotthold."};
 assert.deepEqual(journalBacklinks(target,[target,imported]).map(page=>page.id),[imported.id]);
});


test("existing import text links named NPCs visibly and ignores hidden metadata",()=>{
 const npc={id:"55555555-5555-5555-5555-555555555555",title:"Doolan Tversky",parentId:null,kind:"page",content:""};
 const current={...pages[2],content:""};
 const result=autoLinkJournalTitles("<!-- Doolan Tversky hidden metadata -->\\n**Allegiances:**\\n- Doolan Tversky",current,[current,npc]);
 assert.match(result,/<!-- Doolan Tversky hidden metadata -->/u);
 assert.ok(result.includes("[Doolan Tversky](/journal-page/55555555"));
});
test("Journal internal links have visible underline and keyboard focus styling",async()=>{
 const {readFile}=await import("node:fs/promises");
 const css=await readFile(new URL("../app/campaigns/twe-workspace.css",import.meta.url),"utf8");
 assert.ok(css.includes(".campaign-journal .journal-inline-link{"));
 assert.match(css,/text-decoration:underline/u);
 assert.match(css,/journal-inline-link:focus-visible/u);
});
