import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("multi-hour D1 schema is additive, leased and safe against duplicate chunk commits", async () => {
  const [sql, schema] = await Promise.all([
    read("../drizzle/0034_recap_processing_jobs.sql"),
    read("../db/schema.ts"),
  ]);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS campaign_recap_processing_jobs/u);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS campaign_recap_processing_chunks/u);
  assert.match(sql, /UNIQUE\(import_id\)/u);
  assert.match(sql, /PRIMARY KEY\(job_id,track_index,chunk_index\)/u);
  assert.match(sql, /lease_token TEXT/u);
  assert.match(sql, /max_cost_microusd/u);
  assert.match(sql, /CHECK\(status != 'completed' OR transcript_key IS NOT NULL\)/u);
  assert.match(sql, /REFERENCES campaign_recap_recording_imports\(id\) ON DELETE CASCADE/u);
  assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE|DELETE FROM/u);
  assert.match(schema, /campaignRecapProcessingJobs/u);
  assert.match(schema, /campaignRecapProcessingChunks/u);
});
test("production migration verifies D1 database and precedes Worker deploy", async () => {
  const [migration, workflow] = await Promise.all([
    read("../scripts/migrate-recap-processing.mjs"),
    read("../.github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(migration,/DATABASE_ID/u);
  assert.match(migration,/0034_recap_processing_jobs\.sql/u);
  assert.match(migration,/0033_recap_recording_foundation\.sql/u);
  assert.match(migration,/d1_migrations/u);
  assert.match(workflow,/node scripts\/migrate-recap-processing\.mjs/u);
  assert.ok(workflow.indexOf("Apply and verify recap processing D1 migration")
    < workflow.indexOf("Deploy production Worker"));
});
