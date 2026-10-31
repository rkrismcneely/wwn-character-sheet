-- A saved recording can exist as a private GM draft before any recap text is written.
-- Existing recaps remain published; only GMs can see draft entries.
ALTER TABLE campaign_session_recaps ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1
  CHECK(is_published IN (0,1));
CREATE INDEX IF NOT EXISTS campaign_session_recaps_published_date_idx
  ON campaign_session_recaps(campaign_id,is_published,session_date DESC,created_at DESC,id DESC);
