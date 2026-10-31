-- Bound manual verification traffic on owner-funded Worker resources.
-- Does not enable Gemini inference or scheduled provider submissions.
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN source_verify_attempted_at TEXT;
ALTER TABLE campaign_recap_processing_jobs ADD COLUMN source_verified_at TEXT;
