import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOURNAL_PAGE_ICONS } from "../lib/campaigns/journal-icons.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("every journal icon in the catalog has exactly one Lucide drawing",()=>{
 const source=read("app/campaigns/journal-page-icon.tsx");
 const ids=[...source.matchAll(/^ "([a-z0-9-]+)":<>/gmu)].map(match=>match[1]);
 assert.equal(ids.length,60);
 assert.deepEqual([...ids].sort(),JOURNAL_PAGE_ICONS.map(entry=>entry.id).sort());
 assert.equal(new Set(ids).size,60);
 assert.match(source,/strokeWidth="2"/u);
});
test("journal editor exposes search, selection, and article icon display",()=>{
 const source=read("app/campaigns/campaign-journal.tsx");
 assert.match(source,/aria-label="Search page icons"/u);
 assert.match(source,/JOURNAL_PAGE_ICONS\.filter\(/u);
 assert.match(source,/aria-pressed=\{draft\.icon===option\.id\}/u);
 assert.match(source,/setDraft\(\{\.\.\.draft,icon:option\.id\}\)/u);
 assert.match(source,/JournalPageIconView icon=\{entry\.icon\}/u);
 assert.match(source,/JournalPageIconView icon=\{current\.icon\}/u);
 assert.match(source,/setIconSearch\("“?""?\)/u);
});
test("journal icon picker has bounded scrolling and narrow-screen layout",()=>{
 const css=read("app/campaigns/twe-workspace.css");
 assert.match(css,/\.twe-workspace-icon-picker\{max-height:295px;overflow-y:auto/u);
 assert.match(css,/@media\(max-width:620px\)\{\.twe-workspace-icon-picker/u);
});
