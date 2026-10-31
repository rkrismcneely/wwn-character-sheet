-- Native Gemini audio recaps, independently consented to by each GM.
-- Only the GM's own Drive asset is linked; no site-owned audio blob.
CREATE TABLE IF NOT EXISTS user_recap_auto_preferences (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK(auto_enabled IN (0,1)),
  billing_approved INTEGER NOT NULL DEFAULT 0 CHECK(billing_approved IN (0,1)),
  detail TEXT NOT NULL DEFAULT 'detailed' CHECK(detail IN ('brief','standard','detailed')),
  consent_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_recap_audio_summary_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recap_id TEXT NOT NULL REFERENCES campaign_session_recaps(id) ON DELETE CASCADE,
  audio_asset_id TEXT NOT NULL REFERENCES campaign_recap_audio_assets(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_upload'
    CHECK(status IN ('pending_upload','transferring','uploaded','submitting','submitted','ready','failed','needs_attention')),
  detail TEXT NOT NULL CHECK(detail IN ('brief','standard','detailed')),
  model TEXT NOT NULL,
  file_uri TEXT,
  file_name TEXT,
  interaction_id TEXT,
  generated_markdown TEXT,
  error_code TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(audio_asset_id)
);
CREATE INDEX IF NOT EXISTS campaign_recap_audio_summary_jobs_schedule_idx
  ON campaign_recap_audio_summary_jobs(status,updated_at,created_at);
CREATE INDEX IF NOT EXISTS campaign_recap_audio_summary_jobs_owner_idx
  ON campaign_recap_audio_summary_jobs(requested_by,recap_id,created_at DESC);
