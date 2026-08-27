-- Phase 5C.7: nullable, additive threat fields for reusable campaign NPCs.
-- Existing templates and their serialized attack snapshots are preserved intact.
ALTER TABLE campaign_npc_templates ADD COLUMN hit_dice INTEGER;
ALTER TABLE campaign_npc_templates ADD COLUMN attacks_per_main_action INTEGER;
