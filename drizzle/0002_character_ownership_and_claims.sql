-- Additive Phase 4B application migration. Existing character rows and JSON are
-- preserved verbatim. Ownership remains nullable until an explicit claim.
ALTER TABLE `characters`
  ADD COLUMN `owner_user_id` text REFERENCES `user`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `characters` ADD COLUMN `public_id` text;
--> statement-breakpoint
ALTER TABLE `characters`
  ADD COLUMN `visibility` text DEFAULT 'private' NOT NULL
  CHECK (`visibility` in ('private', 'unlisted', 'public'));
--> statement-breakpoint
ALTER TABLE `characters` ADD COLUMN `portrait_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_public_id_unique`
  ON `characters` (`public_id`);
--> statement-breakpoint
CREATE INDEX `characters_owner_updated_idx`
  ON `characters` (`owner_user_id`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `characters_visibility_updated_idx`
  ON `characters` (`visibility`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `legacy_character_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_at` text,
	`claimed_by_user_id` text,
	`revoked_at` text,
	FOREIGN KEY (`claimed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_character_claims_token_hash_unique`
  ON `legacy_character_claims` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `legacy_character_claims_status_idx`
  ON `legacy_character_claims` (`claimed_at`, `revoked_at`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `legacy_character_claim_items` (
	`claim_id` text NOT NULL,
	`character_id` text NOT NULL,
	PRIMARY KEY(`claim_id`, `character_id`),
	FOREIGN KEY (`claim_id`) REFERENCES `legacy_character_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legacy_character_claim_items_character_idx`
  ON `legacy_character_claim_items` (`character_id`);
