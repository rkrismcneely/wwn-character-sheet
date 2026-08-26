CREATE TABLE IF NOT EXISTS campaign_npc_templates (
  id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hp_max INTEGER NOT NULL,
  armor_class INTEGER NOT NULL,
  physical_save INTEGER NOT NULL,
  evasion_save INTEGER NOT NULL,
  mental_save INTEGER NOT NULL,
  attacks_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS campaign_npc_templates_campaign_name_idx
  ON campaign_npc_templates(campaign_id, name COLLATE NOCASE, updated_at DESC);
