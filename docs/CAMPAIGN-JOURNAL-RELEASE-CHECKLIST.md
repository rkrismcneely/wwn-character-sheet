# Campaign Journal release gate

Journal development lives in PR #429 on `auto/journal-phase-1`. Do not merge or deploy before these checks.

## Prerequisites
- Confirm production D1 state, then apply `0003_campaign_journal` and `0004_campaign_journal_files` using the repository's migration procedure. Do not assume an unsuccessful or skipped run applied them.
- Verify the production Worker has the existing `DB` D1 binding and private `BUCKET` R2 binding.
- Keep the GitHub Actions spending limit unchanged. Run checks locally or after free minutes reset.

## Required checks
- Run `npm run typecheck`, `npm run lint`, and targeted Journal tests via `node --experimental-strip-types --test tests/journal*.test.mjs tests/legendkeeper-native.test.mjs` in a checkout with Node >= 22.13.
- Run the verified production build and inspect errors before merge.
- Confirm import previews, Obsidian ZIP/folder Markdown, LegendKeeper Markdown export, mixed image/PDF links, and malformed archives.
- Confirm reimport skips existing pages and that failed uploads can be retried without overwriting GM edits.
- Confirm simultaneous editing while attachments upload yields a conflict, preserving page content, title, and visibility.
- Confirm GM-only and selected-reader pages are unavailable to other players through lists, search, wiki links, and file downloads.
- Confirm files referenced from an allowed page can be downloaded by permitted players even when uploaded on another page; hidden links inside Markdown comments, code, or GM-only blocks must not grant access.
- Confirm cancelled imports and stale orphan cleanup do not delete referenced attachments.
- Confirm the GM can edit and inspect; players can read only pages intended for them.

## Release
- Record successful migration results and build/test results in PR #429.
- Merge and deploy using the existing pipeline only after prerequisites and checks pass.
- Smoke-test a GM session and a separate player session on production; verify files and permission boundaries again.
