# Tales Without End Roadmap

_Last reconciled against `main` at `fc852d57` on 2026-10-04._

This is a **forward-only roadmap**. Completed work belongs in Git history, merged PRs, and the compact TWE current-state documents, not in this file. When an item is merged and production-verified, remove it from the roadmap rather than leaving a permanent completed checklist.

## Current baseline

- `main` is the code source of truth.
- Cloudflare Git Integration is the normal automatic production deployment path for `main`.
- `.github/workflows/deploy-production.yml` is manual fallback only.
- GitHub Actions CI is intentionally focused on pull requests/manual validation; do not add duplicate post-merge validation without a concrete reason.
- There are currently **no open pull requests**.
- The application already includes the character sheet/builder, authentication and ownership, private campaigns, campaign invitations, GM/NPC tooling, shared maps/scenes, tokens, square/hex grids, fog, live-session/initiative tooling, shared rolls, campaign stores, companions, and the major rules/content audits completed to date. Do not recreate these as future roadmap items.

---

## Now — highest-value remaining work

### 1. Complete one real production campaign invite/join smoke test

The owner/GM **Invite Player** action, invitation creation API, `cminv_...` link/code flow, and owner permission coverage are implemented and production-deployed. What remains is one deliberate two-account production smoke test that verifies the entire user journey:

- owner sees **Invite Player**
- invitation is created successfully
- second account can follow the invitation and join
- roster/membership updates correctly
- linked-character permissions remain correct
- no unrelated campaign or character data is changed

Do this once when two suitable accounts are available; do not turn it into a repetitive production-data test.

### 2. Data safety and recovery

- Document and test a backup/recovery procedure for persisted D1 character/campaign data and R2-backed uploaded assets.
- Improve user-facing recovery from optimistic-save conflicts and interrupted/network-failed saves.
- Add production-safe error reporting with an explicit privacy and retention policy.

### 3. Import duplicate protection

Add a conservative pre-import duplicate warning without weakening the existing safe import ownership/privacy model. A warning should require a strong match rather than merely sharing a character name, and users must still be able to intentionally import another copy.

An old draft implementation was closed rather than merged because it was based on a much older `main`; reimplement against current code if this is prioritized.

### 4. Small browser smoke coverage

If browser automation is worth its ongoing cost, add a **small** smoke suite for the highest-value user journeys:

- signed-out routing and sign-in entry points
- public/private character access boundaries
- create/open/edit/save/export/import character
- campaign create/open and invitation/join flow
- link/replace a campaign character
- open Map and Store from a linked character
- one representative live-session/map interaction
- one narrow mobile overflow/navigation check

Keep this intentionally small. Prefer manual/release-cadence or carefully scoped CI execution over a large browser matrix on every trivial change. An old Playwright draft was closed rather than rebased because it predates substantial current architecture.

---

## Reliability, accessibility, and UX consistency

- Continue fixing concrete accessibility/mobile issues as they are observed.
- Standardize Escape/outside-click dismissal for modal/popout surfaces where inconsistent behavior is still reproducible. Reimplement this against current components rather than reviving the old stale overlay PR.
- Add automated accessibility/visual checks only where they provide stable signal; avoid a large always-on visual matrix unless experience proves it valuable.
- Keep iPhone/iPad/Safari layout verification in the release/audit checklist because responsive regressions are more likely there than in ordinary desktop testing.

---

## Campaign / VTT expansion

The core VTT foundation already exists. Future work should extend it rather than rebuilding maps, tokens, grids, fog, initiative, shared rolls, stores, or character-to-campaign integration.

Potential next expansions:

- map drawing and annotation tools
- richer map layers/overlays
- dynamic lighting / line-of-sight if the complexity is justified
- campaign notes, handouts, journals, and lore organization
- deeper mobile/tablet actual-play UX
- further encounter/session conveniences only when a concrete play need is identified

Treat these as product choices, not mandatory scope. Prefer small useful additions over turning Tales Without End into an unnecessarily heavy VTT.

---

## Visual polish backlog

- Re-check the current live dark-theme background before doing more art work. If the armillary sphere still has the known geometry issue around the vertical prime-meridian band, correct that specific problem rather than restarting the whole background design.
- Continue visual/UX cleanup only for concrete observed problems; do not maintain vague permanent redesign tasks.

---

## Longer-term platform ideas

Only after the WWN experience is stable and the remaining reliability work is in good shape:

- architecture/content support for other **Without Number** games
- additional campaign organization tools justified by actual play
- broader import/export/interoperability improvements where there is a real user need

---

## Development efficiency rules

1. **Use the smallest useful source of truth first.** Read the compact TWE state/decision/workflow files and the relevant current source/PR before searching archived chats or scanning the repository broadly.
2. **Batch related work.** Group related code reads, edits, tests, and GitHub queries rather than making repeated tiny passes.
3. **Validate proportionally to risk.** Start with the narrowest relevant tests/static checks. Escalate to broader suites only when the change can plausibly affect those areas.
4. **A test must earn its cost.** Never blindly rerun a test that predictably fails. Determine whether it reveals a real regression. Fix meaningful failures; update/remove stale or no-signal tests; stabilize or replace flaky tests.
5. **Avoid duplicate CI/deploy work.** Do not run the same full validation before and after merge without a specific reason, and do not maintain two automatic production deployment mechanisms when one is sufficient.
6. **Do not retry unchanged failures.** Runner shortages, exhausted credits, authentication problems, and unchanged failing commands should be diagnosed or deferred until the condition changes rather than repeatedly retried.
7. **Use PRs when review/CI adds value.** Documentation-only or similarly low-risk maintenance can be committed directly when repository rules allow it and doing so avoids pointless CI usage.
8. **Production verification should be targeted.** Verify the user-facing behavior affected by a release rather than repeatedly smoke-testing unrelated features.
