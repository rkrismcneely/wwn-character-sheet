# Tales Without End

Tales Without End is an editable Worlds Without Number character sheet built
with React, Next.js App Router conventions, Vinext, and a Cloudflare Worker.
Cloudflare D1 stores characters and Better Auth records; R2 stores portraits.

Production: <https://taleswithoutend.com>

The fallback Worker URL is retained for application access, but authentication
is canonicalized to `https://taleswithoutend.com` so it never creates a second
production login identity.

## Requirements

- Node.js 22.13 or newer
- npm
- Bash and GNU `timeout` for the existing build helpers

Install the exact locked dependencies:

```sh
npm ci
```

## Authentication

Phase 4B uses Better Auth 1.6.25 with Google as the only sign-in provider.
Email/password, usernames, public profiles, magic links, and other social
providers are disabled. Authentication is mounted at `/api/auth/*`; Google's
production callback is:

```text
https://taleswithoutend.com/api/auth/callback/google
```

Create an ignored `.dev.vars` file from `.dev.vars.example` for local work:

```text
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Use local development credentials and configure Google's local callback as
`http://localhost:5173/api/auth/callback/google`. Never commit `.dev.vars`,
`.env` files, credentials, OAuth tokens, session data, or claim tokens.

Start the application on the trusted local origin:

```sh
npm run dev
```

Open <http://localhost:5173>. The auth configuration also trusts
`http://127.0.0.1:5173`; no wildcard production origins are trusted.

## Character privacy and URLs

Every new or imported character is owned by the authenticated Better Auth user,
starts private, and receives a server-generated opaque URL with 128 random bits:

```text
https://taleswithoutend.com/character/chr_<opaque-id>
```

The ID is independent of the character name and remains stable after renaming.
Server-side authorization applies to every write and portrait operation.

- **Private:** readable and editable only by the owner. Unauthorized retrieval
  returns not found.
- **Unlisted:** readable by anyone with the exact URL, editable only by the
  owner, and excluded from public listings/search.
- **Public:** readable by anyone and eligible for the Public Characters view;
  still editable only by the owner.

Public responses, metadata, exports, URLs, and portrait keys omit account IDs,
Google IDs, names, emails, credentials, and session data. Portrait objects are
served through an authorization-aware route rather than exposed as public R2
URLs.

## Database migrations

The versioned D1 migrations are in `drizzle/`:

- `0000_brainy_killraven.sql` — existing character tables
- `0001_better_auth_core.sql` — schema generated with Better Auth's official
  CLI for its D1-backed user, session, account, verification, and rate-limit
  records
- `0002_character_ownership_and_claims.sql` — additive character ownership,
  visibility, public-ID, portrait-key, and legacy-claim schema
- `0003_better_auth_rate_limit_compatibility.sql` — additive historical
  `rateLimit` / `lastRequest` compatibility table
- `0004_better_auth_verification_camel_case_compatibility.sql` — additive
  historical camel-case compatibility columns; current runtime mappings use
  the canonical snake-case Better Auth fields

Apply and test migrations against local D1:

```sh
npm run db:migrate:local
```

Inspect production's pending migrations deliberately:

```sh
npm run db:migrations:list:production
```

The authoritative Phase 4B production order, verification queries, claim setup, and rollback commands are in `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`.

Production migration is intentionally separate from deployment:

```sh
npm run db:migrate:production -- \
  --apply \
  --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

The guarded command verifies the remote database identity and prints the exact
pending migrations before applying them. Before running it, review every SQL
file and confirm D1 Time Travel/recovery availability. The configured target
must remain `wwn-character-sheet-db` with database ID
`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`. Ordinary builds do not apply remote
migrations.

Generate updated Worker binding types after configuration changes:

```sh
npm run workers:types
```

Regenerate Better Auth's schema only after reviewing a deliberate Better Auth
upgrade:

```sh
npm run auth:schema
```

## Legacy characters

The ownership migration preserves every existing row and keeps legacy ownership
nullable. It does not infer an owner. After the migration is reviewed and
applied:

1. Run `npm run db:backfill:public-ids` as a dry run. Use `--apply` only after
   confirming the target; remote mode additionally requires the exact database
   ID confirmation shown by the script.
2. Select only the intended opaque character IDs and run
   `npm run legacy-claim:create -- --character=<public-id> --output=<private-file-outside-repository>`.
   The command is dry-run by default. `--apply` creates a cryptographically
   random, expiring, one-time token, reserves the raw token first in a new mode-`0600` file and stores only its SHA-256 hash in D1. If the D1 result is ambiguous, retain that private file and verify/revoke its claim ID before retrying.
3. Give that token privately to the intended person. They must sign in before
   submitting it in My Characters.
4. Revoke an unused claim with `npm run legacy-claim:revoke --
   --claim-id=<id>`; add `--apply` only after reviewing the dry run.

For any remote admin command, add `--remote` and
`--confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699`. Never put a
claim token in a URL, shell history shared with others, source control, logs, or
analytics.

## Read-only administrators

Administrator roles use Better Auth's server-owned `user.role` field. New and
existing accounts default to `user`. After the role migration is applied, an
operator can deliberately promote one existing account without printing its
email or internal ID:

```sh
TWE_ADMIN_EMAIL='account@example.com' npm run admin:promote -- \
  --remote --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699

TWE_ADMIN_EMAIL='account@example.com' npm run admin:promote -- \
  --remote --apply \
  --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

The first command is read-only and must match exactly one Better Auth user. The
second promotes only that same account and verifies its stored role. Repeat the
same reviewed procedure with another account email to add another
administrator. Administrator status expands character read access only;
character mutations remain owner-only.

## Build, test, and validation

```sh
npm run typecheck
npm run lint
npm test
npm run validate:artifact
```

`npm test` first creates the production bundle, then runs the rules, dice,
authorization/privacy, and local D1 migration-preservation tests. The build
must succeed without production secret values because secrets are read from the
Worker runtime.

Create a validated production artifact explicitly with:

```sh
npm run build
```

Serve that artifact in a local Workers runtime with `npm run start`.

Generated output (`dist/`, `.next/`), dependencies, Wrangler state, local D1
state, environment files, and personal character exports are ignored.

## Project layout

- `app/` — character UI, stable character route, and App Router API routes
- `lib/` — Better Auth, authorization, validation, privacy, and claim helpers
- `db/` and `drizzle/` — reviewed schema and versioned D1 migrations
- `worker/` — Cloudflare Worker entry point
- `public/` — fonts, icons, and local visual assets
- `scripts/` — build checks and guarded migration/claim administration
- `tests/` — rules, dice, security, build, and migration regressions
- `docs/phase-4b-review.md` — migration and security review material plus the
  production verification checklist
- `docs/PHASE-4B-PRODUCTION-ROLLOUT.md` — authoritative pre-production audit and exact guarded rollout/rollback checklist

Cloudflare configuration is authoritative in `wrangler.jsonc`. Do not change
the production `DB` or `BUCKET` resources, apply remote migrations, or merge the
Phase 4B branch without explicit review and approval.
