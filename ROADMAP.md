# Tales Without End Roadmap

This roadmap is the development plan for the project currently implemented in the repository
`rkrismcneely/wwn-character-sheet` and deployed at:

- Production: https://taleswithoutend.com
- Legacy fallback: https://wwn-character-sheet.rkrismcneely.workers.dev

GitHub is the source of truth. The old ChatGPT-hosted site is reference-only and must not receive
new development work.

## Status Key

- [x] Complete
- [ ] Planned
- [~] In progress or partly complete

---

## Phase 1 — Polish, UX, and Visual Identity

### Responsive design

- [x] Eliminate horizontal scrolling on mobile.
- [x] Improve phone layout for portrait and character details.
- [x] Make the search bar full width on mobile.
- [x] Improve iPad and Chrome layouts.
- [x] General responsive cleanup for narrow windows and small screens.

### Visual identity

- [x] Establish a consistent fantasy-inspired visual system.
- [x] Define font roles for display, heading, body, UI, and numeric text.
- [x] Refine borders, ornaments, spacing, and decorative elements.
- [~] Continue adapting the visual identity to the Tales Without End name and logo.
- [ ] Keep the design consistent across desktop, mobile, print/PDF, and a future iOS app.

### General UX

- [x] Improve tooltips, labels, confirmation dialogs, counters, and layout clarity.
- [x] Improve the rules search and expanded rule-result presentation.
- [x] Improve character-header controls and mobile behavior.
- [ ] Continue simplifying workflows where users currently need too many clicks.

---

## Phase 2 — Rules Accuracy and Character-Builder Completeness

### Rules corrections and validation

- [x] Review and correct rules behavior for:
  - Close Combatant
  - Any Combat
  - Growth and Learning
  - Developed Attribute
  - Armored Magic
  - Polymath
  - Unarmed Combatant
  - Vowed
  - Wise
  - Specialist
- [x] Add a permanent virtual Unarmed Attack where appropriate.
- [x] Confirm repeatable Spirit Familiar behavior.
- [x] Preserve legal gating for classes, Foci, spells, arts, skills, and attribute improvements.
- [x] Add or strengthen automated tests for corrected rule interactions.

### Companion support

- [x] Maintain Henchkeeper and Spirit Familiar support.
- [ ] Finalize the curated set of 18 Henchkeeper archetypes.
- [x] Preserve the existing varied base-stat spread style.
- [x] Apply only the specified +1/-1 archetype modifiers, regardless of base values.
- [x] Verify companion inventories, weapons, HP, notes, and level switching.

---

## Phase 3 — Dice and Play Utilities

- [x] Add header d20 and 2d6 rollers near AC and HP.
- [x] Use secure random generation with `crypto.getRandomValues`.
- [x] Use rejection sampling to avoid modulo bias.
- [x] Create a reusable dice utility.
- [x] Add subtle roll animation and readable results.
- [ ] Expand play utilities only where they support the character-sheet experience without clutter.

---

## Phase 4 — Online Platform Foundation

### Phase 4A — Repository and Deployment Foundation

**Status: Complete**

- [x] Move the editable source to `rkrismcneely/wwn-character-sheet`.
- [x] Make GitHub the source of truth.
- [x] Stop development on the old ChatGPT-hosted site.
- [x] Deploy through Cloudflare Workers.
- [x] Preserve the production D1 configuration:
  - Database: `wwn-character-sheet-db`
  - Database ID: `8e2bf197-e20f-4ea7-a86f-cab4e1a74699`
  - Binding: `DB`
- [x] Preserve the production R2 configuration:
  - Bucket: `site-creator-r2`
  - Binding: `BUCKET`
- [x] Connect GitHub changes to Cloudflare deployment.
- [x] Establish the production domain `https://taleswithoutend.com`.
- [x] Redirect `https://www.taleswithoutend.com` to the root domain.
- [x] Confirm ChatGPT can read and write the GitHub repository.
- [ ] Add automated browser testing and deployment checks as post-migration hardening.

### Phase 4B — Accounts, Ownership, Privacy, and Shareable Character URLs

**Status: In progress — Phase 4B is temporarily paused after successful local Google sign-in. Sign out remains unresolved and must be runtime-traced from the visible rendered control before more authentication changes. Production migration, production verification, and merging remain blocked pending review and approval. See `docs/PHASE-4B-CHECKPOINT.md`.**

#### Authentication

- [~] Add Better Auth Google sign-in and sign-out. Local Google sign-in succeeds; sign out is unresolved and Phase 4B is temporarily paused pending runtime click-path tracing. Production OAuth remains a post-approval check.
- [x] Use established Better Auth Google authentication instead of building password storage.
- [x] Add generated Better Auth user records and secure cookie sessions in D1.
- [x] Keep internal account identifiers separate from public-facing identifiers.
- [x] Do not expose usernames, email addresses, Google IDs, or internal user IDs in public URLs, metadata, API responses, portrait paths, exports, or other public identifiers.

