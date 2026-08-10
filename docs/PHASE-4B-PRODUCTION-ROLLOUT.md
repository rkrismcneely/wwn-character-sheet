# Phase 4B pre-production review and rollout

**Status: REVIEW ONLY — DO NOT RUN PRODUCTION COMMANDS YET**  
**Verified auth baseline:** `adc492927d1e1ba608beaa04c4afb791e1820bac`  
**Branding source of truth reconciled from `main`:** through `30890ee9c3d314103ac71d5c12fab1d325f9a2be`  
**Production Worker:** `wwn-character-sheet`  
**Production D1:** `wwn-character-sheet-db` (`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`)  
**Production R2:** `site-creator-r2`

This document is the authoritative pre-production checklist for Phase 4B. It supersedes older execution wording that refers to only migrations `0001` and `0002`. No command marked **DO NOT RUN YET** was executed while preparing this review.

## 1. Reconciled application state

The Phase 4B branch preserves the verified Better Auth implementation while carrying forward current Tales Without End branding from `main`:

- `/assets/tales-without-end-navigation-logo.svg` remains the header/navigation logo.
- The header reads `Tales Without End`; the former `WORLDS WITHOUT NUMBER` / `Interactive character folio` branding is not restored.
- The browser title is `Tales Without End - An Interactive Worlds Without Number Character Folio`.
- Phase 4B's `metadataBase`, canonical URL, and Open Graph metadata remain intact.
- Phase 4B Google sign-in, sign-out, `locallySignedOut`, `refetchSession()`, ownership UI, privacy UI, and direct Better Auth handlers remain intact.
- The branding merge was resolved hunk-by-hunk. `app/page.tsx` merged without a content conflict; `ROADMAP.md`, `app/globals.css`, and `app/layout.tsx` required explicit reconciliation.

The requested small title revision is applied on top of current `main`: 21px → 24px desktop, 15px → 17px at `<=720px`, and 14px → 16px at `<=420px`. Logo sizes, font family/weight, letter spacing, alignment, and no-wrap behavior are retained.

## 2. Exact migration inventory

### `0000_brainy_killraven.sql` — existing production character schema

Creates the pre-Phase-4B `characters` and `character_revisions` tables. This is the baseline migration and should already be recorded in production before Phase 4B. If production lists `0000` as pending, **STOP** and investigate rather than applying Phase 4B.

### `0001_better_auth_core.sql` — Better Auth core tables

Creates:

- `user`
- `session`
- `account`
- `verification`
- `rate_limit`

It also creates the Better Auth indexes/uniqueness constraints for user email, session token, account user, verification identifier, and rate-limit key. `session.user_id` and `account.user_id` reference `user.id` with `ON DELETE CASCADE`.

### `0002_character_ownership_and_claims.sql` — ownership, privacy, URLs, claims

Adds to `characters`:

- nullable `owner_user_id`, FK to `user.id`, `ON DELETE SET NULL`
- nullable `public_id`
- non-null `visibility`, default `private`, constrained to `private|unlisted|public`
- nullable `portrait_key`

Creates a unique index on `public_id`, owner/update and visibility/update indexes, plus `legacy_character_claims` and `legacy_character_claim_items` with their indexes and foreign keys.

**Important rollout effect:** existing character rows become `visibility='private'` and remain unowned. Their JSON, versions, timestamps, and revision rows are preserved, but the Phase 4B application will not expose those rows until they are explicitly claimed. This is privacy-safe but creates a temporary accessibility boundary, so backfill and intended claim preparation must be completed before deployment.

### `0003_better_auth_rate_limit_compatibility.sql` — historical rate-limit compatibility

Creates the additive `rateLimit` / `lastRequest` compatibility table and copies any existing `rate_limit` rows into it with `INSERT OR IGNORE`.

The current runtime explicitly maps Better Auth back to the canonical snake-case `rate_limit.last_request`, so `rateLimit` is retained as historical compatibility schema and is not the runtime source of truth.

### `0004_better_auth_verification_camel_case_compatibility.sql` — historical field compatibility

Adds nullable camel-case compatibility columns to `user`, `session`, `account`, and `verification` and backfills them from the canonical snake-case columns.

