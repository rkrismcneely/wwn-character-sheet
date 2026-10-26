import test from "node:test";
import assert from "node:assert/strict";
import { redactJournalSecrets, visibleJournalEntries, conditionalJournalContentUpdateSQL } from "../lib/campaigns/journal.ts";
import { DatabaseSync } from "node:sqlite";

test("hidden parent suppresses its otherwise visible descendants",()=>{
 const entries=[{id:"visible",parentId:null,kind:"folder"},{id:"page",parentId:"hidden",kind:"page"},{id:"child",parentId:"visible",kind:"page"}];
 assert.deepEqual(visibleJournalEntries(entries).map(e=>e.id),["visible","child"]);
});
test("nested pages require a complete chain of visible folders",()=>{
 const entries=[{id:"top",parentId:null,kind:"folder"},{id:"middle",parentId:"top",kind:"folder"},{id:"page",parentId:"middle",kind:"page"}];
 assert.equal(visibleJournalEntries(entries).length,3);
});
test("cycles are hidden, but pages can nest beneath visible location articles",()=>{
 const entries=[{id:"a",parentId:"b",kind:"folder"},{id:"b",parentId:"a",kind:"folder"},{id:"bad",parentId:"page",kind:"page"},{id:"page",parentId:null,kind:"page"}];
 assert.deepEqual(visibleJournalEntries(entries).map(e=>e.id),["bad","page"]);
});

test("a child article cannot be exposed when its location article is hidden",()=>{
 const entries=[{id:"locations",parentId:null,kind:"folder",visibility:"players"},{id:"town",parentId:"locations",kind:"page",visibility:"gm"},{id:"store",parentId:"town",kind:"page",visibility:"players"}];
 assert.deepEqual(visibleJournalEntries(entries.filter(e=>e.visibility==="players")).map(e=>e.id),["locations"]);
});

test("GM-only Markdown never reaches the player response",()=>{
 const source="Shared\n<!-- gm-only:start -->\nSecret clue\n<!-- gm-only:end -->\nPublic";
 assert.equal(redactJournalSecrets(source),"Shared\n\nPublic");
 assert.equal(redactJournalSecrets("Public\n<!-- gm-only:start -->\nUnclosed secret"),"Public\n");
});

test("selected-player page cannot bypass a hidden parent folder",()=>{
 const rows=[
  {id:"public-folder",parentId:null,kind:"folder",visibility:"players"},
  {id:"private-folder",parentId:null,kind:"folder",visibility:"gm"},
  {id:"selected-page",parentId:"private-folder",kind:"page",visibility:"selected"},
  {id:"public-page",parentId:"public-folder",kind:"page",visibility:"players"}
 ];
 const playerVisible=rows.filter(row=>row.visibility==="players"||row.id==="selected-page");
 assert.deepEqual(visibleJournalEntries(playerVisible).map(row=>row.id),["public-folder","public-page"]);
});
test("selected-player page is visible when all ancestor folders are shared",()=>{
 const rows=[
  {id:"shared-folder",parentId:null,kind:"folder",visibility:"players"},
  {id:"selected-page",parentId:"shared-folder",kind:"page",visibility:"selected"}
 ];
 assert.deepEqual(visibleJournalEntries(rows).map(row=>row.id),["shared-folder","selected-page"]);
});


test("attachment update changes content without resetting modified metadata",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE campaign_journal_entries (id TEXT, campaign_id TEXT, kind TEXT, title TEXT, content TEXT, visibility TEXT, updated_at TEXT)");
 const first="2026-10-24T12:00:00.000Z",second="2026-10-24T12:00:01.000Z";
 db.prepare("INSERT INTO campaign_journal_entries VALUES (?,?,?,?,?,?,?)").run("page","campaign","page","Original","unchanged","gm",first);
 // The GM changes sharing settings and title while the import is uploading.
 db.prepare("UPDATE campaign_journal_entries SET title=?,visibility=?,updated_at=? WHERE id=?").run("Edited by GM","players",second,"page");
 const stale=db.prepare(conditionalJournalContentUpdateSQL).run("linked",second,"campaign","page","unchanged",first);
 assert.equal(stale.changes,0);
 const current=db.prepare("SELECT * FROM campaign_journal_entries WHERE id='page'").get();
 assert.equal(current.title,"Edited by GM");
 assert.equal(current.visibility,"players");
 assert.equal(current.content,"unchanged");
 const ok=db.prepare(conditionalJournalContentUpdateSQL).run("linked","2026-10-24T12:00:02.000Z","campaign","page","unchanged",second);
 assert.equal(ok.changes,1);
 const saved=db.prepare("SELECT * FROM campaign_journal_entries WHERE id='page'").get();
 assert.equal(saved.title,"Edited by GM");
 assert.equal(saved.visibility,"players");
 assert.equal(saved.content,"linked");
 db.close();
});
