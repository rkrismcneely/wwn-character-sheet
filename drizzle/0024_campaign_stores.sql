CREATE TABLE `campaign_stores` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `is_active` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `campaign_stores_active_check` CHECK (`is_active` IN (0, 1)),
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_stores_campaign_updated_idx`
  ON `campaign_stores` (`campaign_id`, `updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_stores_one_active_per_campaign_idx`
  ON `campaign_stores` (`campaign_id`) WHERE `is_active` = 1;
--> statement-breakpoint
CREATE TABLE `campaign_store_items` (
  `id` text PRIMARY KEY NOT NULL,
  `store_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_item_id` text,
  `name` text NOT NULL,
  `kind` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `details` text NOT NULL DEFAULT '',
  `properties_json` text NOT NULL DEFAULT '{}',
  `cost` text NOT NULL,
  `quantity` integer,
  `shop_note` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `campaign_store_items_source_check` CHECK (`source_type` IN ('srd', 'campaign')),
  CONSTRAINT `campaign_store_items_quantity_check` CHECK (`quantity` IS NULL OR `quantity` >= 0),
  FOREIGN KEY (`store_id`) REFERENCES `campaign_stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_store_items_store_name_idx`
  ON `campaign_store_items` (`store_id`, `name`);
