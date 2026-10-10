ALTER TABLE `campaign_map_area_templates`
  ADD COLUMN `tip_flip` integer NOT NULL DEFAULT 0
  CHECK (`tip_flip` IN (0, 1));
