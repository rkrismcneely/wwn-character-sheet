-- Action Bundle 7: structured NPC magic and friendly defaults.
-- Additive defaults preserve every existing NPC as hostile with no spell/art entries.
ALTER TABLE campaign_npc_templates ADD COLUMN spells_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE campaign_npc_templates ADD COLUMN arts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE campaign_npc_templates ADD COLUMN friendly INTEGER NOT NULL DEFAULT 0;
