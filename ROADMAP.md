# Tales Without End Roadmap

_Last reconciled against `main` at `c25d0b86` on 2026-08-15._

This is the forward-looking project roadmap. Current source, automated tests, and merged
pull requests are its status authority. The Phase 4B checkpoint and rollout documents
preserve useful historical migration and production-review detail, but predate the
subsequent merged and deployed account work; they are not current status checklists.

## Status key

- ✅ Complete
- ◐ Partial / underway
- ⬜ Planned

## Recommended next work

- **Easiest meaningful task:** add explicit regression coverage for the full 18-item
  Henchkeeper archetype catalogue and its base-stat/modifier invariants. The behavior is
  implemented, but this would make accidental catalogue regressions immediately visible.
- **Highest-value task:** add a small Playwright browser smoke suite for the public
  landing/archive and the signed-in dashboard/owner route boundary. Current source and
  Worker tests are strong, but there is no browser E2E suite.
- **Recommended next task:** improve import duplicate-detection UX. Imports are already
  safe: they are authenticated, sanitized, and always create a fresh private record.
  A focused pre-import warning for an obvious duplicate would reduce accidental duplicate
  folios without changing ownership, authentication, or storage semantics.

---

## Phase 1 — Product polish, UX, and visual identity

### Completed

- ✅ Core responsive/mobile character-sheet pass, including header and rules-search
  behavior for narrow and tablet layouts.
- ✅ Amber Ledger / Company Archive visual system, typography, branded navigation mark,
  and Tales Without End metadata.
- ✅ Signed-out landing page at `/`, with responsive polish and the later
  large-screen density/spacing pass.
- ✅ Standalone public-character archive for signed-out browsing.
- ✅ Signed-in `/` experience is now a dense, responsive **My Characters** dashboard,
  not an immediate sheet load.
- ✅ Authenticated **Account** profile with an application-managed display name, Google
  name fallback, and unified signed-in navigation across characters and campaigns.
- ✅ General character-sheet usability work: labels, tooltips, confirmation affordances,
  counters, rules search, and printable/exportable folio workflows.

### Remaining

- ◐ Accessibility and responsive behavior are designed into current controls, but there
  is no automated browser accessibility or cross-browser visual test suite yet.
- ⬜ Continue UX simplification only when a concrete friction point is identified; do not
  retain a vague evergreen redesign task.

---

## Phase 2 — Rules accuracy and character-builder completeness

**Status: complete for the reconciled Phase 2 scope.** No confirmed Phase 2 feature
blocker was found in current source or tests.

| Item | Status | Evidence in current implementation |
| --- | --- | --- |
| Close Combatant | ✅ Complete | Explicit combat-skill choice handling in `app/phase2-rules.ts` and focus choice UI; covered by the SRD rules tests. |
| Any Combat | ✅ Complete | Background development resolves legal combat choices rather than treating the text as a passive label; covered by background/SRD tests. |
| Growth and Learning | ✅ Complete | `app/background-development.ts` models quick, selected-learning, and rolled growth/learning methods, saved rolls, attribute choices, and legacy normalization; covered by tests. |
| Developed Attribute | ✅ Complete | Repeatable focus targeting, duplicate-target prevention, eligibility limits, and derived attribute effects are implemented and tested. |
| Armored Magic | ✅ Complete | Eligibility is restricted to appropriate mage traditions and casting restrictions are evaluated against equipped armor/shields. |
| Polymath | ✅ Complete | Legal focus gating and non-combat skill floors are derived without overwriting purchased ranks; covered by tests. |
| Unarmed Combatant | ✅ Complete | Unarmed progression and damage/shock behavior are derived in the shared unarmed attack calculation; covered by tests. |
| Vowed | ✅ Complete | Vowed class data/progression, effort handling, magical unarmed progression, and Shock modifiers are integrated; progression and unarmed behavior are tested. |
| Wise | ✅ Complete | Wise is present as a selectable additional partial class with its arts and correct effort behavior; covered by class/rules tests. |
| Specialist | ✅ Complete | Repeatable focus targeting and legal non-combat skill selection are enforced; duplicate-target behavior is tested. |
| Permanent virtual Unarmed Attack | ✅ Complete | The shared derived attack is always available, excluded from inventory-owned weapon records, and cannot be stowed/dropped as equipment. It handles default, Unarmed Combatant, and Vowed cases. |
| Repeatable Spirit Familiar | ✅ Complete | Each legal focus pick maps to a distinct familiar slot/record; legacy data is reconciled safely and multiple selections are tested. |
| Henchkeeper support | ✅ Complete | Companion records include inventories, virtual unarmed attacks, weapons, HP, notes, level handling, and Henchkeeper count progression. |
| All 18 intended Henchkeeper archetypes | ✅ Complete | The current curated catalogue contains Athlete, Blacksmith, Guard, Courier, Thief, Artisan, Farmer, Sailor, Miner, Student, Engineer, Bookkeeper, Hunter, Hermit, Elder, Merchant, Noble, and Performer. |
| Henchkeeper stat spread and modifiers | ✅ Complete | Archetypes carry deliberately varied base stats; the requested +1/-1 modifiers are layered on those values rather than replacing the spread. |

