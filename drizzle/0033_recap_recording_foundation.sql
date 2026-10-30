-- Phase 1: GM-only recording import queue and reusable speaker identities.
-- Craig access links are private and intentionally excluded from API responses.
CREATE TABLE IF NOT EXISTS campaign_recap_speakers (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  speaker_key TEXT NOT NULL,
  discord_user_id TEXT,
  discord_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('player','gm','guest')),
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  character_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(campaign_id,speaker_key)
);
CREATE INDEX IF NOT EXISTS campaign_recap_speakers_campaign_idx ON campaign_recap_speakers(campaign_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS campaign_recap_recording_imports (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES user(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('craig','upload','drive')),
  source_reference TEXT NOT NULL,
  source_label TEXT NOT NULL,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_speakers' CHECK(status IN ('awaiting_speakers','ready','processing','failed','completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaign_recap_recordings_campaign_idx ON campaign_recap_recording_imports(campaign_id,created_at DESC);

-- Snapshot assignment when a GM confirms each recording; future edits to campaign
-- defaults cannot rewrite the history of an earlier session.
CREATE TABLE IF NOT EXISTS campaign_recap_recording_speakers (
  import_id TEXT NOT NULL REFERENCES campaign_recap_recording_imports(id) ON DELETE CASCADE,
  association_id TEXT,
  discord_user_id TEXT,
  discord_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('player','gm','guest')),
  character_id TEXT,
  character_name TEXT,
  PRIMARY KEY(import_id,discord_name)
);
