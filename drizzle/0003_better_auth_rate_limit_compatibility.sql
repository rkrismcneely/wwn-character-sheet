-- Additive compatibility migration for Better Auth 1.6.25's native D1 rate-limit adapter.
-- The existing migration created rate_limit/last_request from the generated Drizzle schema,
-- while the uncustomized runtime adapter addresses its default model as rateLimit/lastRequest.
-- Preserve any existing local rows while providing the runtime's expected table and field names.
CREATE TABLE IF NOT EXISTS `rateLimit` (
  `id` text PRIMARY KEY NOT NULL,
  `key` text NOT NULL,
  `count` integer NOT NULL,
  `lastRequest` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `rateLimit_key_unique`
  ON `rateLimit` (`key`);
--> statement-breakpoint
INSERT OR IGNORE INTO `rateLimit` (`id`, `key`, `count`, `lastRequest`)
SELECT `id`, `key`, `count`, `last_request`
FROM `rate_limit`;
