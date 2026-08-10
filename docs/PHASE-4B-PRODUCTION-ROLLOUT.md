# Phase 4B production review and rollout

**Status: PRODUCTION ROLLOUT PAUSED — LEGACY BASELINE RECONCILIATION APPROVED, NOT YET EXECUTED**  
**Verified auth baseline:** `adc492927d1e1ba608beaa04c4afb791e1820bac`  
**Branding source of truth reconciled from `main`:** through `30890ee9c3d314103ac71d5c12fab1d325f9a2be`  
**Production Worker:** `wwn-character-sheet`  
**Production D1:** `wwn-character-sheet-db` (`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`)  
**Production R2:** `site-creator-r2`

This document is the authoritative production checklist for Phase 4B. The initial approved rollout was stopped before any production migration was applied because Wrangler reported `0000_brainy_killraven.sql` as pending. Read-only production inspection then established the historical baseline described below. Do not apply `0001`–`0004`, run the public-ID backfill, create claims, merge PR #1, or deploy until the legacy baseline reconciliation in section 3 has been executed and verified exactly.

## 1. Reconciled application state

The Phase 4B branch preserves the verified Better Auth implementation while carrying forward current Tales Without End branding from `main`:

- `/assets/tales-without-end-navigation-logo.svg` remains the header/navigation logo.
- The header reads `Tales Without End`.
- The browser title is `Tales Without End - An Interactive Worlds Without Number Character Folio`.
- Phase 4B canonical/Open Graph metadata remains intact.
- Phase 4B Google sign-in, sign-out, `locallySignedOut`, `refetchSession()`, ownership, privacy, stable public URLs, portraits, and direct Better Auth handlers remain intact.
- The requested title revision is 21px → 24px desktop, 15px → 17px at `<=720px`, and 14px → 16px at `<=420px`, retaining logo sizes, weight, spacing, alignment, and no-wrap behavior.

The complete credentialed local Google sign-in → callback → authenticated UI → sign-out → refresh-signed-out → sign-in-again loop was verified on `adc492927d1e1ba608beaa04c4afb791e1820bac`. The reconciled branch validation subsequently passed typecheck, lint, production build/artifact validation, all 67 tests, and Worker type generation.

## 2. Migration inventory and corrected production history

### `0000_brainy_killraven.sql` — generated legacy baseline, not historically executed in production

`0000` creates both:

- `characters`
- `character_revisions`

Its generated `characters` definition uses `id TEXT PRIMARY KEY NOT NULL`.

Production was **not** historically initialized by Wrangler migrations. The pre-Phase-4B application created its live table at runtime with:

