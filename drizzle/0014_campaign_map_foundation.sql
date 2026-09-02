CREATE TABLE `campaign_maps` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `name` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT 0,
  `background_key` text,
  `background_content_type` text,
  `background_width` integer,
  `background_height` integer,
  `grid_enabled` integer NOT NULL DEFAULT 0,
  `grid_size` real NOT NULL DEFAULT 64,
  `grid_offset_x` real NOT NULL DEFAULT 0,
  `grid_offset_y` real NOT NULL DEFAULT 0,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_maps_active_check` CHECK (`is_active` in (0, 1)),
  CONSTRAINT `campaign_maps_grid_enabled_check` CHECK (`grid_enabled` in (0, 1)),
  CONSTRAINT `campaign_maps_grid_size_check` CHECK (`grid_size` >= 8 and `grid_size` <= 512)
);
--> statement-breakpoint
CREATE INDEX `campaign_maps_campaign_idx` ON `campaign_maps` (`campaign_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_maps_one_active` ON `campaign_maps` (`campaign_id`) WHERE `is_active` = 1;
--> statement-breakpoint
CREATE TABLE `campaign_map_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `map_id` text NOT NULL,
  `kind` text NOT NULL,
  `source_id` text NOT NULL,
  `name` text NOT NULL,
  `x` real NOT NULL,
  `y` real NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_tokens_kind_check` CHECK (`kind` in ('pc', 'npc'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_map_tokens_source_unique` ON `campaign_map_tokens` (`map_id`, `kind`, `source_id`);
--> statement-breakpoint
CREATE INDEX `campaign_map_tokens_map_idx` ON `campaign_map_tokens` (`map_id`, `created_at`);
