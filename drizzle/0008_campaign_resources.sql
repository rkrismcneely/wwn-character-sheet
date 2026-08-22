CREATE TABLE IF NOT EXISTS campaign_resources (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT campaign_resources_type_check CHECK (type IN ('text', 'link')),
  CONSTRAINT campaign_resources_title_check CHECK (length(title) BETWEEN 1 AND 120),
  CONSTRAINT campaign_resources_content_check CHECK (length(content) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS campaign_resources_campaign_position_idx
  ON campaign_resources(campaign_id, position, created_at);