The current `lib/auth.ts` explicitly maps Better Auth to the original snake-case fields, so these compatibility columns are not authoritative and are not expected to stay synchronized with future writes. They remain additive because the migration has already been exercised in local Phase 4B history.

### Migration risks and conclusions

- No Phase 4B migration drops, renames, truncates, or rebuilds an existing character table.
- `0002` is the key operational risk: existing rows intentionally become private/unowned until claim.
- `public_id` remains nullable during migration so existing rows are not forced through an unsafe non-null ALTER; the separate backfill fills them afterward.
- `characters_public_id_unique` enforces collision protection once IDs are assigned.
- `0003` and `0004` are redundant with the final explicit Better Auth mappings but are additive.
- Drizzle's `_journal.json` currently records `0000`–`0002`; `0003`/`0004` are hand-authored D1 compatibility migrations. Future Drizzle-generated table-rebuild migrations must explicitly preserve the compatibility table/columns or deliberately retire them in a separately reviewed migration.

## 3. Public-ID backfill review

`scripts/backfill-public-ids.mjs` is suitable for production with the guarded rollout below:

- IDs are `chr_` plus 16 cryptographically random bytes encoded as base64url (128 random bits).
- IDs are independent of name, username, email, Google identity, and Better Auth user ID.
- Only rows with `public_id IS NULL` are selected.
- Existing IDs are never replaced.
- In-memory collision checks include all already-assigned IDs, while the database unique index provides a final collision constraint.
- Every update repeats `AND public_id IS NULL`, making reruns safe after partial completion.
- Character renames do not alter `public_id`.
- Existing legacy portrait keys are preserved only when they are already valid `portraits/...` keys. The pre-Phase-4B uploader used random UUID portrait keys, not account identifiers.

## 4. Legacy-claim review

Legacy characters are **not** assigned to the first account that signs in. A claim must be created for explicitly selected opaque character IDs by an administrator, and redemption requires an authenticated Better Auth session.

Claim protections:

- 32 random bytes (256 random bits) in each `claim_...` token.
- Only SHA-256 token hashes are stored in D1.
- Raw tokens are written to a new mode-`0600` file outside the repository and are never logged.
- Claim creation rejects missing, already-owned, or overlapping actively claimed characters.
- Claims expire, can be revoked before use, and cannot be replayed after use.
- Redemption rejects revoked/expired/used claims, already-owned characters, and legacy rows that have not yet received public IDs.
- Redemption uses `D1Database.batch()` with guarded predicates; the claim row and character ownership changes execute as one D1 transaction.
- A race between two users can produce only one successful claimant.

A pre-production hardening change reserves the private token file **before** mutating D1. If the administrative D1 command then fails or its result is ambiguous, the private file is intentionally retained with the claim ID/token so the operator can verify or revoke the possible database record rather than losing the only raw token after a successful database write.

## 5. Authorization matrix

| Actor | Public | Unlisted exact URL | Private | Create/import | Edit/delete | Portrait | Visibility | Claim |
|---|---|---|---|---|---|---|---|---|
| Signed out | Read | Read | 404 | 401 | 401 | 401 | 401 | 401 |
| Signed in, non-owner | Read | Read | 404 | Own new records only | 403 public/unlisted; 404 private | Denied | Denied | Only with valid explicit claim token |
| Signed in, owner | Read | Read | Read | Allowed | Allowed | Allowed | Allowed | N/A for already-owned rows |

These rules are enforced in server routes through the validated session actor and owner checks; they are not merely hidden UI controls.

## 6. URL and privacy review

Public character routes use:

`/character/<opaque-public-id>`

Public-facing character APIs and metadata use the opaque public ID rather than the internal character key or Better Auth user ID. Sanitization strips ownership/account/email/session/token fields from imported/stored/exported character JSON. Portrait URLs use either legacy random UUID keys or new keys containing only the opaque character ID plus a random UUID. Private portrait retrieval rechecks character visibility/ownership before reading R2.

## 7. Exact production rollout checklist

Everything below is a future operator checklist. **DO NOT RUN YET.**

### A. Final code/review gates

1. Confirm PR #1 is still draft until review is complete.
2. Confirm the final Phase 4B head contains both verified auth history and the current branding head:

