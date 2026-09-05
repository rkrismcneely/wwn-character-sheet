-- Action Bundle 13: campaign-item snapshots on NPC templates.
-- Additive default preserves every existing NPC with an empty inventory.
ALTER TABLE campaign_npc_templates ADD COLUMN inventory_json TEXT NOT NULL DEFAULT '[]';
