# Browser Smoke Checks

Tales Without End has a deliberately small Chromium browser smoke suite for a few high-value user journeys that are difficult to protect with source-level or API-only tests.

## What it checks

The suite currently verifies:

1. the signed-out front door and authentication boundary render normally;
2. a character play-state edit survives immediate same-site navigation because autosave finishes before the sheet unmounts;
3. a campaign owner can create an invitation and a second synthetic account can redeem it with an owned character;
4. a linked character can open the active campaign map drawer and receive the map response.

These checks were chosen because they cross browser/UI, authentication, D1 persistence, and navigation boundaries that have caused or could cause real user-facing regressions.

## Data safety

The suite never connects to production D1 or R2 and never automates real OAuth.

`scripts/start-browser-smoke-worker.mjs`:

- builds on the normal production Worker artifact already created for the run;
- applies the checked-in migrations to a fresh temporary local D1 state directory;
- seeds synthetic users, sessions, characters, a campaign, and a map;
- starts the built Worker through local Wrangler;
- removes the temporary state when the worker stops.

The Better Auth secret, OAuth values, users, sessions, and campaign data used by the suite are test-only values.

## When it runs

`.github/workflows/browser-smoke.yml` is intentionally **not** part of every application PR.

It runs:

- manually with GitHub Actions `workflow_dispatch` when a release or risky change warrants an end-to-end check; and
- automatically only when the browser-smoke workflow/config/fixture/test files themselves change, so the suite cannot be edited without validating it.

This keeps Chromium installation and a second production build out of routine CI.

## Failure policy

There are no automatic Playwright retries. A failure should be diagnosed rather than repeatedly rerun unchanged.

Failure screenshots, traces, and the HTML report are uploaded for three days. If a failure is environmental, fix or defer the environment issue before retrying. If an assertion no longer represents desired product behavior, update or remove it instead of keeping a permanently noisy test.

## Running locally

From a clean checkout:

```sh
npm ci
npm install --no-save --package-lock=false @playwright/test@1.62.1
npx playwright install chromium
npm run build
npx playwright test --config=playwright.smoke.config.mjs
```

The local run uses `http://127.0.0.1:5173`, one of the application's explicitly trusted development auth origins.