#### Character ownership

- [~] Link every new and imported character to an owner account. Existing characters remain safely unowned until explicitly claimed after migration review.
- [x] Enforce ownership on the server for edits, deletion, portraits, visibility changes, and protected exports.
- [x] Prevent one user from editing or deleting another user's character.
- [x] Add hashed, expiring, one-time claim tokens and guarded admin commands for characters created before accounts exist.

#### Privacy and visibility

- [x] Add character visibility states:
  - Private — owner only
  - Unlisted — viewable by anyone with the link
  - Public — viewable by link and eligible for public listings
- [x] Ensure an unlisted link grants view access only, never edit access.
- [x] Ensure private character data is never returned to unauthorized users.

#### Unique character URLs

- [~] Give every character a stable, unique URL in the browser address bar. New records are automatic; legacy records need the reviewed public-ID backfill.
- [x] Use a cryptographically random, opaque 128-bit public character identifier rather than a username, email, sequential database ID, or easily guessed number.
- [x] Use the route:
  - `https://taleswithoutend.com/character/chr_<opaque-id>`
- [x] Keep the URL stable when the character is renamed.
- [x] Support direct links, browser bookmarks, history navigation, and easy sharing.
- [x] Make URL access respect the character's visibility setting.
- [x] Design login, routing, database schema, API authorization, import, portrait handling, and migration around stable opaque IDs.

#### Account library and portability

- [x] Add a My Characters view.
- [x] Retain a separate Public Characters view and search.
- [x] Add account-based import and owner-only export.
- [x] Preserve compatibility with v1, v2, and legacy bare character JSON files while stripping ownership/auth fields.
- [~] Retain export-version metadata and make imports fresh private records. Additional duplicate-detection UX remains planned.

### Phase 4C — Campaigns and Sharing

- [ ] Create campaigns.
- [ ] Invite players.
- [ ] Add GM and player roles.
- [ ] Link characters to campaigns.
- [ ] Add campaign-specific permissions.
- [ ] Add a shared campaign library.
- [ ] Allow GMs to view campaign-linked characters without automatically receiving unrestricted ownership.
- [ ] Support view-only sharing and future campaign-aware character URLs.
- [ ] Prepare for campaign maps, notes, handouts, encounters, and other VTT features.

### Phase 4D — Reliability, Security, and Production Hardening

- [ ] Add Playwright end-to-end browser testing.
- [ ] Add GitHub Actions for build, lint, unit tests, artifact validation, and browser tests.
- [ ] Test desktop, phone, tablet, Chromium, Firefox, and WebKit layouts.
- [ ] Add screenshots, traces, console logs, and network logs for failed tests.
- [ ] Use dedicated test D1 and R2 resources for destructive automated testing.
- [ ] Add production-safe smoke tests.
- [ ] Add revision and conflict handling.
- [ ] Add safe database migrations.
- [ ] Add database backup and recovery procedures.
- [ ] Add protection against accidental deletion.
- [ ] Validate portrait file type, file size, and ownership.
- [ ] Add structured logging and error reporting.
- [ ] Review privacy and data-retention practices.
- [ ] Add accessibility checks and keyboard-navigation testing.
- [ ] Add visual regression testing for key responsive layouts.

---

## Phase 5 — Full VTT Expansion

This phase begins only after accounts, ownership, campaigns, and production hardening are stable.

- [ ] Campaign dashboard.
- [ ] Shared maps and scenes.
- [ ] Tokens and token ownership.
- [ ] Fog of war and visibility controls.
- [ ] Initiative and encounter tracking.
- [ ] Shared dice rolls and roll history.
- [ ] Character-to-token integration.
- [ ] Notes, handouts, journals, and campaign lore.
- [ ] Real-time multiplayer synchronization.
- [ ] GM permissions and player permissions.
- [ ] Mobile and tablet play support.
- [ ] System architecture that can eventually support other Without Number games.

---

## Development Workflow

For every future change:

1. Read the current source from `rkrismcneely/wwn-character-sheet`.
2. Make changes only in that repository.
3. Preserve the existing Cloudflare D1 and R2 bindings.
4. Commit and push completed work to GitHub.
5. Let Cloudflare build and deploy the change.
6. Test the Cloudflare deployment.
7. Do not publish or checkpoint changes to the old `chatgpt.site` site.

For small, low-risk changes, direct commits to `main` are acceptable.

For larger or riskier changes:

1. Create a feature branch.
2. Build and test the change there.
3. Use a preview deployment where available.
4. Merge only after approval.
