import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("Journal D1 migrations create consistent entry, sharing, and file relationships",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys = ON");
 db.exec('CREATE TABLE campaigns (id TEXT PRIMARY KEY); CREATE TABLE "user" (id TEXT PRIMARY KEY)');
 const migrationPaths=["drizzle/0003_campaign_journal.sql","drizzle/0004_campaign_journal_files.sql"];
 for(const path of migrationPaths){
  const sql=readFileSync(new URL("../"+path,import.meta.url),"utf8").replace(/--> statement-breakpoint/gu,"");
  db.exec(sql);
 }
 db.prepare("INSERT INTO campaigns(id) VALUES (?)").run("campaign");
 db.prepare('INSERT INTO "user"(id) VALUES (?)').run("player");
 db.prepare("INSERT INTO campaign_journal_entries(id,campaign_id,kind,title,created_at,updated_at) VALUES (?,?,?,?,?,?)")
  .run("page","campaign","page","Notes","2026-10-24T12:00:00.000Z","2026-10-24T12:00:00.000Z");
 db.prepare("INSERT INTO campaign_journal_readers(entry_id,user_id) VALUES (?,?)").run("page","player");
 db.prepare("INSERT INTO campaign_journal_files(id,campaign_id,entry_id,filename,mime_type,byte_size,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run("file","campaign","page","map.png","image/png",100,"journal/file","2026-10-24T12:00:00.000Z");
 assert.equal(db.prepare("SELECT icon FROM campaign_journal_entries WHERE id=?").get("page").icon,"file-text");
 db.prepare("UPDATE campaign_journal_entries SET icon=? WHERE id=?").run("skull","page");
 assert.equal(db.prepare("SELECT icon FROM campaign_journal_entries WHERE id=?").get("page").icon,"skull");
 assert.equal(db.prepare("SELECT count(*) AS n FROM campaign_journal_readers").get().n,1);
 assert.equal(db.prepare("SELECT count(*) AS n FROM campaign_journal_files").get().n,1);
 assert.throws(()=>db.prepare("INSERT INTO campaign_journal_files(id,campaign_id,entry_id,filename,mime_type,byte_size,storage_key,created_at) VALUES (?,?,?,?,?,?,?,?)")
  .run("orphan","campaign","missing","map.png","image/png",100,"journal/orphan","2026-10-24T12:00:00.000Z"));
 db.prepare("DELETE FROM campaign_journal_entries WHERE id=?").run("page");
 assert.equal(db.prepare("SELECT count(*) AS n FROM campaign_journal_readers").get().n,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM campaign_journal_files").get().n,0);
 db.close();
});
