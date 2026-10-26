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
- A successful GitHub commit or Cloudflare build **does not** by itself establish that the new version is live. Report the state as committed, built, deployed, and verified separately.

For a failed or stalled deployment, use Cloudflare Workers Builds build logs, not the obsolete GitHub `Deploy Production` run list. Confirm that the configured production branch is `main` and that production build watch paths include application source and scripts.

## Database migrations

Production D1 migrations are a separately authorized deployment operation using `scripts/migrate-production.mjs`; Workers Builds must **not** apply migrations implicitly. Additive schema changes must remain compatible with the previous live Worker and be applied before enabling the dependent feature. Verify the applied schema and take a backup before destructive changes. The Store proprietor migration `drizzle/0037_store_proprietors.sql` is **not** confirmed applied; the application currently checks for its columns and hides those editor controls when unavailable.

## Fast feedback

Use targeted checks during editing (`npm run preflight` for syntax, relevant tests for behavior). For normal application releases, prefer existing PR CI for typecheck, lint, full/reduced test scope and production build. A Cloudflare build must never be reported as successful without a provider build result, and exact live SHA verification should follow deployment.
