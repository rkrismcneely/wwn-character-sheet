# Tales Without End Production Recovery

This document is the recovery runbook for production user data.

Production data is split across:

- **D1** database `wwn-character-sheet-db` (`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`)
- **R2** bucket `site-creator-r2` for uploaded portraits and campaign map images

GitHub is the source of truth for application code, but it is **not** a backup of D1/R2 user data.

## Recovery model

### D1

Cloudflare D1 Time Travel is the primary point-in-time recovery mechanism. Cloudflare currently supports restoration by timestamp or bookmark. The available history depends on the Workers plan; Cloudflare documents up to 30 days on paid plans and 7 days on free plans.

A D1 restore overwrites the production database in place and cancels in-flight queries. Never automate a restore from normal CI/deployment.

### R2

Tales Without End stores uploaded portraits and campaign map images under opaque, unique keys. When an already-committed media object is replaced or removed, the application copies it to a private `recovery/` prefix before deleting the live key.

If the recovery copy cannot be written, the application keeps the original live object instead of risking irreversible deletion.

Temporary uploads that never successfully committed to D1 are not recovery data and may still be deleted normally.

Recovery objects should expire automatically after **35 days**. This gives enough margin to cover D1's maximum 30-day Time Travel window without retaining old user media indefinitely.

## One-time R2 lifecycle configuration

Configure the production bucket so recovery objects expire after 35 days:

```bash
npx wrangler r2 bucket lifecycle add site-creator-r2 twe-recovery-expiry recovery/ --expire-days 35
```

Verify the rule after applying it:

```bash
npx wrangler r2 bucket lifecycle list site-creator-r2
```

Do **not** create a lifecycle rule for the ordinary portrait or campaign-map prefixes. Active media can be older than 35 days and must not expire merely because of age.

## Before any production recovery

1. Identify the incident and the last known-good time as precisely as possible, preferably in UTC/RFC3339 form.
2. Stop making unrelated production changes until recovery is complete.
3. Record the current application commit and Cloudflare Worker version.
4. Capture the current D1 bookmark before changing anything:

```bash
npx wrangler d1 time-travel info wwn-character-sheet-db --config wrangler.jsonc
```

5. Take an emergency SQL export of the current database state. This gives an additional snapshot of the state immediately before recovery:

```bash
mkdir -p recovery-artifacts
npx wrangler d1 export wwn-character-sheet-db \
  --remote \
  --config wrangler.jsonc \
  --output="recovery-artifacts/d1-before-restore-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

Keep recovery exports private. They contain user data and must never be committed to GitHub.

## Preview the intended D1 restore point

Ask Cloudflare for the bookmark corresponding to the last known-good timestamp:

```bash
npx wrangler d1 time-travel info wwn-character-sheet-db \
  --timestamp="2026-10-04T15:30:00Z" \
  --config wrangler.jsonc
```

Replace the example timestamp with the actual incident recovery point.

Do not proceed until the timestamp/bookmark has been independently checked.

## Restore D1

D1 Time Travel restore is destructive to the current database state. Run it only after the pre-restore bookmark and SQL export above have been captured.

Restore by timestamp:

```bash
npx wrangler d1 time-travel restore wwn-character-sheet-db \
  --timestamp="2026-10-04T15:30:00Z" \
  --config wrangler.jsonc
```

Or restore by the previously inspected bookmark:

```bash
npx wrangler d1 time-travel restore wwn-character-sheet-db \
  --bookmark="BOOKMARK_FROM_INFO_COMMAND" \
  --config wrangler.jsonc
```

Record the bookmark Cloudflare reports for undoing the restore.

## R2 after a D1 restore

A D1 restore can make older portrait/map keys authoritative again. Those older objects may have already been moved into the private `recovery/` prefix by normal application cleanup.

Recovery copies are stored under keys shaped like:

```text
recovery/<original-source-key>/<retired-at>-<recovery-id>
```

Each recovery object also records:

- `tweRecoverySourceKey`
- `tweRecoveryRetiredAt`

If a restored D1 record references media that no longer exists at its original key:

1. Locate the newest appropriate recovery object for that exact source key from before/around the incident.
2. Copy its bytes back to the original source key.
3. Preserve the original HTTP content metadata when restoring it.
4. Verify the portrait/map through the normal authenticated application route.

Do not delete the recovery copy manually; allow the 35-day lifecycle rule to expire it.

## Verification after recovery

Verify only the affected areas first, then a small representative sample:

- affected characters load and save normally
- affected portraits display
- affected campaigns and maps load
- affected campaign memberships/permissions are intact
- one unaffected character and campaign still work
- authentication still works
- production health endpoint/site responds normally

If the restore was wrong, use the pre-restore bookmark captured at the start to return D1 to the previous state.

## What this protects against

This recovery model is designed primarily for:

- accidental or buggy D1 writes/deletions discovered within the Time Travel window
- accidental portrait deletion/replacement
- accidental campaign map deletion/replacement
- a bad deployment or migration that corrupts recent database state

It does **not** replace an off-provider disaster-recovery archive. A future requirement for backups retained longer than the D1 Time Travel window should use periodic D1 exports to separate protected storage, not GitHub source control.

## Safety rules

- Never test a restore against production just to prove credentials work.
- Never commit SQL exports or recovered user media to GitHub.
- Never run D1 Time Travel restore automatically from CI.
- Never broaden an R2 lifecycle rule to active media prefixes.
- Prefer leaving an orphaned object behind over deleting committed media without a verified recovery copy.
- Record the incident timestamp, pre-restore bookmark, restore target, and post-recovery verification result.
