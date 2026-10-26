# Tales Without End releases

## Production owner

**Cloudflare Workers Builds** is the sole routine production publisher. It builds the GitHub `main` branch and publishes the Worker. GitHub Actions' older `Deploy Production` and `Deploy verified CI artifact` workflows are manual fallbacks, **not** evidence that a new `main` commit shipped. Do not enable their automatic push triggers while Cloudflare Git integration is active.

## Before publishing

Prefer one short-lived feature branch and one reviewed/validated merge into `main`, rather than repeated partial commits directly to `main`. The existing PR CI runs TypeScript checks, lint, source tests, a production Worker build, and integration tests. A direct commit to `main` bypasses those PR checks; avoid it for application changes. A GitHub branch-protection or repository ruleset requiring the CI `Validate` status check is necessary to enforce this; repository YAML alone **cannot** prevent direct pushes.

The Cloudflare build runs `npm run build`. Its first step now runs `npm run preflight` and fails fast on malformed TypeScript/JSX syntax. The existing build still validates the output Worker artifact. Enable dependency/install caching in Cloudflare Workers Builds settings where supported and confirm the build command is `npm run build`; do not configure a second production deployer.

## Verify production

Each production build embeds its Git SHA at `/twe-build-version.json`.

- `npm run verify:live` reports the exact live commit and checks the public homepage.
- `npm run verify:live -- FULL_40_CHARACTER_SHA` fails unless production matches that commit.
- The \`Verify production availability\` workflow runs after application changes reach \`main\`, waits for Cloudflare to publish the exact SHA, and checks the homepage. It reports failure if that release cannot be confirmed.\n- A successful GitHub commit or Cloudflare build **does not** by itself establish that the new version is live. Report the state as committed, built, deployed, and verified separately.

For a failed or stalled deployment, use Cloudflare Workers Builds build logs, not the obsolete GitHub `Deploy Production` run list. Confirm that the configured production branch is `main` and that production build watch paths include application source and scripts.

## Database migrations

Production D1 migrations are a separately authorized deployment operation using `scripts/migrate-production.mjs`; Workers Builds must **not** apply migrations implicitly. Additive schema changes must remain compatible with the previous live Worker and be applied before enabling the dependent feature. Verify the applied schema and take a backup before destructive changes. The Store proprietor migration `drizzle/0037_store_proprietors.sql` is **not** confirmed applied; the application currently checks for its columns and hides those editor controls when unavailable.

## Fast feedback

Use targeted checks during editing (`npm run preflight` for syntax, relevant tests for behavior). For normal application releases, prefer existing PR CI for typecheck, lint, full/reduced test scope and production build. A Cloudflare build must never be reported as successful without a provider build result, and exact live SHA verification should follow deployment.

## One-time GitHub settings

Configure a branch ruleset for `main` (Settings → Rules → Rulesets): require a pull request before merging, require the `Validate` status check, and block force pushes/deletion. To preserve the existing trusted auto-shipping workflow, do not require human reviews for routine changes; enable repository auto-merge in Settings → General → Pull Requests if available. Check that the repository's Actions settings allow workflows to create and approve pull requests as needed. Only apply a ruleset after confirming the existing `Ship approved PRs after CI` automation can merge under it; otherwise automatic shipping will stall. `main` must not accept direct pushes from the assistant once enforced.

## One-time Cloudflare settings

In Workers & Pages → `wwn-character-sheet` → Settings → Builds, verify Git integration points at this repository, production branch `main`, build command `npm run build`, and caching is enabled where available. Disable any second automatic production deployer. Confirm `/twe-build-version.json` reflects the newly deployed SHA. Configuration names vary by Cloudflare UI version.
