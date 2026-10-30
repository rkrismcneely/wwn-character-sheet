-- Session Recap v2: authoritative, resumable jobs for multi-hour recordings.
-- No legacy tables are altered or dropped.
CREATE TABLE IF NOT EXISTS campaign_recap_processing_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  import_id TEXT NOT NULL REFERENCES campaign_recap_recording_imports(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES user(id),
  source_lane TEXT NOT NULL CHECK(source_lane IN ('craig-multitrack','audio-upload','timed-captions')),
  status TEXT NOT NULL DEFAULT 'awaiting_source'
    CHECK(status IN ('awaiting_source','queued','preparing','transcribing','assembling','awaiting_review','completed','failed','cancelled')),
  provider TEXT NOT NULL DEFAULT 'none',
  duration_ms INTEGER CHECK(duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 28800000)),
  speaker_tracks INTEGER CHECK(speaker_tracks IS NULL OR (speaker_tracks >= 1 AND speaker_tracks <= 32)),
  total_chunks INTEGER NOT NULL DEFAULT 0 CHECK(total_chunks >= 0),
  completed_chunks INTEGER NOT NULL DEFAULT 0 CHECK(completed_chunks >= 0),
  failed_chunks INTEGER NOT NULL DEFAULT 0 CHECK(failed_chunks >= 0),
  max_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK(max_cost_microusd >= 0),
  spent_cost_microusd INTEGER NOT NULL DEFAULT 0 CHECK(spent_cost_microusd >= 0),
  source_checked_at TEXT,
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(import_id),
  CHECK(completed_chunks + failed_chunks <= total_chunks)
);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_jobs_campaign_idx
  ON campaign_recap_processing_jobs(campaign_id,created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_jobs_status_idx
  ON campaign_recap_processing_jobs(status,updated_at);

-- Every fragment has a durable identity and lease for idempotent attempts.
-- Audio and transcript blobs live in private R2 under server-generated keys.
CREATE TABLE IF NOT EXISTS campaign_recap_processing_chunks (
  job_id TEXT NOT NULL REFERENCES campaign_recap_processing_jobs(id) ON DELETE CASCADE,
  track_index INTEGER NOT NULL CHECK(track_index >= 0 AND track_index < 128),
  chunk_index INTEGER NOT NULL CHECK(chunk_index >= 0 AND chunk_index < 2880),
  start_ms INTEGER NOT NULL CHECK(start_ms >= 0),
  end_ms INTEGER NOT NULL CHECK(end_ms > start_ms AND end_ms <= 28800000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','leased','completed','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 25),
  lease_token TEXT,
  lease_expires_at TEXT,
  transcript_key TEXT,
  error_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(job_id,track_index,chunk_index),
  CHECK(status != 'completed' OR transcript_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_chunks_work_idx
  ON campaign_recap_processing_chunks(job_id,status,track_index,chunk_index);