### Rules status

- ✅ Current SRD rules tests cover the corrected focus interactions, unarmed attack
  variants, Spirit Familiar records, background development, class progressions, spells,
  arts, and gated selection behavior.
- ⬜ The only concrete Phase 2 hardening opportunity is a direct regression test that
  locks the 18-archetype catalogue and representative modifier calculations. It is not a
  missing player-facing rules feature.

---

## Phase 3 — Dice and play utilities

- ✅ Header d20 and 2d6 rollers.
- ✅ Reusable dice utility using `crypto.getRandomValues` and rejection sampling.
- ✅ Readable result presentation and subtle roll animation.
- ⬜ Add further table/play tools only when they support the character folio without
  turning it into an unfocused VTT surface.

---

## Phase 4A — Repository and deployment foundation

**Status: complete.**

- ✅ GitHub repository is the source of truth; development is no longer directed at the
  old ChatGPT-hosted site.
- ✅ Cloudflare Worker deployment, production custom domain, D1, and R2 integration.
- ✅ Git-based deployment process with checked production Worker artifact.
- ✅ GitHub Actions CI on pull requests to `main` and pushes to `main`: clean install,
  typecheck, lint, full tests, production build, and Worker artifact validation.
- ✅ Node 22.13.0 CI baseline, matching the repository engine requirement.
- ⬜ CI intentionally has no deployment or production-credential steps.

---

## Phase 4B — Accounts, ownership, privacy, and character URLs

**Status: complete implementation and deployed application capability.** Stateful production
migration/admin actions are operational records, not a checklist maintained in this roadmap;
do not infer their current data state from the older pre-rollout documents.

### Authentication and sessions

- ✅ Better Auth with Google sign-in, persistent D1-backed sessions, sign-out, and
  re-login flows.
- ✅ Custom Tales Without End display names are stored separately from Google identity
  and used by campaign roster/linked-character projections.
- ✅ Request-scoped Cloudflare Better Auth construction, avoiding module-scope binding and
  workerd async-context failures.
- ✅ Runtime binding guard and safe generic auth failure behavior.
- ✅ Public responses and URLs keep internal account identifiers, email addresses, and
  provider identifiers out of public output.

### Ownership, privacy, and sharing

- ✅ Server-enforced owner-only mutation for character data, deletion, portraits,
  visibility, export, and claims.
- ✅ Stable opaque `/character/chr_<id>` URLs for new/imported records and direct-route
  visibility enforcement.
- ✅ Private, unlisted, and public visibility states; public listing excludes private and
  unlisted records.
- ✅ Owner-scoped **My Characters** dashboard and public-character archive.
- ✅ Authenticated, sanitized imports create fresh private owner records and strip
  ownership/auth fields from inbound files.
- ✅ Secure hashed, expiring, single-use legacy claim tokens and a gated claim flow.
- ✅ Read-only administrator role with a privacy-safe **All Characters** view; all
  non-owner mutations remain denied.
