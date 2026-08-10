# Phase 4B Checkpoint — Resumed

**Status:** Resumed, still in progress  
**Feature branch:** `phase-4b-better-auth`  
**Implementation HEAD before this checkpoint documentation:** `f89348b62ac9e2a3ddd4f759c569f21e02280f32`  
**HEAD when sign-out work resumed:** `d7f462ee6079c34beda329d8d07ff4cbc8876539`  
**Draft pull request:** [#1 — Phase 4B: Better Auth, ownership, privacy, and stable character URLs](https://github.com/rkrismcneely/wwn-character-sheet/pull/1)  
**Checkpoint date:** 2026-08-08
**Resume date:** 2026-08-10
**Current verified auth baseline before reconciliation:** `adc492927d1e1ba608beaa04c4afb791e1820bac`
**Current `main` branding head reconciled:** `30890ee9c3d314103ac71d5c12fab1d325f9a2be`

This document remains the restart point for Phase 4B. The complete credentialed local Google sign-in → callback → authenticated UI → sign-out → refresh-signed-out → sign-in-again loop is verified on `adc492927d1e1ba608beaa04c4afb791e1820bac`. Do **not** merge this branch, apply production D1 migrations, or access/modify production D1 or R2 until the remaining review and production gates are explicitly approved.

## Current branch history

The Phase 4B implementation commits before this checkpoint are:

1. `80a0ce90573a3dd9f26e7611e43650758e34d5c3` — Implement Phase 4B auth, ownership, and private sharing
2. `d04063e` — Add Better Auth rate-limit compatibility migration
3. `c6ebd56` — Add Better Auth verification/schema compatibility migration
4. `502e840d` — Fix Google sign-in button wiring
5. `6c5ce59` — Prove and directly wire the rendered Google sign-in controls
6. `f89348b62ac9e2a3ddd4f759c569f21e02280f32` — Map Better Auth runtime to generated D1 schema

The last four corrective changes were made after manual local testing exposed Better Auth/SQLite naming and rendered-control issues. They are intentionally additive and must stay on this feature branch until the full Phase 4B review is approved.

## Migrations currently present

- `drizzle/0000_brainy_killraven.sql` — existing `characters` and `character_revisions` tables
- `drizzle/0001_better_auth_core.sql` — Better Auth `user`, `session`, `account`, `verification`, and `rate_limit` tables
- `drizzle/0002_character_ownership_and_claims.sql` — additive ownership, visibility, opaque public-ID, portrait-key, and legacy-claim schema
- `drizzle/0003_better_auth_rate_limit_compatibility.sql` — additive `rateLimit` / `lastRequest` compatibility table and data copy
- `drizzle/0004_better_auth_verification_camel_case_compatibility.sql` — additive camelCase compatibility columns and backfills for Better Auth tables

Local D1 has had the Phase 4B migrations applied during manual testing. No production D1 migration has been applied. The later field mappings in `lib/auth.ts` direct Better Auth back to the generated snake_case schema; the additive compatibility migrations remain non-destructive and preserve previously created local records.

## Better Auth configuration

- Package: Better Auth `1.6.25`
- Entry: `lib/auth.ts`
- Route base path: `/api/auth`
- Provider: Google only
- Email/password: disabled
- Secure session and database-backed rate limiting: enabled
- OAuth account tokens: encrypted
- Cross-subdomain cookies: disabled
- CSRF and origin checks: enabled
- User/session/account/verification/rate-limit field mappings explicitly target the generated snake_case D1 columns.
- Trusted origins: `https://taleswithoutend.com`, `http://localhost:5173`, and `http://127.0.0.1:5173`.

Production configuration remains in `wrangler.jsonc` and is unchanged:

- D1 binding `DB` → `wwn-character-sheet-db` (`8e2bf197-e20f-4ea7-a86f-cab4e1a74699`)
- R2 binding `BUCKET` → `site-creator-r2`

Do not use the existing Cloudflare branch preview for write tests; it was found to be bound to production storage and lacks usable auth secrets.

## Local development and Google OAuth

Local development is deliberately isolated:

- Site URL: `http://localhost:5173`
- `BETTER_AUTH_URL=http://localhost:5173`
- Local credentials belong only in ignored `.dev.vars`, created from `.dev.vars.example`:
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- Local D1 command: `npm run db:migrate:local`
- Local development command: `npm run dev`
- Local R2 behavior is Wrangler's local emulation through the `BUCKET` binding.

Google OAuth must include:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `http://localhost:5173/api/auth/callback/google`

## Verified state

Manual local testing confirmed:

- Google sign-in opens successfully.
- The user can authenticate with Google and return to the local application.
- The rendered header and Character Library Google sign-in controls were runtime-proven to be real `<button type="button">` elements.
- Each proven control directly calls Better Auth; the local request reaches `POST /api/auth/sign-in/social` and redirects to Google.
- The local compatibility issues involving `rateLimit`, `verification`, and snake_case Better Auth fields have been addressed without editing already-applied migrations.
- Existing automated verification previously passed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run workers:types`
  - `npm run db:migrate:local`
  - production build and artifact validation
  - `npm test` — 63/63 tests passed

## Resolved bug: sign out

The only visible Sign out control is rendered directly by `Home` in `app/page.tsx`. Runtime diagnostics proved that it is a real, enabled, unobstructed `<button type="button">` and that the exact rendered control receives the click.

The prior control called a shared `signOut()` function that awaited `authClient.signOut()` and changed several sheet flags, but it did not explicitly refresh the Better Auth `useSession()` hook or expose failures. The server session could be invalidated while the signed-in navigation and owner-only controls remained stale until a page reload.

The proven rendered control now:

- logs `[auth-sign-out-button] direct click`,
- calls `authClient.signOut()` directly,
- surfaces returned or rejected Better Auth errors,
- immediately disables signed-in UI after a successful response,
- clears owner/edit state and returns the library to public scope,
- calls `refetchSession()` so the Better Auth client state agrees with the server,
- and refreshes the public library.

Local Worker runtime verification now confirms:

- `POST /api/auth/sign-out` returns `200 OK`,
- the response is `{ "success": true }`,
- `GET /api/auth/get-session` returns an authenticated user before sign-out and `null` afterward,
- the test session row is no longer usable after sign-out,
- signed-in navigation and owner-only controls are derived from the refreshed/locally invalidated session state,
- and a subsequent `POST /api/auth/sign-in/social` still returns `200 OK` with a Google authorization URL.

The local runtime proof is covered by `tests/rendered-html.test.mjs`; the direct rendered-control diagnostic was temporary and is not committed.

Keep all further verification local-only until a safe, isolated staging environment exists and has been explicitly approved.

## Resolved regression: signed-out header sign-in behind the Character Library modal

Phase 4B was resumed again from `e8ee56ea17558757d9d07e5a1c83c0d4055bf5ea` after a manual report that clicking **Sign in with Google** produced no browser Network request and no terminal request. History verification confirms `f89348b62ac9e2a3ddd4f759c569f21e02280f32` remains an ancestor of the branch. Comparing `f89348b` through `d7f462e` shows no `app/page.tsx` or auth-code changes; the only later auth/UI code change before `e8ee56e` is the sign-out state fix itself.

The header and Character Library sign-in handlers in `e8ee56e` are unchanged from the previously verified `f89348b` implementation. Temporary diagnostics were attached directly to the exact rendered `<button type="button">` controls:

- header: `[auth-header-sign-in] direct click` plus `Header sign-in clicked`,
- Character Library: `[auth-library-sign-in] direct click` plus `Library sign-in clicked`.

In an isolated local runtime of the exact `e8ee56e` source, both controls fired their unique diagnostic when unobstructed and both reached `POST /api/auth/sign-in/social`. Better Auth returned `200 OK`, `redirect: true`, and a Google authorization URL using the local callback `http://localhost:5173/api/auth/callback/google`. This rules out a lost handler, alternate JSX branch, stale `onClick`, `refetchSession()` suppression, or a Better Auth server/configuration regression in the committed source.

The reported no-request behavior was reproduced when the Character Library modal was open. `libraryOpen` defaults to true on the home page, and `.library-backdrop` is a fixed modal backdrop above the header. The header sign-in button was still rendered behind that backdrop, so the backdrop intercepted the pointer event before React could receive it. This exactly produces no click diagnostic, no Network request, and no terminal request. The Character Library's own Google sign-in control remains live inside the modal.

The fix is intentionally narrow: the header Google sign-in control now renders only when signed out **and** the Character Library modal is closed. While the modal is open, its own Google sign-in control is the active path; closing it exposes the header control, which still calls Better Auth directly. The `e8ee56e` sign-out implementation, `locallySignedOut`, and `refetchSession()` behavior are unchanged. `e8ee56e` did **not** directly alter either sign-in handler or introduce the modal backdrop; its immediate signed-out UI update can expose the signed-out state sooner after sign-out, but the underlying click interception was an existing modal/render interaction rather than an OAuth regression.

The rendered local-Worker tests now allow 90 seconds instead of 45 seconds because isolated Worker/D1 startup can exceed 45 seconds on CI runners. Assertions are unchanged; only the test startup allowance is increased.

After `adc4929`, manual testing with the real ignored local Google credentials completed the full Google login/callback/authenticated-return/sign-out/refresh/sign-in-again loop successfully. The reconciliation changes branding, documentation, migration coverage, and the administrative claim-creation failure path; it does not replace the verified Better Auth sign-in/sign-out/session handlers. Another credentialed Google login is not required unless automated auth/runtime checks expose a regression.

### Branding reconciliation completed

Current `main` branding through `30890ee9c3d314103ac71d5c12fab1d325f9a2be` is merged hunk-by-hunk into the Phase 4B integration history. `app/page.tsx` keeps `/assets/tales-without-end-navigation-logo.svg`, the `Tales Without End` header text, and all Phase 4B auth/ownership UI. `app/layout.tsx` keeps Phase 4B canonical/Open Graph metadata while using the exact browser title `Tales Without End - An Interactive Worlds Without Number Character Folio`. `app/globals.css` keeps both Phase 4B account/library/share rules and current responsive logo sizes. The requested title revision is 21/15/14px → 24/17/16px while retaining font weight, letter spacing, logo sizes, alignment, and no-wrap behavior.

The migration/backfill/claim/authorization/privacy audit and exact future production command order are in `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`. The key rollout effect remains deliberate: after `0002`, pre-account characters are private and unowned until explicitly claimed. Claim creation now reserves its private recovery token file before the administrative D1 mutation.

## Production gates still outstanding

- Do not merge PR #1.
- Do not apply any production migration.
- Do not run public-ID backfill or legacy claims in production.
- Do not write to production D1 or R2.
- Before production work: review the PR and migrations, confirm a recovery point/Time Travel, verify remote migration status with authenticated Cloudflare access, use isolated staging, and complete the authoritative production checklist in `docs/PHASE-4B-PRODUCTION-ROLLOUT.md`.
