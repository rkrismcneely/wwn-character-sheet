-- Additive compatibility migration for Better Auth 1.6.25's native D1 adapter.
-- The generated Drizzle schema uses snake_case physical columns, while the
-- uncustomized runtime addresses Better Auth model fields in camelCase.
-- Keep original columns and backfill runtime-compatible columns.

ALTER TABLE `user` ADD COLUMN `emailVerified` integer;
--> statement-breakpoint
ALTER TABLE `user` ADD COLUMN `createdAt` integer;
--> statement-breakpoint
ALTER TABLE `user` ADD COLUMN `updatedAt` integer;
--> statement-breakpoint
UPDATE `user` SET `emailVerified`=`email_verified`, `createdAt`=`created_at`, `updatedAt`=`updated_at`
WHERE `emailVerified` IS NULL OR `createdAt` IS NULL OR `updatedAt` IS NULL;
--> statement-breakpoint

ALTER TABLE `session` ADD COLUMN `expiresAt` integer;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `createdAt` integer;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `updatedAt` integer;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `ipAddress` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `userAgent` text;
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `userId` text;
--> statement-breakpoint
UPDATE `session` SET `expiresAt`=`expires_at`, `createdAt`=`created_at`, `updatedAt`=`updated_at`, `ipAddress`=`ip_address`, `userAgent`=`user_agent`, `userId`=`user_id`
WHERE `expiresAt` IS NULL OR `createdAt` IS NULL OR `updatedAt` IS NULL OR `userId` IS NULL;
--> statement-breakpoint

ALTER TABLE `account` ADD COLUMN `accountId` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `providerId` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `userId` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `accessToken` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `refreshToken` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `idToken` text;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `accessTokenExpiresAt` integer;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `refreshTokenExpiresAt` integer;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `createdAt` integer;
--> statement-breakpoint
ALTER TABLE `account` ADD COLUMN `updatedAt` integer;
--> statement-breakpoint
UPDATE `account` SET `accountId`=`account_id`, `providerId`=`provider_id`, `userId`=`user_id`, `accessToken`=`access_token`, `refreshToken`=`refresh_token`, `idToken`=`id_token`, `accessTokenExpiresAt`=`access_token_expires_at`, `refreshTokenExpiresAt`=`refresh_token_expires_at`, `createdAt`=`created_at`, `updatedAt`=`updated_at`
WHERE `accountId` IS NULL OR `providerId` IS NULL OR `userId` IS NULL OR `createdAt` IS NULL OR `updatedAt` IS NULL;
--> statement-breakpoint

ALTER TABLE `verification` ADD COLUMN `expiresAt` integer;
--> statement-breakpoint
ALTER TABLE `verification` ADD COLUMN `createdAt` integer;
--> statement-breakpoint
ALTER TABLE `verification` ADD COLUMN `updatedAt` integer;
--> statement-breakpoint
UPDATE `verification` SET `expiresAt`=`expires_at`, `createdAt`=`created_at`, `updatedAt`=`updated_at`
WHERE `expiresAt` IS NULL OR `createdAt` IS NULL OR `updatedAt` IS NULL;
