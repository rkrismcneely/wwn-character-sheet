CREATE TABLE `character_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`player` text DEFAULT '' NOT NULL,
	`class_label` text DEFAULT '' NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
