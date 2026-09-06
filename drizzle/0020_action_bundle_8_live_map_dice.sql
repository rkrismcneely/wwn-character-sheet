-- Action Bundle 8: let the GM control authoritative shared-roll dice animation per map.
-- Existing maps default to enabled; each viewer's own Virtual Dice preference still applies.
ALTER TABLE campaign_map_preferences
ADD COLUMN shared_roll_dice_enabled INTEGER NOT NULL DEFAULT 1
CHECK (shared_roll_dice_enabled IN (0, 1));
