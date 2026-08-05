-- Additive compatibility migration for Better Auth 1.6.25's native D1 adapter.
-- The existing verification table uses snake_case columns from the generated Drizzle schema,
-- while the uncustomized runtime addresses these fields as expiresAt/createdAt/updatedAt.
-- Keep the original columns and preserve existing verification rows by backfilling the
-- camelCase compatibility columns.
ALTER TABLE `verification` ADD COLUMN `expiresAt` integer;
--> statement-breakpoint
ALTER TABLE `verification` ADD COLUMN `createdAt` integer;
--> statement-breakpoint
ALTER TABLE `verification` ADD COLUMN `updatedAt` integer;
--> statement-breakpoint
UPDATE `verification`
SET
  `expiresAt` = `expires_at`,
  `createdAt` = `created_at`,
  `updatedAt` = `updated_at`
WHERE `expiresAt` IS NULL
   OR `createdAt` IS NULL
   OR `updatedAt` IS NULL;
