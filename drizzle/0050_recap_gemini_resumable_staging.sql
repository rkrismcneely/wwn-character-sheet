-- Keep Gemini resumable staging state privately for long GM-owned audio.
-- Session URLs are encrypted at rest; transfer offset is nonsecret metadata.
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN stage_url_ciphertext TEXT;
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN stage_url_nonce TEXT;
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN stage_url_version INTEGER;
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN stage_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_recap_audio_summary_jobs ADD COLUMN stage_error_code TEXT;
