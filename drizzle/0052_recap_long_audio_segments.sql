-- Add a resumable, opt-in-by-recording segmented path for long Gemini recaps.
-- Older single-file jobs retain their original behavior and data.
ALTER TABLE campaign_recap_audio_summary_jobs
  ADD COLUMN processing_mode TEXT NOT NULL DEFAULT 'single'
  CHECK(processing_mode IN ('single','segmented'));

CREATE TABLE campaign_recap_audio_summary_segments (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES campaign_recap_audio_summary_jobs(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  source_start INTEGER NOT NULL,
  source_end INTEGER NOT NULL,
  prefix_base64 TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK(status IN ('pending_upload','transferring','uploaded','submitting','submitted','ready','needs_attention')),
  file_uri TEXT,
  file_name TEXT,
  interaction_id TEXT,
  notes TEXT,
  stage_url_ciphertext TEXT,
  stage_url_nonce TEXT,
  stage_url_version INTEGER,
  stage_offset INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(job_id,segment_index),
  CHECK(segment_index>=0 AND end_ms>start_ms AND source_end>source_start)
);
CREATE INDEX campaign_recap_summary_segments_job_idx
  ON campaign_recap_audio_summary_segments(job_id,segment_index,status);
