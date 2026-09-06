PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `campaign_items_equipment_new` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL DEFAULT 'mundane',
  `description` text NOT NULL DEFAULT '',
  `properties_json` text NOT NULL DEFAULT '{}',
  `visibility_mode` text NOT NULL DEFAULT 'all',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_items_kind_check` CHECK (`kind` in ('mundane', 'magical', 'weapon', 'armor')),
  CONSTRAINT `campaign_items_visibility_check` CHECK (`visibility_mode` in ('all', 'selected'))
);
--> statement-breakpoint
INSERT INTO `campaign_items_equipment_new`
  (`id`, `campaign_id`, `name`, `kind`, `description`, `properties_json`, `visibility_mode`, `created_at`, `updated_at`)
SELECT `id`, `campaign_id`, `name`, `kind`, `description`, '{}', `visibility_mode`, `created_at`, `updated_at`
FROM `campaign_items`;
--> statement-breakpoint
DROP TABLE `campaign_items`;
--> statement-breakpoint
ALTER TABLE `campaign_items_equipment_new` RENAME TO `campaign_items`;
--> statement-breakpoint
CREATE INDEX `campaign_items_campaign_name_idx` ON `campaign_items` (`campaign_id`, `name`, `updated_at`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
