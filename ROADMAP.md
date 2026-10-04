# Tales Without End Roadmap

_Last reconciled against production `main` after PR #273 on 2026-10-04._

This is a **forward-only roadmap**. Completed work belongs in Git history, merged PRs, and the compact TWE current-state documents, not in this file. When an item is merged and production-verified, remove it from the roadmap rather than leaving a permanent completed checklist.

## Current baseline

- `main` is the code source of truth.
- Cloudflare Git Integration is the normal automatic production deployment path for `main`.
- `.github/workflows/deploy-production.yml` is manual fallback only.
- GitHub Actions CI is intentionally focused on pull requests/manual validation; do not add duplicate post-merge validation without a concrete reason.
- There are currently **no unfinished product-code PRs**.
- The application already includes the character sheet/builder, authentication and ownership, private campaigns, tested campaign invitations/joining, GM/NPC tooling, shared maps/scenes, tokens, square/hex grids, fog, live-session/initiative tooling, shared rolls, campaign stores, companions, and the major rules/content audits completed to date.
- Character import was intentionally removed and is not future scope unless explicitly reconsidered.
- The character autosave/navigation data-loss bug is fixed and production-deployed.
- D1/R2 recovery safeguards are production-deployed: D1 Time Travel is documented, retired committed R2 media is preserved before deletion, and the private recovery prefix has retention/expiry protection.
- A focused Chromium browser smoke suite is implemented. It uses disposable local data and is manual/release-oriented; it does **not** run on ordinary application PRs.

---

## Now — highest-value remaining reliability work

### 1. Save/network failure recovery

The immediate navigation-before-autosave data-loss bug is fixed. Improve the less common failure cases without replacing the working save model unnecessarily:

- make save failure/conflict states unmistakable to the player
- consider a small local pending-draft fallback for edits that could not be confirmed online
- recover cleanly after temporary network loss without overwriting a newer server version
- preserve the existing optimistic-version conflict protection
- add focused regression coverage only for concrete failure modes we actually support

### 2. Production-safe error reporting

Add enough observability to diagnose real production failures without collecting unnecessary user content.

Before enabling any third-party or persistent reporting, explicitly define:

- which errors/events are collected
- whether character/campaign content is excluded or redacted
- retention period
- who can access reports
- how authentication/session identifiers are handled

Prefer compact structured diagnostics over broad request/body logging.

### 3. Accessibility and cross-device release verification

- Continue fixing concrete accessibility/mobile issues as they are observed.
- Standardize Escape/outside-click dismissal for modal/popout surfaces where inconsistent behavior is still reproducible. Reimplement against current components rather than reviving an old stale overlay branch.
- Keep iPhone/iPad/Safari layout verification in the release/audit checklist.
- Add automated accessibility/visual checks only where they provide stable signal; avoid a large always-on visual matrix.

### Focused browser smoke policy

The implemented smoke suite covers four high-value boundaries:

- signed-out front door/auth boundary
- character edit -> immediate navigation -> confirmed persistence
- owner invitation -> second synthetic account joins with a character
- linked character opens the campaign map drawer

Keep it small. It uses one Chromium worker, disposable local D1 data, no production credentials, no real OAuth, and zero automatic retries. Run it manually for releases/risky cross-boundary changes; it auto-runs only when its own test/workflow infrastructure changes so the suite cannot rot silently.

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
- export/interoperability improvements where there is a real user need

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
9. **Browser automation stays intentionally small.** Do not expand the smoke suite into a broad always-on matrix unless repeated real regressions justify the added cost.