```sql
CREATE TABLE IF NOT EXISTS characters (
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

The pre-Phase-4B runtime did not create or use `character_revisions`. The pre-Phase-4B application schema also declared only `characters`.

During the production rollout on 2026-08-10, authenticated read-only inspection established:

- production database ID is exactly `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`;
- a D1 Time Travel bookmark was recorded before any production write;
- `characters` contains exactly 3 rows;
- the live `characters` DDL matches the historical runtime-created schema above;
- `characters.id` is a TEXT primary key with `notnull=0`, ordinary rowid table, not STRICT and not WITHOUT ROWID;
- the only `characters` index is the SQLite primary-key autoindex;
- `characters` has no foreign keys;
- all 3 rows have non-null values for all nine legacy columns;
- all 3 stored `data` values are valid JSON;
- `character_revisions` does not exist;
- Wrangler migration tracking now has `d1_migrations`, but all five migration files remain pending.

Therefore production is **migration-compatible with the Phase 4B chain but is not a literal execution of generated migration `0000`**. The variance is intentional historical drift, not evidence of lost character data.

### Why `character_revisions` will be created during reconciliation

The legacy application never used `character_revisions`, and Phase 4B runtime code does not read or write it. However, the current `db/schema.ts` and Drizzle snapshots continue to declare it as part of the database model. Permanently omitting the table while marking `0000` satisfied would leave known schema drift that future generated migrations would not know to repair and could later assume exists.

The approved reconciliation therefore creates **only the empty `character_revisions` table exactly as represented by `0000`**. It does not run `0000`, does not rebuild `characters`, and does not add the generated migration's explicit `NOT NULL` constraint to `characters.id`.

The live `characters.id` difference is explicitly accepted as a legacy baseline variance because:

- all 3 production IDs are non-null;
- the current application already relies on them as keys;
- `0001`–`0004` do not depend on the explicit `NOT NULL` declaration; and
- rebuilding the live three-row table only to add that redundant-for-current-data constraint would introduce unnecessary rollout risk.

### `0001_better_auth_core.sql`

Creates Better Auth `user`, `session`, `account`, `verification`, and `rate_limit` tables and indexes. It does not depend on `characters` or `character_revisions`.

### `0002_character_ownership_and_claims.sql`

Adds to `characters`:

- nullable `owner_user_id`, FK to `user.id`, `ON DELETE SET NULL`;
- nullable `public_id`;
- non-null `visibility`, default `private`, constrained to `private|unlisted|public`;
- nullable `portrait_key`.

It creates the public-ID/ownership/visibility indexes and legacy-claim tables. It depends on the existing legacy `characters` columns (including `id` and `updated_at`) and the `user` table created by `0001`. It does **not** reference `character_revisions` and does not depend on `characters.id` having an explicit `NOT NULL` declaration.

### `0003_better_auth_rate_limit_compatibility.sql`

Creates the additive historical `rateLimit` / `lastRequest` compatibility table and copies rows from `rate_limit`. It depends on `0001`, not on either character-table baseline variance.

### `0004_better_auth_verification_camel_case_compatibility.sql`

Adds the historical camelCase compatibility fields to Better Auth tables created by `0001`. It does not depend on the character-table baseline.

### Exact local compatibility proof

An exact local reproduction of observed production was created with:

- `id TEXT PRIMARY KEY` with no explicit `NOT NULL`;
- the other eight legacy columns matching production exactly;
- no `character_revisions` table; and
- 3 representative legacy character rows.

The repository versions of `0001`, `0002`, `0003`, and `0004` were then applied in order without running `0000`. All four succeeded. The nine original legacy character fields remained unchanged, row count remained 3, and `0002` produced only its intended state on those rows: `owner_user_id=NULL`, `public_id=NULL`, `visibility='private'`, and `portrait_key=NULL`.

## 3. Approved legacy-baseline reconciliation — execute one step at a time

Wrangler 4.92.0 uses the default tracking table:

```sql
CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

Wrangler determines whether a migration is applied by reading `name` values from `d1_migrations`. After a normal migration executes successfully, Wrangler itself appends:

```sql
INSERT INTO d1_migrations (name) values ('<migration filename>');
```

For this one historical exception, production must be reconciled manually because running `0000` would conflict with the already-existing `characters` table. The audit record must state that `0000` itself was never executed; its migration filename is being baselined only after the live legacy schema has been inspected and its only missing source-model table has been created separately.

### Baseline preconditions

Before any reconciliation write, confirm all of the following remain true:

- production D1 ID is `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`;
- the recorded pre-write Time Travel bookmark is retained privately in the rollout record;
- `characters` count is 3;
- its DDL remains the runtime-created nine-column definition documented above;
- `character_revisions` is absent;
- `d1_migrations` contains no applied migration rows;
- `npm run db:migrations:list:production` reports exactly `0000` through `0004` pending.

If any of those facts changed, STOP and re-audit rather than adapting the procedure.

### Reconciliation write 1 — create only the missing source-model table

