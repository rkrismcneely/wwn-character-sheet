# Production Data Recovery

This runbook covers recovery for Tales Without End production data stored in Cloudflare D1 and R2.

## Production resources

- D1 database: `wwn-character-sheet-db`
- D1 database ID: `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`
- R2 bucket: `site-creator-r2`
- Worker: `wwn-character-sheet`

Never substitute a similarly named database or bucket without first verifying the production identifier.

## Recovery model

### D1

D1 Time Travel is the primary point-in-time recovery mechanism. Cloudflare currently retains Time Travel history for up to 30 days on Workers Paid plans and 7 days on Workers Free plans. Check the current Cloudflare plan/limits before assuming a recovery window.

Time Travel restore is destructive: it overwrites the production database in place and cancels in-flight queries. Do not run a restore as a diagnostic step.

### R2

Current portraits and campaign-map backgrounds live in R2. When a committed portrait or map background is replaced or removed, Tales Without End first copies the old object to a private recovery key under:

`recovery/<original-object-key>/<timestamp>-<random-id>`

Only after the recovery copy succeeds does the application delete the original committed key. If the recovery copy fails, the original object is deliberately left orphaned rather than deleted.

Recovery objects are not served by the normal portrait/map routes.

Rollback cleanup for a newly uploaded object that never committed to D1 remains a direct delete; those temporary objects never represented durable user state.

## Required R2 retention configuration

The repository includes the manual workflow:

`.github/workflows/configure-r2-recovery.yml`

Run it once after the recovery code is deployed. It configures the `recovery/` prefix with:

- a 30-day R2 bucket lock (`twe-recovery-30d`)
- a 31-day lifecycle expiration (`twe-recovery-expire`)

The one-day gap ensures lifecycle cleanup cannot race the retention lock. Cloudflare bucket locks take precedence over lifecycle deletion.

The workflow is manual-only and uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets. If the token lacks permission to edit R2 bucket configuration, the workflow should fail without changing application data; grant the minimum required R2 configuration permission before retrying.

To inspect the rules manually without changing them:

```bash
npx wrangler r2 bucket lock list site-creator-r2
npx wrangler r2 bucket lifecycle list site-creator-r2
```

## D1 incident procedure

### 1. Stop and identify the incident time

Determine the latest known-good UTC timestamp as accurately as possible. Do not restore merely because data looks suspicious; first distinguish an application display problem from actual persisted-data corruption or deletion.

### 2. Record the current bookmark before any restore

```bash
npx wrangler d1 time-travel info wwn-character-sheet-db --config wrangler.jsonc
```

Save the current bookmark somewhere outside the terminal scrollback. This is the rollback point for undoing a mistaken restore.

### 3. Resolve the intended historical bookmark without changing data

```bash
npx wrangler d1 time-travel info wwn-character-sheet-db \
  --timestamp="2026-10-04T12:00:00Z" \
  --config wrangler.jsonc
```

This is read-only. Verify that the requested timestamp is inside Cloudflare's current Time Travel retention window.

### 4. Plan matching R2 recovery before restoring D1

A historical D1 state may reference portrait/map object keys that have since been retired. For every affected original R2 key, look under the corresponding prefix:

`recovery/<original-object-key>/`

Choose the recovery object whose timestamp matches the desired database state.

Do not delete recovery copies during an incident.

### 5. Restore D1 only after explicit approval

```bash
npx wrangler d1 time-travel restore wwn-character-sheet-db \
  --bookmark="<VERIFIED_BOOKMARK>" \
  --config wrangler.jsonc
```

Cloudflare will warn that the operation overwrites production data. Confirm only after the current bookmark, target bookmark, incident time, and affected users/campaigns have all been recorded.

### 6. Restore any referenced R2 objects

Download the selected recovery copy to a temporary local file:

```bash
npx wrangler r2 object get \
  "site-creator-r2/recovery/<original-object-key>/<recovery-object>" \
  --remote \
  --file ./twe-recovery-object
```

Then put it back at the exact original key referenced by restored D1 data:

```bash
npx wrangler r2 object put \
  "site-creator-r2/<original-object-key>" \
  --remote \
  --file ./twe-recovery-object \
  --content-type "<original-content-type>"
```

Use the original image MIME type (`image/png`, `image/jpeg`, `image/webp`, or `image/gif` as appropriate). Portrait and map object keys include extensions that help identify the type.

Delete the local temporary file after verification.

### 7. Verify narrowly

Verify the specific affected character/campaign first:

- character/campaign loads
- expected fields are restored
- portrait/map loads if relevant
- ownership/privacy is unchanged
- no unrelated recent user data was accidentally rolled back

Only then expand verification to broader smoke checks.

### 8. Undo if necessary

D1 Time Travel restore returns/retains the previous bookmark. If the chosen recovery point was wrong, restore to the bookmark recorded in step 2.

## R2-only incident procedure

If D1 is correct but a portrait/map object is missing:

1. Record the missing original key from D1/application diagnostics.
2. Find the matching object under `recovery/<original-object-key>/`.
3. Download that recovery object.
4. Re-upload it at the exact original key with the original MIME type.
5. Verify the affected page.
6. Leave the recovery copy in place until lifecycle expiration.

Do not alter D1 for an R2-only incident.

## What this protects against

- accidental character/campaign database deletion or corruption within the D1 Time Travel window
- accidental replacement/removal of committed portrait images
- accidental replacement/removal/deletion of committed campaign map backgrounds
- application cleanup mistakes that would otherwise permanently delete an old R2 object

## What this does not protect against

- recovery beyond D1's Time Travel retention window
- deliberate deletion of recovery objects by a Cloudflare administrator after their lock expires
- total account compromise
- application data stored outside D1/R2
- a future R2 write path that bypasses the shared recovery helper

If longer-than-Time-Travel retention becomes necessary, add a separate periodic D1 export to independent storage rather than silently extending this procedure.

## Safety rules

- Never test recovery by restoring production.
- Never run a D1 restore without recording the current bookmark first.
- Never remove or weaken the `recovery/` bucket lock during an active incident.
- Prefer restoring the smallest affected surface; do not roll back the whole database for an isolated R2 object loss.
- Do not expose recovery-prefix objects through public application routes.
- Keep recovery operations manual and explicit; they should not run automatically from a deployment.
