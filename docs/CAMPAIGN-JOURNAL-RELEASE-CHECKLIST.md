# Campaign Journal release checklist — PR #429

Development branch: `auto/journal-phase-1`. Production remains on `main`. Do not merge, publish production, or apply production migrations without explicit approval.

## Verified in Codespaces (24 October 2026)

- Pulled the generated-Wrangler `legacy_env` removal fix; Wrangler is pinned to 4.152.0 with the lockfile.
- `npm run validate:journal`: TypeScript, ESLint (existing warnings only), 748 source tests, production build/artifact verification, and four rendered/local Worker tests passed. No tests skipped.
- The authenticated Journal runtime test uses real local D1 migrations and R2: GM/player authorization, hidden parents, selected readers, nested secret redaction, private and shared attachment reads, conditional deletion, missing-file write rejection, and competing folder moves.
- Added SQLite and conversion regressions for atomic cleanup/moves, recovery on storage failure, bounded D1 parameters, escaped table pipes, multi-document resource mentions, and relative Markdown links.
- Real LegendKeeper sample exports are exercised via `TWE_JOURNAL_SAMPLE_DIR` in the runtime test. The actual native JSON imported 84 notes; the ZIP imported 53 notes. Both passed authenticated import/reimport tests. The JSON has no unresolved wiki links. The ZIP has 22 resolvable links and 15 references to eight absent target pages (including undefined.md); those are reported as unresolved rather than redirected to incorrect content. Samples stay outside the repository. This mode also checks GM-only defaults, repeat-import idempotency and preservation of GM edits.

The npm 10.9.2 lockfile compatibility repair adds the nested Workers Types 4 peer required by the Vite plugins older Wrangler; existing dependency versions are unchanged. npm 10 clean-install compatibility is verified separately from the npm 11 Codespaces environment.

## Cloudflare isolation

Preview builds track `auto/journal-phase-1`. Build command: `npm run typecheck && npm run lint && npm test`. Preview command: `npx wrangler preview --config dist/server/wrangler.json`.

| Binding | Production | PR preview |
| --- | --- | --- |
| DB | wwn-character-sheet-db / 8e2bf197-e20f-4ea7-a86f-cab4e1a74699 | twe-journal-pr429-preview / 2b6fce4e-37ed-446e-a809-d9d90cb9e0e9 |
| BUCKET | site-creator-r2 | twe-journal-pr429-preview |
| CAMPAIGN_LIVE_SESSION | Production namespace | auto-journal-phase-1 namespace |

The preview helper validates generated bindings before applying migrations to the isolated preview D1 only. Production build/deploy commands remain `npm run build` and `npx wrangler deploy --config dist/server/wrangler.json`. No production secrets were copied into the preview.

Preview URL: https://auto-journal-phase-1-wwn-character-sheet.rkrismcneely.workers.dev

## Production database and publication gate

Read-only dashboard inspection found 33 applied migrations through `0032_campaign_session_recaps.sql`, and no Journal tables. Exactly these two additive migrations are pending:

- `drizzle/0003_campaign_journal.sql`: Journal entries, selected readers, constraints and indexes.
- `drizzle/0004_campaign_journal_files.sql`: attachment metadata and index.

Both create new tables/indexes and do not alter existing campaign or character rows. The filename prefixes overlap historical migration numbers; D1 tracks the complete filename, and all migrations apply successfully in local runtime tests. Production D1 Time Travel has a seven-day recovery window. Capture a fresh bookmark immediately before any approved migration.

Production publication order, **after explicit approval**:

1. Reconfirm exact PR head validation, main/base status, and the two pending migration filenames.
2. Capture the current D1 recovery bookmark; use the guarded production migration script with the exact production database ID.
3. Verify Journal tables, indexes and foreign keys, then merge the reviewed PR. Cloudflare builds production from `main`.
4. Smoke-test existing character/campaign features and Journal GM/player permissions. A Worker rollback alone does not remove additive schema; preserve Journal data.

The remote preview has no OAuth/authentication secrets configured. Signed-in preview UI smoke testing requires separately authorized preview credentials/callback configuration; local authenticated HTTP coverage does not establish touch/drag-and-drop visual behavior. Do not reuse production credentials or seed real user sessions to bypass this gate.

GitHub Actions quota failures are not application test failures. Do not dispatch/retry hosted Actions.

## October 25 follow-up release

- The Journal editor's reversible new-page templates and compact Insert menu are committed on `main`.
- The sibling-ordering UI is also on `main`, but requires the additive `drizzle/0033_campaign_journal_order.sql` migration before persistent reordering can work. Journal reads include a compatibility fallback until migration is applied.
- Rebuild from the latest `main` through the configured Cloudflare Git integration. Verify the live build SHA and the editor controls after deployment.
- Do not consider persistent manual ordering production-verified until the D1 migration and a reorder/readback test have succeeded.

## October 25 GM Dividers and sidebar release

- PR #434 and PR #433 passed CI and were merged to `main`.
- GM Dividers do not require a database migration.
- Sidebar resize, preference saving and expand/collapse do not require the new schema; manual sibling-order persistence requires `drizzle/0033_campaign_journal_order.sql` on the production D1 database.
- Do not mark ordering production-verified until the migration is applied and an actual reorder/reload check passes.
