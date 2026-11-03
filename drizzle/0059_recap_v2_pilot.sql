-- Isolated Recap V2 proof of concept. This NEVER modifies any existing
-- Gemini recap job, audio asset, published Markdown, or transcript.
CREATE TABLE IF NOT EXISTS campaign_recap_v2_pilots (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  recap_id TEXT NOT NULL,
  audio_asset_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN
    ('submitting','complete','provider_error','uncertain','invalid_output')),
  model TEXT NOT NULL DEFAULT 'whisper-large-v3',
  excerpt_end_ms INTEGER NOT NULL CHECK(excerpt_end_ms BETWEEN 20000 AND 121000),
  excerpt_bytes INTEGER NOT NULL CHECK(excerpt_bytes BETWEEN 128 AND 16777216),
  error_code TEXT,
  transcript_key TEXT,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id,recap_id,audio_asset_id,requested_by)
);
CREATE INDEX IF NOT EXISTS idx_recap_v2_pilots_owner
  ON campaign_recap_v2_pilots(requested_by,updated_at);
