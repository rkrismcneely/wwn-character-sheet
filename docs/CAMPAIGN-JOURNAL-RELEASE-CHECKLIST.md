# Campaign Journal release gate (GitHub Actions minutes exhausted)

Journal development lives in PR #429 on `auto/journal-phase-1`. Keep it unmerged until the gates below pass. Production deployment is owned by Cloudflare Workers Builds on `main`; GitHub-hosted Actions are **not** available and failed/queued Actions jobs must not be treated as an application test result.

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
