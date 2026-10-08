CREATE TABLE `campaign_map_area_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `map_id` text NOT NULL,
  `creator_user_id` text NOT NULL,
  `shape` text NOT NULL,
  `x` real NOT NULL,
  `y` real NOT NULL,
  `size_spaces` integer NOT NULL,
  `angle_degrees` real NOT NULL DEFAULT 0,
  `color` text NOT NULL DEFAULT '#c084fc',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_area_templates_shape_check`
    CHECK (`shape` in ('radius', 'cube', 'cone', 'line')),
  CONSTRAINT `campaign_map_area_templates_size_check`
    CHECK (`size_spaces` between 1 and 60)
);
--> statement-breakpoint
CREATE INDEX `campaign_map_area_templates_map_created_idx`
  ON `campaign_map_area_templates` (`map_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `campaign_map_area_templates_creator_idx`
  ON `campaign_map_area_templates` (`campaign_id`, `creator_user_id`);
