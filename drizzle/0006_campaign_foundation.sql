-- Additive Phase 4C campaign foundation. This migration creates empty campaign
-- structures only; existing users, characters, ownership, and visibility are untouched.
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CHECK (length(`public_id`) = 26 AND substr(`public_id`, 1, 4) = 'cmp_'),
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_public_id_unique`
  ON `campaigns` (`public_id`);
--> statement-breakpoint
CREATE INDEX `campaigns_owner_updated_idx`
  ON `campaigns` (`owner_user_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `campaign_members` (
	`campaign_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL CHECK (`role` in ('gm', 'player')),
	`joined_at` text NOT NULL,
	PRIMARY KEY (`campaign_id`, `user_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_members_user_joined_idx`
  ON `campaign_members` (`user_id`, `joined_at`);
--> statement-breakpoint
CREATE TABLE `campaign_characters` (
	`campaign_id` text NOT NULL,
	`character_id` text NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY (`campaign_id`, `character_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_characters_character_idx`
  ON `campaign_characters` (`character_id`);
--> statement-breakpoint
CREATE TABLE `campaign_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL CHECK (`role` = 'player'),
	`created_by_user_id` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`accepted_by_user_id` text,
	`revoked_at` text,
	CHECK (length(`token_hash`) = 64 AND `token_hash` NOT GLOB '*[^0-9a-f]*'),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_invites_token_hash_unique`
  ON `campaign_invites` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `campaign_invites_campaign_status_idx`
  ON `campaign_invites` (`campaign_id`, `accepted_at`, `revoked_at`, `expires_at`);