**DO NOT RUN YET**
```sh
git fetch origin
git merge-base --is-ancestor adc492927d1e1ba608beaa04c4afb791e1820bac origin/phase-4b-better-auth
git merge-base --is-ancestor 30890ee9c3d314103ac71d5c12fab1d325f9a2be origin/phase-4b-better-auth
```

Both commands must exit 0.

3. Re-run validation from a clean checkout:

**DO NOT RUN YET**
```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run workers:types
```

### B. Verify production target and recovery point

4. Confirm the configured D1 target before any write:

**DO NOT RUN YET**
```sh
npx wrangler d1 info wwn-character-sheet-db --config wrangler.jsonc --json
```

The resolved database ID must be exactly `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`. Stop on any mismatch.

5. Record the current D1 Time Travel bookmark immediately before migration:

**DO NOT RUN YET**
```sh
npx wrangler d1 time-travel info wwn-character-sheet-db --config wrangler.jsonc
```

Copy the returned bookmark to the rollout record. Do not proceed without a recorded restore point.

6. Verify required Worker secret/binding names without exposing values:

**DO NOT RUN YET**
```sh
npx wrangler secret list --name wwn-character-sheet --config wrangler.jsonc --format=json
```

Confirm the production runtime has `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` supplied by the approved Worker environment. Confirm `BETTER_AUTH_URL` resolves to `https://taleswithoutend.com`.

7. In the Google OAuth configuration, verify the authorized production callback is exactly:

`https://taleswithoutend.com/api/auth/callback/google`

### C. Establish pre-migration baselines

8. Record legacy character/revision counts:

**DO NOT RUN YET**
```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS character_count FROM characters; SELECT count(*) AS revision_count FROM character_revisions;"
```

9. List pending migrations:

**DO NOT RUN YET**
```sh
npm run db:migrations:list:production
```

Expected Phase 4B pending set: `0001_better_auth_core.sql`, `0002_character_ownership_and_claims.sql`, `0003_better_auth_rate_limit_compatibility.sql`, `0004_better_auth_verification_camel_case_compatibility.sql`. If `0000` is pending, or if the list differs, **STOP** and investigate.

### D. Apply and verify migrations

10. Apply the guarded migration set:

**DO NOT RUN YET**
```sh
npm run db:migrate:production -- --apply --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

11. Verify character/revision counts are unchanged and legacy state is private/unowned before backfill:

**DO NOT RUN YET**
```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS character_count FROM characters; SELECT count(*) AS revision_count FROM character_revisions; SELECT count(*) AS non_private_legacy FROM characters WHERE owner_user_id IS NULL AND visibility <> 'private'; SELECT count(*) AS legacy_with_owner FROM characters WHERE owner_user_id IS NOT NULL;"
```

Compare the first two counts with step 8. The two legacy safety counts must be 0 before any claim is redeemed.

12. Verify the required schema exists:

**DO NOT RUN YET**
```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT name, type FROM sqlite_master WHERE name IN ('user','session','account','verification','rate_limit','rateLimit','legacy_character_claims','legacy_character_claim_items','characters_public_id_unique') ORDER BY name; PRAGMA table_info('characters');"
```

### E. Backfill opaque public IDs

13. Dry-run the backfill against the guarded production target:

**DO NOT RUN YET**
```sh
npm run db:backfill:public-ids -- --remote --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

Record and review the count.

14. Apply only after the dry-run count is accepted:

**DO NOT RUN YET**
```sh
npm run db:backfill:public-ids -- --remote --apply --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699
```

15. Verify completion and uniqueness:

**DO NOT RUN YET**
```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT count(*) AS missing_public_ids FROM characters WHERE public_id IS NULL; SELECT public_id, count(*) AS duplicates FROM characters WHERE public_id IS NOT NULL GROUP BY public_id HAVING count(*) > 1;"
```

`missing_public_ids` must be 0 and the duplicate query must return no rows.

### F. Prepare explicit legacy claims before deployment

16. For each intended legacy owner, select only the reviewed opaque public IDs. First dry-run claim creation:

**DO NOT RUN YET**
```sh
npm run legacy-claim:create -- --remote --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699 --character=chr_REVIEWED_PUBLIC_ID --output=/ABSOLUTE/PRIVATE/PATH/claim.json --expires-in-days=7
```

17. Apply the reviewed claim:

