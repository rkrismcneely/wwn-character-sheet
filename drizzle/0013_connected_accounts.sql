-- Additive only: fail closed if pre-existing duplicate identities need review.
CREATE UNIQUE INDEX account_provider_identity_unique ON account (provider_id, account_id);
--> statement-breakpoint
CREATE UNIQUE INDEX account_user_provider_unique ON account (user_id, provider_id);
--> statement-breakpoint
-- Better Auth checks account counts before deletion. This atomic guard also
-- prevents two simultaneous unlink requests from deleting both login methods.
-- A genuine parent-user deletion is not intercepted by this account-only guard.
CREATE TRIGGER account_keep_login_method
BEFORE DELETE ON account
WHEN OLD.provider_id IN ('google', 'discord')
  AND EXISTS (SELECT 1 FROM user WHERE id = OLD.user_id)
  AND NOT EXISTS (
    SELECT 1 FROM account
    WHERE user_id = OLD.user_id AND id <> OLD.id
      AND provider_id IN ('google', 'discord')
  )
BEGIN
  SELECT RAISE(ABORT, 'TWE_LAST_LOGIN_METHOD');
END;
