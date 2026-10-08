-- Record annotation ownership for player-safe editing.
-- Existing annotations remain unowned and therefore editable only by campaign managers/admins.
ALTER TABLE `campaign_map_annotations` ADD COLUMN `creator_user_id` text;
--> statement-breakpoint
CREATE INDEX `campaign_map_annotations_creator_idx`
  ON `campaign_map_annotations` (`campaign_id`, `creator_user_id`);