**DO NOT RUN YET**
```sh
npm run legacy-claim:create -- --remote --apply --confirm-database-id=8e2bf197-e20f-4ea7-a86f-cab4e1a74699 --character=chr_REVIEWED_PUBLIC_ID --output=/ABSOLUTE/PRIVATE/PATH/claim.json --expires-in-days=7
```

Keep the mode-`0600` token file private. Never paste its token into a URL, issue, PR, log, analytics field, or shared shell history.

18. Verify each created claim by its non-secret `claimId` from the private file, without putting the raw token on the command line:

**DO NOT RUN YET**
```sh
npx wrangler d1 execute wwn-character-sheet-db --remote --config wrangler.jsonc --command "SELECT claim.id, claim.expires_at, claim.claimed_at, claim.revoked_at, count(item.character_id) AS item_count FROM legacy_character_claims AS claim JOIN legacy_character_claim_items AS item ON item.claim_id = claim.id WHERE claim.id = 'REVIEWED_CLAIM_ID' GROUP BY claim.id;"
```

If claim creation reported an error after reserving its private token file, **do not retry blindly**. Use this verification step first; revoke the unresolved claim if necessary.

### G. Deploy only after migration/backfill/claim preparation succeeds

19. Obtain explicit approval to merge PR #1. The repository's established GitHub→Cloudflare connection deploys changes from `main`; do not invent a parallel manual deployment path for this rollout unless that integration is deliberately changed.

20. Merge PR #1 through GitHub. This is the deployment trigger. Do not merge until steps 1–18 are complete and reviewed.

### H. Production smoke/security tests

21. On `https://taleswithoutend.com`, verify Google sign-in and callback, authenticated UI, refresh persistence, sign-out, signed-out refresh, and sign-in again.
22. Create a disposable private character and verify its URL is `/character/chr_<opaque>`.
23. Signed out, verify private returns unavailable/404.
24. Change it to unlisted; verify exact URL works signed out but it is absent from public search/library.
25. Change it to public; verify public library discovery.
26. With a second account, verify public/unlisted reads but no edit/delete/portrait/visibility writes.
27. Upload and retrieve a disposable portrait; verify private visibility is enforced.
28. Redeem one deliberately selected legacy test claim; verify ownership changes only for its selected rows and the token cannot be reused.
29. Verify every unselected legacy character remains unowned/private and unchanged.
30. Delete the disposable test character and verify its URL no longer resolves.

## 8. Rollback criteria and procedure

Rollback or halt immediately for any of the following:

- migration list differs from the reviewed set;
- character/revision counts change unexpectedly;
- any legacy row becomes owned without an explicit claim;
- any private character or portrait is readable by a non-owner;
- any non-owner write succeeds;
- Google auth cannot complete on the canonical domain;
- sustained new 5xx errors appear in auth or character routes;
- public-ID backfill leaves nulls/duplicates;
- claim redemption changes the wrong rows.

### Code rollback

The pre-Phase-4B production main head is `30890ee9c3d314103ac71d5c12fab1d325f9a2be`. If the schema/backfill is sound but the new application code must be withdrawn, restore/deploy that reviewed application revision through the normal GitHub→Cloudflare path. The Phase 4B schema changes are additive and the old application does not depend on them.

### D1 Time Travel rollback

A Time Travel restore overwrites the database in place. Use it only when the effect of discarding all post-bookmark writes is explicitly accepted—preferably during the controlled migration window before real post-deploy user writes occur.

**DO NOT RUN YET**
```sh
npx wrangler d1 time-travel restore wwn-character-sheet-db --bookmark=RECORDED_PRE_MIGRATION_BOOKMARK --config wrangler.jsonc
```

After a restore, redeploy the previously approved application revision and repeat the baseline verification. If legitimate user writes occurred after the bookmark, stop and plan a data-preserving recovery instead of blindly using Time Travel.

## 9. Current production blockers

Phase 4B is not production-ready until all of these are satisfied:

- final reconciled branch validation passes;
- PR #1/code/SQL review receives explicit approval;
- production D1 identity and Time Travel bookmark are verified;
- required auth environment bindings and Google production callback are verified;
- the exact pending migration set is confirmed;
- legacy backfill count and intended claims are reviewed;
- the rollout operator is ready to execute the smoke/rollback plan.
