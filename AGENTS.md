# Tales Without End — agent working agreement

## Goal
Turn a natural-language request into a tested change and confirm the exact release on https://taleswithoutend.com with as little user intervention and elapsed time as possible.

## Workflow
1. Inspect the relevant code and existing tests before changing anything. Reuse existing patterns and honor the user's current request.
2. For substantive work, record the task and its acceptance criteria in the PR description. A PR is the durable task record; do not require a separate GitHub issue for every small fix.
3. Make the smallest safe change on a branch; add focused regression coverage for confirmed bugs. Never weaken or delete tests merely to get a passing check.
4. Use existing required CI. Run affected tests first when practical; broaden validation for shared code, data migrations, authorization, or uncertain impacts.
5. Merge only after the required Validate check passes. Keep Cloudflare Workers Builds as the sole automatic deployer.
6. Confirm production using the **TWE Production** commit status / live release marker. **Merged is not live**. If verification is unavailable or failed, report that explicitly and link the PR and commit.
7. Summarize findings, code changes, tests, merge SHA, and live status clearly. Do not keep polling GitHub at high frequency or claim work will continue in ChatGPT after the response ends.

## Product and safety
- Preserve existing campaigns, NPCs, character sheets, imports, and player-created content.
- Be particularly cautious with Worlds Without Number mechanics, permissions, auth, storage, migrations, and untrusted imported Markdown.
- Respect player vs GM visibility; avoid leaking GM-only information.
- Prefer minimal UI copy and unobtrusive controls. Follow established responsive styles and accessibility patterns.
- For visible UI changes, inspect relevant screenshots and test layout/interaction in a browser when browser access or a preview is available. If not, state that visual review is outstanding. Do not make screenshots a mandatory gate for non-UI changes.
- Avoid adding paid services, mandatory review stages, additional deployment systems, or unnecessary builds without evidence of a benefit.

## Handoff
The PR title, description, commits, checks, and deployment status are the source of truth across chats and agent sessions. Record specific repro steps, acceptance criteria, and notable residual risks in the PR description.
