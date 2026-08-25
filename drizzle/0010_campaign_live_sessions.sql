CREATE TABLE IF NOT EXISTS campaign_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  started_by_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  ended_by_user_id TEXT REFERENCES user(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_sessions_one_active_idx
  ON campaign_sessions(campaign_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS campaign_sessions_campaign_started_idx
  ON campaign_sessions(campaign_id, started_at DESC);

CREATE TABLE IF NOT EXISTS campaign_session_participants (
  session_id TEXT NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_session_participants_user_idx
  ON campaign_session_participants(user_id);