**DO NOT RUN UNTIL THE OPERATOR IS EXECUTING THIS APPROVED STEP**

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "CREATE TABLE character_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, character_id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL, saved_at TEXT NOT NULL);"
```

This intentionally omits `IF NOT EXISTS` so an unexpected pre-existing table fails closed.

Immediately verify before any further write:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT sql FROM sqlite_schema WHERE type='table' AND name='character_revisions'; PRAGMA table_info('character_revisions'); SELECT count(*) AS revision_count FROM character_revisions; SELECT count(*) AS character_count FROM characters;"
```

Required result:

- `character_revisions` DDL/columns match `0000`;
- `revision_count = 0`;
- `character_count = 3`.

STOP on any mismatch.

### Reconciliation read-only tracking check

Before the migration-history write, verify the live tracking table is the Wrangler 4.92.0 shape and still empty:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT sql FROM sqlite_schema WHERE type='table' AND name='d1_migrations'; SELECT id, name, applied_at FROM d1_migrations ORDER BY id;"
```

Required result: the table has `id`, unique `name`, and defaulted non-null `applied_at`, with no applied rows. STOP if it differs.

### Reconciliation write 2 — baseline only `0000`

**DO NOT RUN UNTIL WRITE 1 AND BOTH VERIFICATIONS ABOVE HAVE PASSED**

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "INSERT INTO d1_migrations (name) VALUES ('0000_brainy_killraven.sql');"
```

This is intentionally the same filename-only tracking insert used by Wrangler 4.92.0 after a successful migration. It does not claim that `0000` literally ran; the surrounding audit record documents the manual historical reconciliation.

Immediately verify:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id; SELECT count(*) AS character_count FROM characters; SELECT count(*) AS revision_count FROM character_revisions;"
```

Required result:

- exactly one migration row exists;
- its `name` is exactly `0000_brainy_killraven.sql`;
- `character_count = 3`;
- `revision_count = 0`.

Then run:

```sh
npm run db:migrations:list:production
```

The pending set must be **exactly and only**:

1. `0001_better_auth_core.sql`
2. `0002_character_ownership_and_claims.sql`
3. `0003_better_auth_rate_limit_compatibility.sql`
4. `0004_better_auth_verification_camel_case_compatibility.sql`

If `0000` remains pending, any additional migration disappears, or any unexpected migration is present, STOP. Do not apply anything.

### Baseline rollback implication

Both reconciliation writes are additive to the observed production data: write 1 creates an empty table and write 2 adds one migration-history row. They do not alter any existing character row. If either write produces an unexpected state, stop before `0001`. The recorded pre-write D1 Time Travel bookmark can restore the database to the pre-reconciliation point if and only if discarding every write since that bookmark is still acceptable. Do not use Time Travel after legitimate post-bookmark writes without first planning a data-preserving recovery.

## 4. Public-ID backfill review

`scripts/backfill-public-ids.mjs` remains approved only after `0001`–`0004` have been successfully applied and verified:

- IDs are `chr_` plus 16 cryptographically random bytes encoded as base64url (128 random bits).
- Only rows with `public_id IS NULL` are selected.
- Existing IDs are never replaced.
- Collision checks include existing IDs and the database unique index.
- Each update repeats `AND public_id IS NULL`, making reruns safe after partial completion.
- Character renames do not alter `public_id`.

## 5. Legacy-claim review

Legacy characters are never assigned to the first account that signs in. Claims require explicit reviewed public IDs and an authenticated redemption.

For the currently approved rollout, **no production legacy claim is to be created during baseline reconciliation**. Existing characters may remain private and unowned after migration/backfill until deliberately claimed later.

Claim protections remain:

- 256-bit random tokens;
- only SHA-256 token hashes stored in D1;
- raw token written to a new mode-0600 file outside the repository before D1 mutation;
- expiry, revocation and single use;
- rejection of missing/already-owned/overlapping rows;
- guarded transactional redemption.

## 6. Authorization matrix

| Actor | Public | Unlisted exact URL | Private | Create/import | Edit/delete | Portrait | Visibility | Claim |
|---|---|---|---|---|---|---|---|---|
| Signed out | Read | Read | 404 | 401 | 401 | 401 | 401 | 401 |
| Signed in, non-owner | Read | Read | 404 | Own new only | 403 public/unlisted; 404 private | Denied | Denied | Valid explicit token only |
| Signed in, owner | Read | Read | Read | Allowed | Allowed | Allowed | Allowed | N/A for owned rows |

Public character routes use `/character/<opaque-public-id>`. Public APIs/metadata use opaque public IDs rather than internal character keys or Better Auth IDs. Public/exported JSON is sanitized of ownership/account/email/session/token fields. Portrait reads recheck character visibility/ownership.

## 7. Production rollout after baseline reconciliation

Everything below remains blocked until section 3 is completed and the pending migration set is exactly `0001`–`0004`.

### A. Final code/review gates

1. Confirm PR #1 remains unmerged until database preparation succeeds.
2. Confirm the feature head contains both verified histories:

```sh
git fetch origin
git merge-base --is-ancestor adc492927d1e1ba608beaa04c4afb791e1820bac origin/phase-4b-better-auth
git merge-base --is-ancestor 30890ee9c3d314103ac71d5c12fab1d325f9a2be origin/phase-4b-better-auth
```

3. Re-run clean validation if code has changed since the last green run:

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run workers:types
```

