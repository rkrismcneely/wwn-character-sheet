CREATE TABLE `campaign_map_preferences` (
  `map_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `snap_enabled` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_preferences_snap_enabled_check` CHECK (`snap_enabled` in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `campaign_map_preferences_campaign_idx` ON `campaign_map_preferences` (`campaign_id`, `map_id`);
--> statement-breakpoint
CREATE TABLE `campaign_map_token_sizes` (
  `token_id` text PRIMARY KEY NOT NULL,
  `map_id` text NOT NULL,
  `campaign_id` text NOT NULL,
  `size_cells` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`token_id`) REFERENCES `campaign_map_tokens`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_token_sizes_size_check` CHECK (`size_cells` >= 1 and `size_cells` <= 12)
);
--> statement-breakpoint
CREATE INDEX `campaign_map_token_sizes_map_idx` ON `campaign_map_token_sizes` (`map_id`, `token_id`);
