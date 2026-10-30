-- GM-owned cloud accounts and stable recap audio references.
-- No tokens are created or connected by this migration.
CREATE TABLE IF NOT EXISTS user_recap_storage_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('google-drive', 'dropbox', 'onedrive')),
  display_name TEXT NOT NULL DEFAULT '',
  granted_scopes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK(status IN ('disconnected', 'connected', 'reconnect_required')),
  -- Server-only encrypted OAuth envelope. Never return in APIs or browser state.
  credential_ciphertext TEXT,
  credential_nonce TEXT,
  credential_version INTEGER,
  connected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, user_id),
  CHECK(status != 'connected' OR
    (credential_ciphertext IS NOT NULL AND credential_nonce IS NOT NULL AND credential_version IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS user_recap_storage_connections_owner_idx
  ON user_recap_storage_connections(user_id, provider);

CREATE TABLE IF NOT EXISTS campaign_recap_audio_assets (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recap_id TEXT REFERENCES campaign_session_recaps(id) ON DELETE SET NULL,
  recording_import_id TEXT REFERENCES campaign_recap_recording_imports(id) ON DELETE SET NULL,
  connection_id TEXT NOT NULL,
  storage_owner_user_id TEXT NOT NULL,
  remote_file_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  mime_type TEXT,
  byte_size INTEGER CHECK(byte_size IS NULL OR (byte_size >= 0 AND byte_size <= 1099511627776)),
  duration_ms INTEGER CHECK(duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 28800000)),
  track_index INTEGER NOT NULL DEFAULT 0 CHECK(track_index >= 0 AND track_index < 128),
  offset_ms INTEGER NOT NULL DEFAULT 0 CHECK(offset_ms BETWEEN -28800000 AND 28800000),
  primary_audio INTEGER NOT NULL DEFAULT 0 CHECK(primary_audio IN (0,1)),
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK(status IN ('preparing', 'ready', 'auth_required', 'unavailable')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(connection_id, storage_owner_user_id)
    REFERENCES user_recap_storage_connections(id, user_id) ON DELETE RESTRICT,
  CHECK(status != 'ready' OR (remote_file_id IS NOT NULL AND length(remote_file_id) BETWEEN 1 AND 1024)),
  CHECK(length(label) <= 160)
);
CREATE INDEX IF NOT EXISTS campaign_recap_audio_assets_recap_idx
  ON campaign_recap_audio_assets(campaign_id, recap_id, primary_audio DESC, created_at);
CREATE INDEX IF NOT EXISTS campaign_recap_audio_assets_connection_idx
  ON campaign_recap_audio_assets(connection_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recap_audio_assets_one_primary_idx
  ON campaign_recap_audio_assets(recap_id) WHERE recap_id IS NOT NULL AND primary_audio = 1;

-- Prevent associating an audio file with a recap in another campaign.
CREATE TRIGGER IF NOT EXISTS campaign_recap_audio_assets_recap_insert_check
  BEFORE INSERT ON campaign_recap_audio_assets WHEN NEW.recap_id IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Recap belongs to another campaign')
    WHERE NOT EXISTS (SELECT 1 FROM campaign_session_recaps
      WHERE id = NEW.recap_id AND campaign_id = NEW.campaign_id);
  END;
CREATE TRIGGER IF NOT EXISTS campaign_recap_audio_assets_recap_update_check
  BEFORE UPDATE OF campaign_id, recap_id ON campaign_recap_audio_assets WHEN NEW.recap_id IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Recap belongs to another campaign')
    WHERE NOT EXISTS (SELECT 1 FROM campaign_session_recaps
      WHERE id = NEW.recap_id AND campaign_id = NEW.campaign_id);
  END;