### B. Verify target/auth configuration

4. Verify D1 target:

```sh
npx wrangler d1 info wwn-character-sheet-db --config wrangler.jsonc --json
```

ID must be exactly `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`.

5. Retain/refresh an immediate pre-migration Time Travel bookmark as appropriate for the actual migration window.

6. Verify Worker secret names without exposing values:

```sh
npx wrangler secret list --name wwn-character-sheet --config wrangler.jsonc --format=json
```

Required names: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. `BETTER_AUTH_URL` must correspond to `https://taleswithoutend.com`.

7. Google authorized production callback must be exactly:

`https://taleswithoutend.com/api/auth/callback/google`

### C. Establish the post-baseline/pre-Phase-4B migration baseline

8. Record counts:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS character_count FROM characters; SELECT count(*) AS revision_count FROM character_revisions;"
```

Expected at this point: `character_count = 3`, `revision_count = 0`, unless a separately reviewed legitimate production change occurred and the rollout was re-baselined.

9. List pending migrations:

```sh
npm run db:migrations:list:production
```

Expected set is exactly `0001`–`0004`. If it differs, STOP.

### D. Apply and verify `0001`–`0004`

10. Apply the guarded migration command only after the exact pending set has been reviewed:

```sh
npm run db:migrate:production -- --apply --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

11. Verify character/revision counts and legacy state:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS character_count FROM characters; SELECT count(*) AS revision_count FROM character_revisions; SELECT count(*) AS non_private_legacy FROM characters WHERE owner_user_id IS NULL AND visibility <> 'private'; SELECT count(*) AS legacy_with_owner FROM characters WHERE owner_user_id IS NOT NULL;"
```

Required immediately after migration and before claims:

- character count unchanged from step 8;
- revision count unchanged from step 8;
- `non_private_legacy = 0`;
- `legacy_with_owner = 0`.

12. Verify required schema:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT name, type FROM sqlite_master WHERE name IN ('user','session','account','verification','rate_limit','rateLimit','legacy_character_claims','legacy_character_claim_items','characters_public_id_unique','character_revisions') ORDER BY name; PRAGMA table_info('characters');"
```

### E. Backfill opaque public IDs

13. Dry run:

```sh
npm run db:backfill:public-ids -- --remote --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

14. Apply only after the dry-run count is accepted:

```sh
npm run db:backfill:public-ids -- --remote --apply --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

15. Verify:

