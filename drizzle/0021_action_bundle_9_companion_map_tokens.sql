-- Action Bundle 9: allow independently placed companion tokens while preserving existing token positions and sizes.
CREATE TABLE `campaign_map_tokens_next` (
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
  CONSTRAINT `campaign_map_tokens_kind_check` CHECK (`kind` in ('pc', 'npc', 'companion'))
);
--> statement-breakpoint
INSERT INTO `campaign_map_tokens_next`
  (`id`, `campaign_id`, `map_id`, `kind`, `source_id`, `name`, `x`, `y`, `version`, `created_at`, `updated_at`)
SELECT `id`, `campaign_id`, `map_id`, `kind`, `source_id`, `name`, `x`, `y`, `version`, `created_at`, `updated_at`
FROM `campaign_map_tokens`;
--> statement-breakpoint
CREATE TABLE `campaign_map_token_sizes_next` (
  `token_id` text PRIMARY KEY NOT NULL,
  `map_id` text NOT NULL,
  `campaign_id` text NOT NULL,
  `size_cells` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`token_id`) REFERENCES `campaign_map_tokens_next`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`map_id`) REFERENCES `campaign_maps`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_map_token_sizes_size_check` CHECK (`size_cells` >= 1 and `size_cells` <= 12)
);
--> statement-breakpoint
INSERT INTO `campaign_map_token_sizes_next`
  (`token_id`, `map_id`, `campaign_id`, `size_cells`, `updated_at`)
SELECT `token_id`, `map_id`, `campaign_id`, `size_cells`, `updated_at`
FROM `campaign_map_token_sizes`;
--> statement-breakpoint
DROP TABLE `campaign_map_token_sizes`;
--> statement-breakpoint
DROP TABLE `campaign_map_tokens`;
--> statement-breakpoint
ALTER TABLE `campaign_map_tokens_next` RENAME TO `campaign_map_tokens`;
--> statement-breakpoint
ALTER TABLE `campaign_map_token_sizes_next` RENAME TO `campaign_map_token_sizes`;
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_map_tokens_source_unique` ON `campaign_map_tokens` (`map_id`, `kind`, `source_id`);
--> statement-breakpoint
CREATE INDEX `campaign_map_tokens_map_idx` ON `campaign_map_tokens` (`map_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `campaign_map_token_sizes_map_idx` ON `campaign_map_token_sizes` (`map_id`, `token_id`);
