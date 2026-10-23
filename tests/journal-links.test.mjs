import test from "node:test";
import assert from "node:assert/strict";
import {resolveJournalWikilinks} from "../lib/campaigns/journal-links.ts";

const pages=[
 {id:"11111111-1111-4111-8111-111111111111",title:"Lore",sourcePath:"World/Lore.md",parentId:null},
 {id:"22222222-2222-4222-8222-222222222222",title:"People",sourcePath:"World/People.md",parentId:null},
 {id:"33333333-3333-4333-8333-333333333333",title:"Secrets",sourcePath:"World/Secrets.md",parentId:null}
];
test("resolves Obsidian title and folder-path links",()=>{
 const result=resolveJournalWikilinks("[[People|Friends]] and [[World/People]]",pages[0],pages.slice(0,2));
 assert.match(result,/\[Friends\]\(\/journal-page\/22222222/);
 assert.match(result,/\[People\]\(\/journal-page\/22222222/);
});
test("never resolves a page excluded from the visible list",()=>{
 const result=resolveJournalWikilinks("[[Secrets]]",pages[0],pages.slice(0,2));
 assert.equal(result,"[[Secrets]]");
});
test("does not resolve ambiguous titles",()=>{
 const duplicate={...pages[1],id:"44444444-4444-4444-8444-444444444444",sourcePath:"Elsewhere/People.md"};
 assert.equal(resolveJournalWikilinks("[[People]]",pages[0],[...pages.slice(0,2),duplicate]),"[[People]]");
});
