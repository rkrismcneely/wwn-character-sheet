# Tales Without End Roadmap

_Last reconciled against `main` at `75155bc8` on 2026-10-03._

This is a **forward-only roadmap**. Completed work belongs in Git history, merged PRs, and the compact TWE current-state documents, not in this file. When an item is merged and production-verified, remove it from the roadmap rather than leaving a permanent completed checklist.

## Current baseline

- `main` is the code source of truth.
- Cloudflare Git Integration is currently the working production deployment path for `main`.
- GitHub Actions CI is intentionally PR/manual only; do not add duplicate post-merge validation without a concrete reason.
- The application already includes the character sheet/builder, authentication and ownership, private campaigns, GM/NPC tooling, shared maps/scenes, tokens, grids, fog, live-session/initiative tooling, shared rolls, campaign stores, companions, and the major rules/content audits completed to date. Do not recreate these as future roadmap items.

---

## Now — finish and clean up current work

### 1. Finish the class creation and advancement rules audit

**PR #269 — `Fix class creation and advancement rules audit`**

Complete the remaining validation/fixes for:

- Wise, Duelist, and Mageslayer hit-point exceptions
- Wise Polymath behavior
- repeatable Developed Attribute and Specialist selections with distinct targets
- Mageslayer's free Nullifier Focus accounting
- Wise's no-Effort handling
- Quick Learner's restricted saved-point behavior across advancement

The current branch typechecks and lints but still has a failing test run. Diagnose the failure before merging. If the failing test protects required behavior, fix the code or test correctly. If it is stale, flaky, or no longer asserts desired behavior, repair/replace/remove it rather than repeatedly paying to rerun a no-signal test.

### 2. Verify/fix the campaign-owner invitation UI

A production report found that a campaign owner/GM could not see the expected **Invite Player** action even though invitation APIs already existed. Re-verify this against the current production build. If still reproducible, restore an obvious owner/GM invitation action and complete the two-account join test afterward.

### 3. Clean up stale open PRs

- **PR #235 — Map/Store drawer rail:** later merged work superseded most of this branch. Decide only the remaining UX question: should the Map/Store launcher rail disappear while a drawer is open, or should the current Close Map / Close Store controls remain? Implement the chosen behavior on current `main` if necessary, then close the stale PR rather than merging its old branch.
- **PR #222 — unused EB Garamond 500 weight:** reapply the one-line unused font import removal against current `main` when convenient, then close the old branch/PR. Do not merge the long-stale branch as-is.

### 4. Rationalize CI and production deployment

Reduce build minutes, GitHub Actions credits, and duplicated work:

- Confirm Cloudflare Git Integration as the single normal production deployment path.
- Retire the redundant automatic GitHub Actions deployment workflow, or convert it to a manual emergency/fallback workflow only.
- Keep normal CI focused on pull requests and cancel superseded runs.
- Do not rerun infrastructure/runner/credit failures unless something relevant has changed.
- Prefer targeted validation for the files/features changed; reserve the full suite/build/Worker validation for changes where that breadth provides real confidence.
- Audit chronically failing or flaky tests. Tests must protect current desired behavior to justify their ongoing cost. Repair, replace, or remove tests that reliably produce noise without catching a meaningful regression.

---

## Reliability and recovery

These are the highest-value remaining platform-hardening tasks after the current blockers are cleared.

### Targeted browser smoke coverage

Add a **small** browser smoke suite for critical user journeys rather than a large matrix that runs on every change:

- sign in / sign out
- create, open, edit, save, export, and import a character
- campaign create/open and invitation/join flow
- link/replace a campaign character
- open Map and Store from a linked character
- one representative live-session/map interaction

Run broader cross-browser/device coverage manually or on an intentional release/audit cadence unless experience shows it is worth the recurring cost.

### Data safety and recovery

- Document and test a backup/recovery procedure for persisted character and campaign data.
- Improve user-facing recovery from optimistic-save conflicts and interrupted/network-failed saves.
- Add production-safe error reporting with an explicit privacy/retention policy.
- Add a pre-import duplicate warning/choice without weakening the existing safe import ownership/privacy model.

### Accessibility and responsive verification

Continue fixing concrete accessibility/mobile issues as they are found. Add automated checks only where they provide stable signal; avoid a large always-on visual matrix unless it proves useful.

---

## Campaign / VTT expansion

The core VTT foundation already exists. Future work should extend it rather than rebuilding maps, tokens, grids, fog, initiative, shared rolls, or character-to-campaign integration.

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
