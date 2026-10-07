-- Map drawing/annotation v1 stores immutable vector annotations in map-space
-- coordinates. GM-only rows never leave the server for player requests.
CREATE TABLE `campaign_map_annotations` (
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
    CHECK (`kind` in ('freehand', 'line', 'arrow', 'rect', 'circle')),
  CONSTRAINT `campaign_map_annotations_visibility_check`
    CHECK (`visibility` in ('players', 'gm'))
);
--> statement-breakpoint
CREATE INDEX `campaign_map_annotations_map_created_idx`
  ON `campaign_map_annotations` (`map_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `campaign_map_annotations_campaign_map_idx`
  ON `campaign_map_annotations` (`campaign_id`, `map_id`);
