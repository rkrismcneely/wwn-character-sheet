-- Save Gemini interaction IDs before polling so a slow API response is NOT
-- treated as permission to resubmit a possibly billable audio clip.
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN provider_interaction_id TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN provider_submitted_at TEXT;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN provider_poll_after TEXT;
CREATE INDEX IF NOT EXISTS campaign_recap_processing_chunks_provider_poll_idx
 ON campaign_recap_processing_chunks(status,provider_poll_after);
