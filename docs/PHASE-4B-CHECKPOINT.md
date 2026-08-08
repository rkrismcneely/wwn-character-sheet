# Phase 4B Checkpoint — Paused

**Status:** Paused, still in progress  
**Feature branch:** `phase-4b-better-auth`  
**Implementation HEAD before this checkpoint documentation:** `f89348b62ac9e2a3ddd4f759c569f21e02280f32`  
**Draft pull request:** [#1 — Phase 4B: Better Auth, ownership, privacy, and stable character URLs](https://github.com/rkrismcneely/wwn-character-sheet/pull/1)  
**Checkpoint date:** 2026-08-08

This document is the restart point for Phase 4B. Do **not** merge this branch, apply production D1 migrations, or access/modify production D1 or R2 while resuming local authentication debugging.

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

These checks are historical confirmation at this checkpoint. Re-run the relevant checks after the next Phase 4B code change.

## Unresolved bug: sign out

**Sign out is not working in local manual testing.**

Clicking the visible Sign out control:

- produces no sign-out request in the terminal,
- does not prove that the rendered control reaches its intended handler,
- and leaves the signed-in session/UI state unresolved.

No speculative shared-handler change should be made first.

## Exact next debugging task

Trace the actual rendered **Sign out** control and its runtime click path using the same proof-first approach that resolved Google sign-in:

1. Identify the exact component and JSX line that render each visible Sign out control.
2. Temporarily replace each visible control's handler with a unique direct inline diagnostic:
   - `console.log(...)`
   - `window.alert(...)`
   - `type="button"`
   - no shared handler call in this first diagnostic step.
3. Build/run locally and prove which alert/log fires for each visible control.
4. Trace exactly how the current UI state or status is being set; inspect for duplicate JSX, stale component instances, click-capture handlers, overlays, form interception, optional props, and hydration issues.
5. Only after the real rendered path is proven, wire that exact element directly to Better Auth's current sign-out API.
6. Prove end to end:
   - the unique direct-click log,
   - an auth-call log,
   - the Better Auth sign-out request in the browser and terminal,
   - invalidated session after refresh,
   - and return to the signed-out UI.

Keep all of this local-only until a safe, isolated staging environment exists and has been explicitly approved.

## Production gates still outstanding

- Do not merge PR #1.
- Do not apply any production migration.
- Do not run public-ID backfill or legacy claims in production.
- Do not write to production D1 or R2.
- Before production work: review the PR and migrations, confirm a recovery point/Time Travel, verify remote migration status with authenticated Cloudflare access, use isolated staging, and complete the production checklist in `docs/phase-4b-review.md`.
