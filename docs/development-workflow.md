# Fast request-to-live workflow

This repository uses GitHub PRs as persistent, resumable task records. Routine one-line fixes do **not** require a separate GitHub issue. Larger work may use an issue to track multiple PRs.

**Mandatory:** existing `Validate` status on a PR; Cloudflare Workers Builds deploys main.

**Asynchronous, not a PR gate:** `Verify Production Release` checks the actual live SHA and homepage, then publishes the `TWE Production` commit status. Read this commit status for definitive deployment confirmation. A missing or pending status is not success. Avoid repeated polling.

**Visual UI review:** Do it on demand for layout/interaction changes using a browser or Cloudflare preview, before merge where available. Do not add browser setup, screenshot generation, or a new mandatory CI job to all requests. This avoids slowing server-only and documentation changes. Track any missing visual verification in the PR.

**Task handoff:** The PR must specify observable acceptance criteria, modified behavior, checks, any live-verification limitation, and links to screenshots if relevant. This information is independent of any single chat.

**Performance:** Compare elapsed Actions job times and Cloudflare build times before adding caches or changing runner jobs. Cloudflare Build cache was enabled in the dashboard on 2026-10-27. Measure warm vs cold builds rather than assuming a speed-up.

**Integrity:** Never merge failing checks or change tests solely to hide regressions. Avoid multiple automatic deployers.
