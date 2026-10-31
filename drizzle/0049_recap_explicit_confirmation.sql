-- No previously queued recap is authorized by the new per-recording workflow.
-- Only confirmed_at written after the GM clicks Auto Summarize may be processed.
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN confirmed_at TEXT;
CREATE INDEX IF NOT EXISTS campaign_recap_audio_summary_confirmed_idx
  ON campaign_recap_audio_summary_jobs(confirmed_at,status,updated_at);
