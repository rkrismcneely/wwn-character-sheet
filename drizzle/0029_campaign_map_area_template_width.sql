ALTER TABLE `campaign_map_area_templates`
  ADD COLUMN `width_spaces` integer NOT NULL DEFAULT 1
  CHECK (`width_spaces` between 1 and 60);
