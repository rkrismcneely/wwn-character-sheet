# Discord sign-in and connected accounts

## Reviewed implementation

Better Auth stays pinned to **1.6.25**. Reviewed official version-tagged documentation:

- https://github.com/better-auth/better-auth/blob/v1.6.25/docs/content/docs/concepts/users-accounts.mdx
- https://github.com/better-auth/better-auth/blob/v1.6.25/docs/content/docs/authentication/discord.mdx
- https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/api/routes/callback.ts
- https://github.com/better-auth/better-auth/blob/v1.6.25/packages/better-auth/src/oauth2/link-account.ts
- https://docs.discord.com/developers/topics/oauth2

The installed callback, state, provider, linking and unlinking implementation was also inspected and is exercised by `tests/discord-auth.test.mjs`. The public documentation currently covers a newer release; the versioned source is authoritative for this integration.

## Canonical identity and email policy

- Existing `user.id` is canonical. Provider accounts reference it; character ownership, campaign ownership/membership, display-name settings, and admin role are never transferred or rewritten.
- Explicit Account → Connect uses Better Auth `linkSocial`. `disableImplicitLinking: true` blocks same-email implicit linking for both providers, even when email is verified or the provider is trusted.
- `trustedProviders: ["discord"]` exists ONLY to let explicit, authenticated OAuth link a phone-only/unverified-email Discord identity. It does not permit implicit linking. `allowDifferentEmails: true` reflects proof of control of both identities, not an email match.
- New Discord-only users require a syntactically usable, provider-verified email. Missing, malformed or unverified email is treated as absent and rejected safely. Users can verify an email in Discord and retry; TWE has no independent email-verification onboarding service and invents no synthetic address.
- Once explicitly linked, the server can recover the real canonical email by the exact `(discord, provider account ID)` pair. This satisfies the pinned callback's email requirement for subsequent phone-only Discord sign-ins without trusting a changed provider email or replacing TWE profile information.
- Different, previously unlinked identities with different emails cannot safely be recognized as the same person. The UI directs existing users to connect from Account. There is no heuristic merge or cross-user data synchronization.
- Linking does not issue a new TWE session. The current session must still belong to the initiating user at callback. Initiating a link and unlinking require a fresh session.
- The server adds the intended provider to Better Auth's protected additional state and rejects a different callback provider. Client-supplied additional state is discarded. Built-in state/cookie/expiry/CSRF/origin validation remains enabled. Google PKCE is unchanged; the installed Discord provider uses confidential-client authorization-code exchange plus state, and does not implement PKCE. No claim is made that Discord PKCE was added.
- Profile synchronization on link is explicitly disabled. Existing Google profile/display name, email, role and game data remain intact.

## Database safeguards and unlinking

The existing generic account table is reused. Additive migration `0013_connected_accounts.sql` adds missing unique indexes on `(provider_id, account_id)` and `(user_id, provider_id)`. Existing duplicate records make migration fail for separate review; none are merged or deleted.

Better Auth's unlink endpoint requires a fresh session and checks the number of accounts. TWE additionally checks that another **configured** Google/Discord method remains. A database trigger atomically prevents concurrent unlink requests from deleting the final supported method. UI confirmation is required before calling the endpoint. Unlink never deletes the TWE user or game data.

`db/auth-schema.generated.ts` records these additional indexes; preserve them if regenerating the baseline Better Auth schema. The trigger is owned by the reviewed SQL migration.

## Configuration / rollout

Create/configure a Discord Developer Portal OAuth application. Request only `identify` and `email` (no bot, guild or message scopes).

Authorized redirect URIs:

- Production: `https://taleswithoutend.com/api/auth/callback/discord`
- Local, when needed: `http://localhost:5173/api/auth/callback/discord`
- Optional alternate local origin: `http://127.0.0.1:5173/api/auth/callback/discord`

Configure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` as secrets on the production `wwn-character-sheet` Worker. Keep Google secrets and `BETTER_AUTH_SECRET` unchanged. Local credentials belong only in ignored `.dev.vars`; committed `.dev.vars.example` contains empty names. Never paste secrets into a PR, log, screenshot, or chat. No frontend/CI build-time Discord secrets are needed: bindings are read at request time.

Without both Discord bindings, Google continues working, the auth instance remains valid, Discord sign-in is hidden, and Connected Accounts reports Discord unavailable.

Do not merge until configuration has been verified. The focused migration workflow checks secret **names**, duplicate counts and baseline migrations, applies only 0013 to the explicitly confirmed production database, verifies safeguards, then builds/deploys. The ordinary deployment workflow skips this migration release. An automatic Workers Build is not permission to bypass the guarded migration/deployment sequence.

The migration does not change the structure needed by the old Google-only runtime, so a build triggered in parallel remains schema-compatible. Runtime readiness checks also hide/block Discord sign-in, linking and unlinking until all three database safeguards exist. This prevents an independent automatic Workers Build from enabling the new flow ahead of the guarded migration.

## Verification / pending operator actions

Automated tests use the real Better Auth handler and D1 adapter over isolated SQLite with mocked provider HTTP responses. No real OAuth credentials or identities are used. Collision and takeover cases must stay local.

The local Worker smoke test also checks provider availability, authenticated connection projections and sign-out enforcement. For visual-only QA, `node tests/helpers/auth-ui-preview.mjs` serves the actual Connected Accounts and homepage components at `http://localhost:5194/` and `/landing`, with isolated mock connection endpoints. This fixture does not complete real OAuth or contact production.

After configuration, green CI and guarded deployment: use an authorized account to prove Google login, Discord linking without identity/data changes, both sign-in paths, one-provider disconnect, final-method protection, and reconnect the owner's provider if it should remain connected. Do not delete a real provider link merely as test cleanup.
