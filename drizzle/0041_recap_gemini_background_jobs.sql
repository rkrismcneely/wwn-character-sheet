-- Additive queue metadata for GM-owned, resumable Gemini recording jobs.
-- Existing processing jobs remain intact; new fields are nullable for old rows.
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN recap_id TEXT REFERENCES campaign_session_recaps(id) ON DELETE SET NULL;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN provider_connection_id TEXT REFERENCES user_recap_ai_connections(id) ON DELETE SET NULL;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN quota_mode TEXT NOT NULL DEFAULT 'provider-free-only';
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN next_eligible_at TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN paused_at TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN cancelled_at TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN source_manifest_key TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN audio_key TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN audio_mime_type TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN audio_bytes INTEGER;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN source_digest TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN next_eligible_at TEXT;
CREATE INDEX IF NOT EXISTS campaign_recap_processing_jobs_gemini_schedule_idx
  ON campaign_recap_processing_jobs(provider,status,next_eligible_at,updated_at);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_jobs_owner_recap_idx
  ON campaign_recap_processing_jobs(requested_by,recap_id,created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_chunks_eligible_idx
  ON campaign_recap_processing_chunks(status,next_eligible_at,lease_expires_at);
