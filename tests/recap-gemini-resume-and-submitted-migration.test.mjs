import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("D1 chunk CHECK rebuild retains all existing columns and admits provider-submitted interaction IDs",async()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE campaigns(id TEXT PRIMARY KEY);
      CREATE TABLE campaign_recap_recording_imports(id TEXT PRIMARY KEY);
      CREATE TABLE user(id TEXT PRIMARY KEY);
      CREATE TABLE campaign_session_recaps(id TEXT PRIMARY KEY);
      CREATE TABLE user_recap_ai_connections(id TEXT PRIMARY KEY);
      CREATE TABLE campaign_recap_audio_assets(
        id TEXT PRIMARY KEY,storage_owner_user_id TEXT,status TEXT
      );
      INSERT INTO campaigns VALUES ('camp');
      INSERT INTO campaign_recap_recording_imports VALUES ('import');
      INSERT INTO user VALUES ('gm');
      INSERT INTO campaign_session_recaps VALUES ('recap');
      INSERT INTO user_recap_ai_connections VALUES ('ai');
      INSERT INTO campaign_recap_audio_assets(id,storage_owner_user_id,status)
        VALUES('asset','gm','ready');
    `);
    for(const file of ["../drizzle/0034_recap_processing_jobs.sql",
      "../drizzle/0041_recap_gemini_background_jobs.sql",
      "../drizzle/0042_recap_gemini_drive_staging.sql",
      "../drizzle/0044_recap_gemini_interaction_polls.sql",
      "../drizzle/0045_recap_gemini_fragment_assembly.sql"]){
      db.exec(await read(file));
    }
    db.exec(`INSERT INTO campaign_recap_processing_jobs (
      id,campaign_id,import_id,requested_by,source_lane,status,provider,recap_id,
      provider_connection_id,quota_mode,speaker_tracks,total_chunks,created_at,updated_at
    ) VALUES('job','camp','import','gm','craig-multitrack','queued','gemini','recap',
      'ai','provider-free-only',2,2,'2026-10-30','2026-10-30');`);
    db.exec(`INSERT INTO campaign_recap_processing_chunks (
      job_id,track_index,chunk_index,start_ms,end_ms,status,attempts,updated_at,
      audio_key,audio_mime_type,audio_bytes,source_digest,drive_asset_id
    ) VALUES('job',0,0,0,10000,'pending',0,'2026-10-30',
      'drive-asset/asset','audio/wav',320044,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','asset');`);
    db.exec(`INSERT INTO campaign_recap_processing_chunks (
      job_id,track_index,chunk_index,start_ms,end_ms,status,attempts,updated_at,
      transcript_key
    ) VALUES('job',1,0,10000,20000,'completed',1,'2026-10-30',
      'recap-transcript-chunks/camp/job/1-0.json');`);
    const original=db.prepare("SELECT * FROM campaign_recap_processing_chunks ORDER BY track_index")
      .all().map(row=>({...row}));
    const migration=await read("../drizzle/0046_recap_gemini_submitted_state.sql");
    db.exec(migration);
    const updated=db.prepare("SELECT * FROM campaign_recap_processing_chunks ORDER BY track_index")
      .all().map(row=>({...row}));
    assert.deepEqual(updated,original);
    db.exec(`UPDATE campaign_recap_processing_chunks
      SET status='submitted',provider_interaction_id='interaction_123456',
      provider_submitted_at='2026-10-30',provider_poll_after='2026-10-31'
      WHERE job_id='job' AND track_index=0 AND chunk_index=0;`);
    assert.equal(db.prepare("SELECT status FROM campaign_recap_processing_chunks WHERE track_index=0")
      .get().status,"submitted");
    assert.throws(()=>db.exec("UPDATE campaign_recap_processing_chunks SET provider_interaction_id=NULL WHERE track_index=0"),/CHECK constraint/u);
    assert.equal(db.prepare("SELECT status FROM campaign_recap_processing_chunks WHERE track_index=1").get().status,"completed");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'campaign_recap_processing_chunks_%'").all().map(row=>row.name);
    for(const index of ["campaign_recap_processing_chunks_work_idx",
      "campaign_recap_processing_chunks_eligible_idx",
      "campaign_recap_processing_chunks_asset_idx",
      "campaign_recap_processing_chunks_provider_poll_idx"]){
      assert.ok(indexes.includes(index),index+" must survive the constraint rebuild");
    }
  }finally{db.close();}
});
test("Gemini account status returns owner-scoped saved jobs and safe detailed chunk counters",async()=>{
  const [route,ui,schema]=await Promise.all([
    read("../app/api/campaigns/[id]/session-recaps/background-gemini/route.ts"),
    read("../app/campaigns/session-recap-gemini-drive-staging.tsx"),
    read("../db/schema.ts"),
  ]);
  assert.match(route,/AND requested_by=\? ORDER BY created_at DESC LIMIT 20/u);
  assert.match(route,/\.bind\(campaign\.id,recap\.id,actor\.userId\)/u);
  assert.match(route,/j\.requested_by=\?/u);
  for(const name of ["importId:row.importId","pending:","leased:","submitted:",
    "completed:","failed:","skipped:","backgroundEnabled:false"]){
    assert.ok(route.includes(name),"Missing safe job status field "+name);
  }
  assert.doesNotMatch(route,/key_ciphertext AS|remote_file_id AS|source_reference AS|apiKey:/u);
  assert.match(schema,/enum: \["pending", "leased", "submitted", "completed", "failed", "skipped"\]/u);
  for(const required of ["setSavedJobs","setJob(restored)","setImportId(restored.importId)",
    "setStaged(chunkData)","Resume a saved Gemini job","readableState(job)",
    "Submitted to Gemini:","Processing:","Pause job","Resume job","Cancel job",
    "window.setInterval","window.clearInterval","changeJobState",
    'method:"PATCH"',"Refresh progress"]){
    assert.ok(ui.includes(required),"Missing resume/status control: "+required);
  }
  assert.match(ui,/60_000/u);
  assert.match(ui,/job\.pausedAt/u);
  assert.match(ui,/window\.confirm/u);
  assert.doesNotMatch(ui,/localStorage|sessionStorage/u);
});
