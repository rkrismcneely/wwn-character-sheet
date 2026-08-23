-- Phase 4D: non-destructive character and campaign lifecycle state.
-- NULL means active so every existing row remains active without a backfill.
ALTER TABLE characters ADD COLUMN archived_at TEXT;
ALTER TABLE campaigns ADD COLUMN archived_at TEXT;

CREATE INDEX characters_owner_archive_updated_idx
  ON characters (owner_user_id, archived_at, updated_at);
CREATE INDEX campaigns_owner_archive_updated_idx
  ON campaigns (owner_user_id, archived_at, updated_at);
