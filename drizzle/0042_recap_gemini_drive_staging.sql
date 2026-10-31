-- Upload prepared Gemini speech clips directly to the GM's own Google Drive.
-- Do not list these transient processing files as player-accessible recap audio.
ALTER TABLE campaign_recap_audio_assets ADD COLUMN processing_job_id TEXT REFERENCES campaign_recap_processing_jobs(id) ON DELETE SET NULL;
ALTER TABLE campaign_recap_processing_chunks ADD COLUMN drive_asset_id TEXT REFERENCES campaign_recap_audio_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS campaign_recap_audio_assets_processing_idx
  ON campaign_recap_audio_assets(processing_job_id,storage_owner_user_id,status);
CREATE INDEX IF NOT EXISTS campaign_recap_processing_chunks_asset_idx
  ON campaign_recap_processing_chunks(drive_asset_id);