- ◐ Import duplicate prevention is intentionally not implemented: importing the same file
  more than once creates separate safe private records. The planned next UX task is a
  warning/choice, not a change to that safety model.

---

## Phase 4C — Campaigns and sharing

**Status: private campaign workflow is deployed; production smoke verification remains underway.**

- ✅ Additive campaign schema/domain foundation: private campaign records, GM/player
  membership, multi-campaign character links, hash-only expiring/single-use invite state,
  opaque campaign IDs, and pure permission helpers. Migration 0006 is applied in
  production with existing character/account data preserved.
- ✅ Private campaign create/list/read/settings/delete APIs, privacy-safe member roster
  reads, and server-side member removal/leave services.
- ✅ Secure campaign invitation API/service foundation: seven-day hash-only player
  invites, non-consuming validation, atomic single-use membership plus selected-character
  redemption, and authorized revocation. Plaintext tokens are returned only at creation.
- ✅ Initial My Campaigns dashboard and private campaign-management UI: create, open,
  rename, roster, player removal/leave, and owner-confirmed deletion.
- ✅ Secure invitation UI and join flow: unmistakable cminv_ code creation/copy,
  character selection before redemption, seven-day expiry guidance, and fragment-based
  signed-out continuation through Google sign-in that avoids request logs.
- ✅ Owner-controlled character linking and shared campaign character library: at most
  one linked character per member per campaign, multi-campaign participation, and
  owner-only unlinking that preserve ownership and visibility.
- ✅ Campaign-scoped read-only character and portrait routes for members, GMs, and
  read-only site administrators; global visibility and direct character-route
  authorization remain unchanged.
- ⬜ Later sharing/VTT work: guest links, maps, notes, handouts, encounters, and realtime
  features.

---

## Phase 4D — Reliability, security, and production hardening

### Completed

- ✅ GitHub Actions validation gate for PRs and `main` pushes.
- ✅ Typecheck, lint, full automated tests, production build, and Worker artifact
  validation in CI.
- ✅ Migration compatibility/preservation tests and guarded production migration scripts.
- ✅ Authentication, authorization, visibility, ownership, legacy-claim, and
  admin-read-only regression coverage.
- ✅ Local built-Worker/runtime checks, including Better Auth/session route coverage.
- ✅ Optimistic version checks on character saves return a conflict instead of silently
  overwriting a concurrent update.
- ✅ Portrait endpoint validation and owner authorization are enforced server-side.

### Remaining

- ⬜ Playwright browser E2E smoke coverage, with failed-test screenshots/traces/logs.
- ⬜ Automated desktop/tablet/phone and Chromium/Firefox/WebKit visual/accessibility
  checks.
- ⬜ Production-safe smoke checks that use no real player data.
- ⬜ A documented, tested backup/recovery operational procedure.
- ◐ Character writes have optimistic conflict detection, but the user-facing conflict
  recovery/merge experience is not yet a dedicated workflow.
- ⬜ Structured application error reporting and a privacy/data-retention review.
- ⬜ Visual regression coverage for the landing page, dashboard, public archive, and
  character sheet.

---

## Phase 5 — Full VTT expansion

**Status: future.** Begin only after campaigns and the remaining production hardening are
stable.

- ⬜ Campaign dashboard, shared maps/scenes, tokens, fog of war, and initiative.
- ⬜ Shared dice rolls/history and character-to-token integration.
- ⬜ Notes, handouts, journals, campaign lore, and real-time multiplayer synchronization.
- ⬜ Mobile/tablet play support and architecture for other Without Number games.

---

## Development workflow

1. Treat current `main`, tests, and merged PRs as the project-status authority.
2. Keep application changes in focused branches and review them through pull requests.
3. Preserve Cloudflare bindings and production data unless a task explicitly authorizes a
   scoped operational change.
4. Let CI validate every PR; CI has no deployment side effects.
5. Verify deployed behavior after merges that affect routes, authentication, data, or UI.