```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS missing_public_ids FROM characters WHERE public_id IS NULL; SELECT public_id, count(*) AS duplicates FROM characters WHERE public_id IS NOT NULL GROUP BY public_id HAVING count(*) > 1;"
```

Required: `missing_public_ids = 0`, duplicate query returns no rows.

### F. Claims

16. Do not create a production legacy claim unless the owner and opaque public IDs have been deliberately reviewed and approved. For this rollout, claims may remain absent.

### G. Merge/deploy

17. Only after migration/backfill verification succeeds, merge PR #1 through GitHub. Do not create a parallel deployment method; the established `main` → Cloudflare connection is the deployment trigger.

### H. Production smoke/security tests

18. On `https://taleswithoutend.com`, verify site load, reconciled branding/title, Google sign-in/callback, authenticated UI, refresh persistence, sign-out, signed-out refresh, and sign-in again.
19. Create one disposable private character; verify `/character/chr_<opaque>` URL.
20. Signed out, private must be unavailable/404.
21. Unlisted must work by exact URL while absent from public discovery.
22. Public must become discoverable.
23. A second account may read public/unlisted but must not edit/delete/change portrait/visibility.
24. Verify portrait privacy/ownership enforcement.
25. Delete the disposable character and verify its URL no longer resolves.
26. Do not modify existing real characters for smoke testing.

## 8. Rollback criteria and procedure

Halt immediately for any of the following:

- baseline verification differs from section 3;
- migration list differs from the reviewed set;
- character/revision counts change unexpectedly;
- any legacy row becomes owned without an explicit claim;
- any legacy row becomes non-private unexpectedly;
- a private character or portrait is readable by a non-owner;
- a non-owner write succeeds;
- Google auth cannot complete on the canonical domain;
- sustained new 5xx errors appear in auth/character routes;
- public-ID backfill leaves nulls/duplicates.

### Code rollback

The pre-Phase-4B production main head is `30890ee9c3d314103ac71d5c12fab1d325f9a2be`. If database preparation is sound but application code must be withdrawn, restore/deploy that reviewed revision through the normal GitHub→Cloudflare path. Phase 4B schema changes are additive and the old application ignores them.

### D1 Time Travel rollback

Time Travel restore overwrites the database in place. Use it only when discarding all post-bookmark writes is explicitly acceptable.

```sh
npx wrangler d1 time-travel restore wwn-character-sheet-db --bookmark=RECORDED_PRE_MIGRATION_BOOKMARK --config wrangler.jsonc
```

If any legitimate writes occurred after the bookmark, STOP and plan a data-preserving recovery rather than blindly restoring.

## 9. Audit record requirements

The rollout record must preserve:

- production D1 name and exact ID;
- the pre-write Time Travel bookmark reference;
- observed pre-baseline character count of 3;
- the exact runtime-created legacy `characters` DDL and PRAGMA findings;
- confirmation all three legacy rows passed non-null/valid-JSON checks;
- confirmation `character_revisions` was absent historically;
- explanation that production was initialized by runtime `CREATE TABLE`, not Wrangler migrations;
- explanation that generated `0000` was never literally executed;
- the accepted `characters.id` variance (`PRIMARY KEY` without explicit `NOT NULL`);
- proof that `0001`–`0004` apply successfully to an exact local reproduction of that observed schema;
- the exact `character_revisions` creation command/result;
- the exact manual `0000` tracking row/result;
- the resulting pending set of exactly `0001`–`0004`;
- post-migration counts/schema/backfill results;
- merge commit and production smoke-test results if deployment proceeds.

## 10. Current blockers

At this checkpoint:

- the legacy baseline discrepancy has been audited and the reconciliation procedure above is approved in documentation;
- **neither reconciliation production write has been executed yet**;
- `0001`–`0004` remain unapplied;
- public-ID backfill has not run;
- no legacy production claim has been created;
- PR #1 remains blocked from merge/deployment until baseline reconciliation, migration and backfill verification succeed.
