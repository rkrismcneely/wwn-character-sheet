# Playwright smoke tests

The browser smoke suite supplements the existing Node and built-Worker regression tests. It is intentionally small and Chromium-only.

## Runtime

Playwright runs against the production Vinext artifact through local `wrangler dev`. The server script applies the checked-in migrations to a new temporary D1 state directory, seeds deterministic fixtures, and starts `dist/server/wrangler.json`. This exercises the same workerd-backed Worker entry point used by the existing runtime tests rather than a Node-only application server.

## Authentication and data safety

The fixtures contain synthetic User A, User B, and administrator accounts, signed Better Auth sessions, and private/public/unlisted characters. Browser contexts receive locally signed fixture cookies directly. There is no test login route or production-enabled auth bypass.

The Worker uses a disposable local D1 database and placeholder local OAuth values. The suite does not use production credentials, production D1, or production R2. Failure traces can contain only these synthetic fixture cookies and are retained briefly by CI for debugging.

## Running locally

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Playwright builds the production Worker before starting its isolated local runtime. Reports are written to `playwright-report/` and failed-test screenshots/traces to `test-results/`.
