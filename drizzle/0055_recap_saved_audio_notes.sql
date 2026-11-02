-- Preserve the original audio understanding separately from the final written recap.
-- Existing jobs retain NULL and continue with legacy behavior.
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN audio_notes TEXT;
