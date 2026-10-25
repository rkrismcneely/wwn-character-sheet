import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {redactJournalSecrets} from "../lib/campaigns/journal.ts";
import {journalSecretMarkersBalanced} from "../lib/campaigns/journal-editor-format.ts";
const editor=readFileSync(new URL("../app/campaigns/journal-visual-editor.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/campaigns/journal-editor.css",import.meta.url),"utf8");
test("GM dividers wrap editable blocks using the same protected secret node",()=>{
 assert.match(editor,/GM dividers \(start\/end\)/u);
 assert.match(editor,/wrapIn\("journalSecret"\)/u);
 assert.match(css,/GM ONLY · START/u);
 assert.match(css,/GM ONLY · END/u);
});
test("paired markers redact all intervening paragraphs from player content",()=>{
 const text="Visible before\n<!-- gm-only:start -->\n### Secret\nAn NPC is a traitor.\n\nA hidden quest.\n<!-- gm-only:end -->\nVisible after";
 assert.equal(journalSecretMarkersBalanced(text),true);
 assert.equal(redactJournalSecrets(text),"Visible before\n\nVisible after");
});
test("unclosed GM start hides all following text from players",()=>{
 assert.equal(redactJournalSecrets("Public\n<!-- gm-only:start -->\nSecret\nMore secret"),"Public\n");
});
