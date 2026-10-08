# Tales Without End Roadmap

_Last reconciled against `main` after PR #289 on 2026-10-08._

This is a **forward-only roadmap**. Completed work belongs in Git history, merged PRs, and the compact TWE current-state documents, not in this file. When an item is merged and production-verified, remove it from the roadmap rather than leaving a permanent completed checklist.

## Current baseline

- `main` is the code source of truth.
- Cloudflare Git Integration is the normal automatic production deployment path for `main`.
- `.github/workflows/deploy-production.yml` is manual fallback only.
- GitHub Actions CI is intentionally focused on pull requests/manual validation; do not add duplicate post-merge validation without a concrete reason.
- There are currently **no unfinished product-code PRs**.
- The application already includes the character sheet/builder, authentication and ownership, private campaigns, tested campaign invitations/joining, GM/NPC tooling, shared maps/scenes, tokens, square/hex grids, fog, annotations, rules-accurate measured area/spell templates, live-session/initiative tooling, shared rolls, campaign stores, companions, and the major rules/content audits completed to date.
- Character import was intentionally removed and is not future scope unless explicitly reconsidered.
- The character autosave/navigation data-loss bug is fixed and production-deployed.
- Failed/interrupted cloud character saves now keep account-scoped, per-character browser recovery drafts. Same-version drafts can restore to the original safely; newer-server conflicts cannot overwrite the original and can instead be preserved as a new private character, downloaded, or discarded. Ordinary failed saves retry once when browser connectivity returns.
- D1/R2 recovery safeguards are production-deployed: D1 Time Travel is documented, retired committed R2 media is preserved before deletion, and the private recovery prefix has retention/expiry protection.
- A focused Chromium browser smoke suite is implemented. It uses disposable local data and is manual/release-oriented; it does **not** run on ordinary application PRs.
- Production-safe structured error reporting is deployed with privacy-preserving browser/server diagnostics and broad request/body logging disabled.
- Map/Store drawer keyboard, focus-return, and mobile touch-target accessibility improvements are deployed; continue fixing concrete accessibility/mobile issues as observed.
- Rules Search has completed its current overhaul: section-level SRD retrieval, WWN concepts/synonyms, controlling/supporting rule ranking, contextual drill-down, related-rule navigation, confidence/ambiguity handling, and a broad benchmark at 97% Top-1 / 100% Top-3.

---

### Focused browser smoke policy

The implemented smoke suite covers the highest-value boundaries:

- signed-out front door/auth boundary
- character edit -> immediate navigation -> confirmed persistence
- failed character save -> browser-local recovery -> safe restore
- owner invitation -> second synthetic account joins with a character
- linked character opens the campaign map drawer

Keep it small. It uses one Chromium worker, disposable local D1 data, no production credentials, no real OAuth, and zero automatic retries. Run it manually for releases/risky cross-boundary changes; it auto-runs only when its own test/workflow infrastructure changes so the suite cannot rot silently.

---

## Campaign / VTT expansion

The core VTT foundation already exists. Future work should extend it rather than rebuilding maps, tokens, grids, fog, initiative, shared rolls, stores, annotations, or character-to-campaign integration.

Other potential expansions:

- richer map layers/overlays
- dynamic lighting / line-of-sight if the complexity is justified
- campaign notes, handouts, journals, and lore organization
- deeper mobile/tablet actual-play UX
- further encounter/session conveniences only when a concrete play need is identified

Treat the remaining expansion bullets as product choices rather than mandatory scope. Prefer small useful additions over turning Tales Without End into an unnecessarily heavy VTT.

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
