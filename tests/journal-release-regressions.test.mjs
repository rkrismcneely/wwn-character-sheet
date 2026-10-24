import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { redactJournalSecrets, atomicJournalMoveSQL } from "../lib/campaigns/journal.ts";
import { journalAttachmentWriteGuard } from "../lib/campaigns/journal-write-guard.ts";
import { removeUnusedJournalFile } from "../lib/campaigns/journal-file-cleanup.ts";
import { markdownTableCells } from "../lib/markdown-table.ts";
import { convertLegendKeeperNative } from "../lib/campaigns/legendkeeper-convert.ts";
import { inventoryObsidianVault } from "../lib/campaigns/journal-import.ts";
import { resolveJournalWikilinks } from "../lib/campaigns/journal-links.ts";

test("nested and unclosed GM blocks never reveal the rest of an outer secret",()=>{
 const start="<!-- gm-only:start -->",end="<!-- gm-only:end -->";
 assert.equal(redactJournalSecrets("Public"+start+"outer"+start+"inner"+end+"still private"+end+"End"),"PublicEnd");
 assert.equal(redactJournalSecrets("Public"+start+"outer"+start+"inner"+end+"still private"),"Public");
 assert.equal(redactJournalSecrets("A<!-- GM-ONLY:START -->private<!-- GM-ONLY:END -->B"),"AB");
});

test("folder move checks the current hierarchy atomically after a competing move",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE campaign_journal_entries(id TEXT PRIMARY KEY,campaign_id TEXT,parent_id TEXT,kind TEXT,updated_at TEXT)");
 for(const id of ["a","b"])db.prepare("INSERT INTO campaign_journal_entries VALUES (?, 'one', NULL, 'folder','old')").run(id);
 const move=(id,parent)=>db.prepare(atomicJournalMoveSQL).run("one",parent,"one",parent,"new","one",id,id,parent,parent);
 assert.equal(move("a","b").changes,1);
 assert.equal(move("b","a").changes,0);
 assert.equal(move("a",null).changes,1);
 db.prepare("INSERT INTO campaign_journal_entries VALUES ('foreign','two',NULL,'folder','old')").run();
 assert.equal(move("a","foreign").changes,0);
 assert.equal(move("a","a").changes,0);
 db.close();
});

function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE campaign_journal_entries(id TEXT PRIMARY KEY,campaign_id TEXT,content TEXT); CREATE TABLE campaign_journal_files(id TEXT PRIMARY KEY,campaign_id TEXT,entry_id TEXT,filename TEXT,mime_type TEXT,byte_size INTEGER,storage_key TEXT,created_at TEXT)");
 const id="11111111-1111-4111-8111-111111111111",publicId="cmp_"+"C".repeat(22);
 db.prepare("INSERT INTO campaign_journal_entries VALUES ('page','one','old')").run();
 db.prepare("INSERT INTO campaign_journal_files VALUES (?,'one','page','map.png','image/png',8,'objects/map','2026-01-01')").run(id);
 const adapter={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)??null;},async run(){const r=db.prepare(sql).run(...values);return {meta:{changes:r.changes}};}};}};
 const content="[Map](/api/campaigns/"+publicId+"/journal/files/"+id+")";
 const save=()=>{
  const guard=journalAttachmentWriteGuard(content,publicId,"one");
  return db.prepare("UPDATE campaign_journal_entries SET content=? WHERE id='page'"+guard.sql).run(content,...guard.bindings);
 };
 return {db,adapter,id,save,content};
}

