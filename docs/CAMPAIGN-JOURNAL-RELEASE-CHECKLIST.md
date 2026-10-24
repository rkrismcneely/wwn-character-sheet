# Campaign Journal release gate (GitHub Actions minutes exhausted)

Journal development lives in PR #429 on `auto/journal-phase-1`. Keep it unmerged until the gates below pass. Production deployment is owned by Cloudflare Workers Builds on `main`; GitHub-hosted Actions are **not** available and failed/queued Actions jobs must not be treated as an application test result.

## Confirmed blockers as of October 24, 2026

- **Cloudflare Preview CLI compatibility:** `package.json` pins `wrangler@4.92.0`, but current Worker Previews require `wrangler >=4.135.0`. Upgrade Wrangler together with `package-lock.json` using an npm-capable environment; don't alter only the manifest and leave a broken `npm ci`. See https://developers.cloudflare.com/workers/previews/get-started/
- **Cloudflare dashboard unknown:** Confirm the existing Worker has preview builds enabled and (if needed) the one-way transition to Worker Previews has been made. Validate non-production branch settings, secrets, D1/R2 resources and Durable Objects before building.
- **No trustworthy CI execution:** Five GitHub-hosted jobs failed without meaningful test execution after Actions minutes were exhausted. They do not establish lint, TypeScript or test failures/successes.
- **Native LegendKeeper:** converter and UI are committed, but no full committed-source end-to-end test has executed on an authorized checkout. Confirm table rendering, path-specific wiki links, strict GM secret access and real JSON reimport behavior.
- **Folder moves:** cycle-safe backend, drag/drop UI and selector are committed; validate cross-campaign isolation, real D1 persistence, touch operation and concurrent editing.
- **Production database:** pending D1 migrations and actual binding availability must be checked before merging.
- **Production remains unchanged:** do not merge, run production migrations or publish without passing gates.

## Free/off-Actions validation

Use an authorized local checkout or an already available free external build machine; **do not** dispatch/retry paid GitHub Actions jobs. Requires Node >= 22.13, npm and the build script's GNU `timeout` dependency.

```sh
npm ci --prefer-offline --no-audit --no-fund
npm run typecheck
npm run lint
node --experimental-strip-types --test tests/journal*.test.mjs tests/legendkeeper-native.test.mjs
npm run build
node --experimental-strip-types --test tests/rendered-html.test.mjs
```

Do not claim success unless each command completes successfully. Record command output, environment and commit SHA on PR #429. Confirm journal icons, search, editor reset, SQLite persistence and permission tests run. If any check fails, fix and rerun before release.

## Production readiness (read-only verification first)

- Confirm deployment and journal branch are up to date with `main`.
- Inspect production D1 pending migrations. Confirm `0003_campaign_journal` and `0004_campaign_journal_files` have **not** been applied already before using the repository's guarded migration procedure.
- Verify the production Worker has `DB` D1 and private `BUCKET` R2 bindings. Matching declarations in `wrangler.jsonc` are not proof of live binding health.
- Before deployment, deliberately apply reviewed migrations using the repository's guarded procedure and record results. Do not assume a failed or skipped migration succeeded.
- Confirm Cloudflare Workers Builds is connected to `main`, uses the verified build command, and reports a successful build. Do not enable GitHub-hosted deployment as a fallback.

## Journal security and functional acceptance

- Preview and import Obsidian ZIP/folder Markdown and LegendKeeper Markdown exports; reject malformed archives and unsupported files.
- Import mixed images/PDF links; verify existing page reimports skip changes and failed uploads retry without overwriting GM edits.
- Concurrent attachment uploads and GM edits must give a conflict, preserving content, title, icon and visibility, including edits without a Markdown-body change.
- Verify GM-only and selected-player pages never leak through lists, search, wiki links, or file downloads.
- Cross-page referenced files are readable by authorized players, while comments, code blocks, and GM-only content never grant access.
- Cancelled imports and orphan cleanup must never delete referenced files.
- Test GM editing and a distinct player account's read-only access.

## Ship

Record validation, D1 migration and Cloudflare build evidence on PR #429. Merge only after the prerequisites pass; Cloudflare should deploy `main`. Check the production release marker and smoke-test GM and player sessions, attachments and access rules. Do not use exhausted GitHub Actions as a release gate.
