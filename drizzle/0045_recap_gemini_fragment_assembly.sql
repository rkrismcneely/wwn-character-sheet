-- GM-private, resumable transcript assembly separate from the published recap.
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN assembled_transcript_key TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN assembled_at TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN assembly_cursor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN assembly_lease_token TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN assembly_lease_expires_at TEXT;
CREATE INDEX IF NOT EXISTS campaign_recap_processing_jobs_assembly_idx
  ON campaign_recap_processing_jobs(provider,status,assembled_at,assembly_lease_expires_at);