test("cleanup cannot delete an attachment linked before its atomic claim",async()=>{
 const f=fixture();let touched=false;
 assert.equal(f.save().changes,1);
 assert.equal(await removeUnusedJournalFile(f.adapter,{async get(){touched=true;}},"one",f.id),false);
 assert.equal(touched,false);f.db.close();
});
test("a concurrent save cannot attach a file after cleanup claimed its metadata",async()=>{
 const f=fixture();let saveChanges;
 const bucket={async get(){saveChanges=f.save().changes;return {body:new Uint8Array([1]),httpMetadata:{}};},async put(){},async delete(){}};
 assert.equal(await removeUnusedJournalFile(f.adapter,bucket,"one",f.id),true);
 assert.equal(saveChanges,0);
 assert.equal(f.db.prepare("SELECT content FROM campaign_journal_entries").get().content,"old");
 f.db.close();
});
test("storage failure preserves both upload metadata and the original object",async()=>{
 const f=fixture();let deleted=false;
 const bucket={async get(){return {body:new Uint8Array([1]),httpMetadata:{}};},async put(){throw new Error("storage offline");},async delete(){deleted=true;}};
 await assert.rejects(removeUnusedJournalFile(f.adapter,bucket,"one",f.id),/storage offline/);
 assert.equal(deleted,false);assert.equal(f.save().changes,1);f.db.close();
});
test("attachment existence guard remains bounded with many distinct links",()=>{
 const content=Array.from({length:150},(_,i)=>"[x](/api/campaigns/cmp_"+"C".repeat(22)+"/journal/files/"+i.toString(16).padStart(8,"0")+"-1111-4111-8111-111111111111)").join("\n");
 assert.equal(journalAttachmentWriteGuard(content,"cmp_"+"C".repeat(22),"one").bindings.length,3);
});

test("escaped table pipes stay in the cell instead of discarding later content",()=>{
 assert.deepEqual(markdownTableCells("| Name | A \\| B | Value |"),["Name","A | B","Value"]);
});

test("native multi-page resources have unique paths and stable mention targets",()=>{
 const paragraph=text=>({type:"paragraph",content:[{type:"text",text}]});
 const page=content=>({type:"page",name:"Main",content:{content}});
 const result=convertLegendKeeperNative({version:1,resources:[
  {id:"city",name:"City",documents:[page([paragraph("One")]),page([paragraph("Two")])]},
  {id:"index",name:"Index",documents:[page([{type:"paragraph",content:[{type:"mention",attrs:{id:"city",text:"City"}}]}])]}
 ]});
 assert.equal(new Set(result.notes.map(n=>n.path)).size,3);
 assert.equal(inventoryObsidianVault(result.notes).unresolvedLinks.length,0);
});

test("table wiki links and Markdown export links resolve through visible imported paths",()=>{
 const current={id:"11111111-1111-4111-8111-111111111111",title:"Index",sourcePath:"World/Places/Index.md",parentId:null};
 const other={id:"22222222-2222-4222-8222-222222222222",title:"Guide",sourcePath:"World/People/Guide.md",parentId:null};
 const source="[[World/People/Guide\\|A guide]] and [Guide](../People/Guide.md)";
 assert.equal(inventoryObsidianVault([{path:current.sourcePath,content:source},{path:other.sourcePath,content:""}]).unresolvedLinks.length,0);
 const rendered=resolveJournalWikilinks(source,current,[current,other]);
 assert.equal((rendered.match(/journal-page\/22222222/gu)||[]).length,2);
 assert.equal(resolveJournalWikilinks("[Hidden](../People/Guide.md)",current,[current]),"[Hidden](../People/Guide.md)");
 assert.equal(resolveJournalWikilinks("[Escape](../../../Guide.md)",current,[current,other]),"[Escape](../../../Guide.md)");
});

test("LegendKeeper bare vault-root Markdown links resolve from nested notes",()=>{
 const current={id:"current",title:"NPC",sourcePath:"People/NPC.md",parentId:null};
 const root={id:"root",title:"Town",sourcePath:"Places/My Town.md",parentId:null};
 const notes=[{path:current.sourcePath,content:"[Town](Places/My%20Town.md)"},{path:root.sourcePath,content:""}];
 assert.equal(inventoryObsidianVault(notes).unresolvedLinks.length,0);
 assert.equal(resolveJournalWikilinks(notes[0].content,current,[current,root]),"[Town](/journal-page/root)");
 assert.equal(resolveJournalWikilinks(notes[0].content,current,[current]),notes[0].content);
});
