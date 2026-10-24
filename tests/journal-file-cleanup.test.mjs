import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { staleJournalFileCandidatesSQL, staleUnreferencedJournalFileSQL, deleteStaleUnreferencedJournalFileSQL, deleteUnreferencedJournalFileSQL, journalCleanupCutoff } from "../lib/campaigns/journal-file-cleanup.ts";

test("stale attachment cleanup protects references across all campaign pages",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE campaign_journal_files (id TEXT PRIMARY KEY,campaign_id TEXT,created_at TEXT,storage_key TEXT); CREATE TABLE campaign_journal_entries (id TEXT PRIMARY KEY,campaign_id TEXT,content TEXT)");
 const old="2026-10-20T00:00:00.000Z",recent="2026-10-23T12:00:00.000Z",cutoff=journalCleanupCutoff(Date.parse("2026-10-23T18:00:00.000Z"));
 const add=(id,campaign,time)=>db.prepare("INSERT INTO campaign_journal_files VALUES (?,?,?,?)").run(id,campaign,time,"key/"+id);
 add("orphan","one",old);add("linked","one",old);add("fresh","one",recent);add("other","two",old);
 db.prepare("INSERT INTO campaign_journal_entries VALUES (?,?,?)").run("page","one","See /files/linked for the map");
 assert.deepEqual(db.prepare(staleJournalFileCandidatesSQL).all("one",cutoff).map(row=>row.id),["orphan"]);
 assert.equal(db.prepare(staleUnreferencedJournalFileSQL).get("one","linked",cutoff),undefined);
 assert.equal(db.prepare(staleUnreferencedJournalFileSQL).get("one","orphan",cutoff).storageKey,"key/orphan");
 assert.equal(db.prepare(deleteStaleUnreferencedJournalFileSQL).run("one","linked",cutoff,"one").changes,0);
 assert.equal(db.prepare(deleteStaleUnreferencedJournalFileSQL).run("one","fresh",cutoff,"one").changes,0);
 assert.equal(db.prepare(deleteStaleUnreferencedJournalFileSQL).run("one","orphan",cutoff,"one").changes,1);
 assert.equal(db.prepare(deleteUnreferencedJournalFileSQL).run("two","other","two","other").changes,1);
 assert.equal(db.prepare("SELECT count(*) AS count FROM campaign_journal_files WHERE id='linked'").get().count,1);
 db.close();
});
test("cleanup cutoff gives new uploads a 24-hour grace period",()=>{
 assert.equal(journalCleanupCutoff(Date.parse("2026-10-23T18:00:00.000Z")),"2026-10-22T18:00:00.000Z");
});
