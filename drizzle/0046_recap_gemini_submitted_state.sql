-- Preserve existing Gemini audio jobs while admitting provider submissions.
-- SQLite CHECK constraints cannot be changed via ALTER COLUMN.
-- Build replacement BEFORE dropping the old child table; no tables reference
-- campaign_recap_processing_chunks as a parent.
CREATE TABLE campaign_recap_processing_chunks_next (
  job_id TEXT NOT NULL REFERENCES campaign_recap_processing_jobs(id) ON DELETE CASCADE,
  track_index INTEGER NOT NULL CHECK(track_index>=0 AND track_index<128),
  chunk_index INTEGER NOT NULL CHECK(chunk_index>=0 AND chunk_index<2880),
  start_ms INTEGER NOT NULL CHECK(start_ms>=0),
  end_ms INTEGER NOT NULL CHECK(end_ms>start_ms AND end_ms<=28800000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','leased','submitted','completed','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=25),
  lease_token TEXT,
  lease_expires_at TEXT,
  transcript_key TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL,
  audio_key TEXT,
  audio_mime_type TEXT,
  audio_bytes INTEGER,
  source_digest TEXT,
  next_eligible_at TEXT,
  drive_asset_id TEXT REFERENCES campaign_recap_audio_assets(id) ON DELETE SET NULL,
  provider_interaction_id TEXT,
  provider_submitted_at TEXT,
  provider_poll_after TEXT,
  PRIMARY KEY(job_id,track_index,chunk_index),
  CHECK(status!='completed' OR transcript_key IS NOT NULL),
  CHECK(status!='submitted' OR provider_interaction_id IS NOT NULL)
);
INSERT INTO campaign_recap_processing_chunks_next (
  job_id,track_index,chunk_index,start_ms,end_ms,status,attempts,
  lease_token,lease_expires_at,transcript_key,error_code,updated_at,
  audio_key,audio_mime_type,audio_bytes,source_digest,next_eligible_at,
  drive_asset_id,provider_interaction_id,provider_submitted_at,provider_poll_after
) SELECT
  job_id,track_index,chunk_index,start_ms,end_ms,status,attempts,
  lease_token,lease_expires_at,transcript_key,error_code,updated_at,
  audio_key,audio_mime_type,audio_bytes,source_digest,next_eligible_at,
  drive_asset_id,provider_interaction_id,provider_submitted_at,provider_poll_after
FROM campaign_recap_processing_chunks;
DROP TABLE campaign_recap_processing_chunks;
ALTER TABLE campaign_recap_processing_chunks_next RENAME TO campaign_recap_processing_chunks;
CREATE INDEX campaign_recap_processing_chunks_work_idx
  ON campaign_recap_processing_chunks(job_id,status,track_index,chunk_index);
CREATE INDEX campaign_recap_processing_chunks_eligible_idx
  ON campaign_recap_processing_chunks(status,next_eligible_at,lease_expires_at);
CREATE INDEX campaign_recap_processing_chunks_asset_idx
  ON campaign_recap_processing_chunks(drive_asset_id);
CREATE INDEX campaign_recap_processing_chunks_provider_poll_idx
  ON campaign_recap_processing_chunks(status,provider_poll_after);
