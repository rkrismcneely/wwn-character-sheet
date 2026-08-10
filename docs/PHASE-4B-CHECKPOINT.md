# Phase 4B Checkpoint — Production rollout paused at legacy baseline reconciliation

**Status:** In progress; production rollout paused before Phase 4B migrations  
**Feature branch:** `phase-4b-better-auth`  
**Draft pull request:** [#1 — Phase 4B: Better Auth, ownership, privacy, and stable character URLs](https://github.com/rkrismcneely/wwn-character-sheet/pull/1)  
**Checkpoint date:** 2026-08-10  
**Verified auth baseline before reconciliation:** `adc492927d1e1ba608beaa04c4afb791e1820bac`  
**Current `main` branding history reconciled:** through `30890ee9c3d314103ac71d5c12fab1d325f9a2be`  
**Pre-production reconciliation review head:** `7618b2fb27ded9ebf8d81c49dab99ee5bfe2c285`

This document remains the restart point for Phase 4B. The credentialed local Google sign-in → callback → authenticated UI → sign-out → refresh-signed-out → sign-in-again loop was verified on `adc492927d1e1ba608beaa04c4afb791e1820bac`. Branding reconciliation and the pre-production audit preserved those auth handlers.

The approved production rollout began on 2026-08-10 but stopped at the documented mandatory migration-baseline gate when production reported `0000_brainy_killraven.sql` as pending. No Phase 4B production migration, public-ID backfill, legacy claim, PR merge, or deployment has occurred.

The authoritative execution procedure is now `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`. Do not improvise around the legacy baseline procedure recorded there.

## Current branch/auth history

Key Phase 4B implementation and corrective commits include:

1. `80a0ce90573a3dd9f26e7611e43650758e34d5c3` — Implement Phase 4B auth, ownership, and private sharing
2. `d04063e` — Add Better Auth rate-limit compatibility migration
3. `c6ebd56` — Add Better Auth verification/schema compatibility migration
4. `502e840d` — Fix Google sign-in button wiring
5. `6c5ce59df94d5ae072b53008612e43fe7b49015b` — Prove and directly wire rendered Google sign-in controls
6. `f89348b62ac9e2a3ddd4f759c569f21e02280f32` — Map Better Auth runtime to generated D1 schema
7. `e8ee56ea17558757d9d07e5a1c83c0d4055bf5ea` — Sign-out state/runtime fix
8. `adc492927d1e1ba608beaa04c4afb791e1820bac` — Fix signed-out header sign-in obscured by the Character Library modal

The full real local Google login/callback/authenticated-return/sign-out/refresh/sign-in-again loop was manually verified on `adc4929`.

The current Tales Without End branding history through `30890ee9c3d314103ac71d5c12fab1d325f9a2be` was merged into Phase 4B without replacing the verified auth implementation. The reconciled header keeps `/assets/tales-without-end-navigation-logo.svg`, `Tales Without End`, and the exact browser title `Tales Without End - An Interactive Worlds Without Number Character Folio`. The requested title sizing is 24px desktop, 17px at `<=720px`, and 16px at `<=420px`.

## Better Auth configuration

- Package: Better Auth `1.6.25`
- Entry: `lib/auth.ts`
- Base path: `/api/auth`
- Provider: Google only
- Email/password: disabled
- Secure session/database rate limiting: enabled
- OAuth account tokens: encrypted
- Cross-subdomain cookies: disabled
- CSRF/origin checks: enabled
- Generated snake_case D1 fields are explicitly mapped in runtime configuration
- Trusted origins: `https://taleswithoutend.com`, `http://localhost:5173`, `http://127.0.0.1:5173`

Production configuration:

- D1 binding `DB` → `wwn-character-sheet-db` (`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`)
- R2 binding `BUCKET` → `site-creator-r2`
- production Google callback: `https://taleswithoutend.com/api/auth/callback/google`

Do not use the existing Cloudflare branch preview for write testing; it was previously found to be bound to production storage and lacks the approved production auth setup.

## Migration inventory

Repository migration files are:

- `drizzle/0000_brainy_killraven.sql` — generated legacy baseline containing `characters` **and** `character_revisions`
- `drizzle/0001_better_auth_core.sql` — Better Auth `user`, `session`, `account`, `verification`, `rate_limit`
- `drizzle/0002_character_ownership_and_claims.sql` — additive ownership, visibility, opaque public ID, portrait key, legacy claims
- `drizzle/0003_better_auth_rate_limit_compatibility.sql` — additive historical `rateLimit` compatibility
- `drizzle/0004_better_auth_verification_camel_case_compatibility.sql` — additive historical camelCase compatibility columns

Important correction: `0000` was **not** historically executed in production. Production was initialized outside Wrangler migration tracking by the pre-Phase-4B application's runtime `CREATE TABLE IF NOT EXISTS characters` bootstrap.

## Production read-only audit — 2026-08-10

The approved rollout verified the production D1 target exactly:

- database: `wwn-character-sheet-db`
- ID: `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`

A D1 Time Travel recovery bookmark was recorded before any production write.

Observed production state:

- `characters`: exists, 3 rows
- `character_revisions`: absent
- Wrangler `d1_migrations`: now exists after migration inspection but contains no applied migration rows
- Wrangler lists `0000`–`0004` all pending

Observed live `characters` DDL:

```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  player TEXT NOT NULL DEFAULT '',
  class_label TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

`PRAGMA` inspection confirmed:

- exactly 9 legacy columns;
- `id` is TEXT, primary key, `notnull=0`;
- all other expected types/defaults/not-null constraints match the historical runtime schema;
- ordinary rowid table;
- `STRICT=false`;
- `WITHOUT ROWID=false`;
- only index is `sqlite_autoindex_characters_1`, unique, origin `pk`;
- no foreign keys.

All three rows passed validation:

- no NULL value in any of the nine legacy columns;
- all stored character JSON is valid.

### Historical explanation

The pre-Phase-4B runtime `app/api/characters/db.ts` created only `characters` with `id TEXT PRIMARY KEY` and did not create `character_revisions`. The pre-Phase-4B `db/schema.ts` also declared only `characters`, and the application read/save/delete paths used only that table.

Generated migration `0000`, however, contained both `characters` and `character_revisions`, and specified `characters.id TEXT PRIMARY KEY NOT NULL`. Therefore the live production schema is the expected historical runtime schema but is not a literal execution of `0000`.

This is migration history drift, not character-data corruption.

## Local compatibility proof against exact production shape

An exact local reproduction was tested with:

- `id TEXT PRIMARY KEY` and no explicit `NOT NULL`;
- the other eight legacy columns matching production;
- no `character_revisions` table;
- three representative legacy rows.

The repository copies of `0001`, `0002`, `0003`, and `0004` were applied in order without running `0000`.

Result:

- all four migrations succeeded;
- character count stayed 3;
- all nine original character fields remained unchanged;
- all three rows received only the intended `0002` defaults/additions: `owner_user_id=NULL`, `public_id=NULL`, `visibility='private'`, `portrait_key=NULL`;
- no migration referenced or required `character_revisions`;
- no migration depended on `characters.id` carrying an explicit `NOT NULL` constraint.

Therefore the observed production schema is compatible with the Phase 4B migration chain.

## Wrangler 4.92.0 migration-tracking audit

The project currently pins Wrangler 4.92.0. Its migration implementation creates the default tracking table as:

```sql
CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

Wrangler reads `name` from that table to determine which migration filenames are already applied. After successfully executing a normal migration file, Wrangler appends:

```sql
INSERT INTO d1_migrations (name) values ('<migration filename>');
```

The approved manual baseline therefore uses the same filename-only tracking mechanism, but only after reconciling the missing source-model table and preserving an explicit audit trail explaining that `0000` itself never ran.

## Approved handling of `character_revisions`

Although the live legacy application never used `character_revisions`, it should now be created as an empty table **exactly as represented by `0000`** before baselining `0000`.

Reason: current `db/schema.ts` and Drizzle snapshots still declare `character_revisions`. Leaving it absent while teaching Wrangler that `0000` is satisfied would preserve known schema drift that future generated migrations could assume away. Creating the empty table is a small additive change and does not modify the three live character rows.

The live `characters.id` variance will **not** be repaired by rebuilding the table. Its lack of an explicit `NOT NULL` is documented and accepted because all three IDs are non-null and `0001`–`0004` do not depend on that declaration. Rebuilding the live table solely for that constraint would add unnecessary risk.

## Approved legacy baseline procedure — not yet executed

Execute the production steps only in the order in `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`.

1. Reconfirm preconditions: D1 identity, Time Travel bookmark, character count 3, legacy DDL unchanged, `character_revisions` absent, empty tracking table, and `0000`–`0004` pending.
2. Create **only** the empty `character_revisions` table with the exact `0000` column definition. Do not run `0000` and do not use `IF NOT EXISTS`.
3. Verify revision DDL, `revision_count=0`, and `character_count=3`.
4. Verify `d1_migrations` has Wrangler 4.92.0's expected schema and no applied rows.
5. Insert exactly one tracking row: `0000_brainy_killraven.sql`.
6. Verify exactly one tracking row, `character_count=3`, and `revision_count=0`.
7. Run `npm run db:migrations:list:production`.
8. Required pending set after reconciliation is exactly:
   - `0001_better_auth_core.sql`
   - `0002_character_ownership_and_claims.sql`
   - `0003_better_auth_rate_limit_compatibility.sql`
   - `0004_better_auth_verification_camel_case_compatibility.sql`
9. STOP on any mismatch. Do not apply `0001`–`0004` until this reconciliation is complete and reviewed.

Both baseline writes are additive. The recorded Time Travel bookmark remains the recovery point if an unexpected state occurs before legitimate post-bookmark writes make destructive restore unacceptable.

## Validation state

The final reconciled implementation tree was cleanly validated before production rollout:

- `npm ci`: pass
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run build`: pass; Worker artifact validation passed
- `npm test`: 67/67 pass, 0 fail
- `npm run workers:types`: pass

The migration-preservation tests cover `0001`–`0004`; the production-shaped local audit described above additionally proves those four migrations succeed from the exact observed legacy production schema without `0000` or `character_revisions`.

## Auth/UI resolved issues retained

### Sign out

The rendered Sign out control calls Better Auth directly, surfaces errors, immediately disables signed-in UI after success, clears owner/edit state, refetches the Better Auth session, and refreshes the public library. Local Worker runtime verification confirms `POST /api/auth/sign-out` succeeds, the server session becomes null, refresh stays signed out, and Google sign-in can be requested again.

### Signed-out header sign-in behind Character Library modal

The no-request sign-in symptom was traced to the fixed Character Library backdrop intercepting the visible header sign-in button while the modal was open. The narrow fix renders the header sign-in only when signed out and the library modal is closed; the modal's own Google sign-in remains active. The Better Auth sign-in handler itself was not regressed.

## Branding reconciliation retained

Current `main` branding through `30890ee9c3d314103ac71d5c12fab1d325f9a2be` remains reconciled with Phase 4B. The exact browser title is `Tales Without End - An Interactive Worlds Without Number Character Folio`; Phase 4B canonical/Open Graph metadata and auth/ownership UI remain intact.

## Production gates still outstanding

- Execute and verify the documented legacy baseline reconciliation.
- Require migration list to become exactly `0001`–`0004` pending.
- Do not run `0000`.
- Do not rebuild `characters` to add explicit `NOT NULL` to `id`.
- Do not apply `0001`–`0004` until the baseline reconciliation is verified.
- Do not run the public-ID backfill yet.
- Do not create production legacy claims yet unless separately reviewed.
- Do not merge PR #1 or deploy yet.
- After the baseline is resolved, resume only from the authoritative ordered procedure in `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`.
