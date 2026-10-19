-- Durable, GM-edited session summaries visible to all authorized campaign members.
CREATE TABLE IF NOT EXISTS campaign_session_recaps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT session_recap_title_check CHECK (length(title) BETWEEN 1 AND 120),
  CONSTRAINT session_recap_content_check CHECK (length(content) BETWEEN 1 AND 30000)
);
CREATE INDEX IF NOT EXISTS campaign_session_recaps_date_idx
  ON campaign_session_recaps(campaign_id, session_date DESC, created_at DESC, id DESC);
