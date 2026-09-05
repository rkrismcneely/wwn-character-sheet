CREATE TABLE `campaign_items` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL DEFAULT 'mundane',
  `description` text NOT NULL DEFAULT '',
  `visibility_mode` text NOT NULL DEFAULT 'all',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_items_kind_check` CHECK (`kind` in ('mundane', 'magical')),
  CONSTRAINT `campaign_items_visibility_check` CHECK (`visibility_mode` in ('all', 'selected'))
);
--> statement-breakpoint
CREATE INDEX `campaign_items_campaign_name_idx` ON `campaign_items` (`campaign_id`, `name`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `campaign_item_characters` (
  `campaign_item_id` text NOT NULL,
  `character_id` text NOT NULL,
  PRIMARY KEY (`campaign_item_id`, `character_id`),
  FOREIGN KEY (`campaign_item_id`) REFERENCES `campaign_items`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_item_characters_character_idx` ON `campaign_item_characters` (`character_id`, `campaign_item_id`);
