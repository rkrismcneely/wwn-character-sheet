CREATE TABLE `campaign_journal_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL REFERENCES `campaigns`(`id`) ON DELETE cascade,
  `parent_id` text,
  `kind` text DEFAULT 'page' NOT NULL CHECK (`kind` IN ('folder', 'page')),
  `title` text NOT NULL,
  `content` text DEFAULT '' NOT NULL,
  `icon` text DEFAULT 'file-text' NOT NULL,
  `visibility` text DEFAULT 'gm' NOT NULL CHECK (`visibility` IN ('gm', 'players', 'selected')),
  `source` text,
  `source_path` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campaign_journal_campaign_parent_idx` ON `campaign_journal_entries` (`campaign_id`, `parent_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_journal_source_path_idx` ON `campaign_journal_entries` (`campaign_id`, `source`, `source_path`);
--> statement-breakpoint
CREATE TABLE `campaign_journal_readers` (
  `entry_id` text NOT NULL REFERENCES `campaign_journal_entries`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `user`(`id`) ON DELETE cascade,
  PRIMARY KEY (`entry_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `campaign_journal_readers_user_idx` ON `campaign_journal_readers` (`user_id`);
