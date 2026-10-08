-- Extend campaign map annotations with text labels while preserving all existing rows.
-- Colour is stored inside geometry_json so existing reads remain compatible during rollout.
CREATE TABLE `campaign_map_annotations_next` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `map_id` text NOT NULL,
  `kind` text NOT NULL,
  `visibility` text NOT NULL DEFAULT 'players',
  `geometry_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_annotations_kind_check`
    CHECK (`kind` in ('freehand', 'line', 'arrow', 'rect', 'circle', 'text')),
  CONSTRAINT `campaign_map_annotations_visibility_check`
    CHECK (`visibility` in ('players', 'gm'))
);
--> statement-breakpoint
INSERT INTO `campaign_map_annotations_next`
  (`id`, `campaign_id`, `map_id`, `kind`, `visibility`, `geometry_json`, `created_at`)
SELECT `id`, `campaign_id`, `map_id`, `kind`, `visibility`, `geometry_json`, `created_at`
FROM `campaign_map_annotations`;
--> statement-breakpoint
DROP TABLE `campaign_map_annotations`;
--> statement-breakpoint
ALTER TABLE `campaign_map_annotations_next` RENAME TO `campaign_map_annotations`;
--> statement-breakpoint
CREATE INDEX `campaign_map_annotations_map_created_idx`
  ON `campaign_map_annotations` (`map_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `campaign_map_annotations_campaign_map_idx`
  ON `campaign_map_annotations` (`campaign_id`, `map_id`);
