-- Existing recap jobs remain manual-only: no historical failed job may be
-- automatically resubmitted merely because new recovery code was deployed.
ALTER TABLE campaign_recap_audio_summary_jobs
  ADD COLUMN auto_retry_opt_in INTEGER NOT NULL DEFAULT 0
  CHECK(auto_retry_opt_in IN (0,1));
