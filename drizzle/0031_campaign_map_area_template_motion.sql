-- Opt-in spell area effects; existing templates remain static.
ALTER TABLE `campaign_map_area_templates`
  ADD COLUMN `motion_effect` text NOT NULL DEFAULT 'none'
  CHECK (`motion_effect` IN ('none', 'fire', 'acid', 'sound', 'poison', 'ice', 'lightning', 'darkness'));
