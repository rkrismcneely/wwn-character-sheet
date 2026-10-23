# Production deployment handover

Ordinary production deployments currently belong to Cloudflare Git Integration. The repository now stores the already-tested `dist/` bundle from PR CI for seven days and includes a guarded GitHub deployment workflow.

**Do not set `TWE_GITHUB_DEPLOYS_PRODUCTION=true` while Cloudflare Git auto-deployment is enabled.** The guarded workflow will not publish until the variable is set.

To switch without two competing publishers:

1. In Cloudflare, disable automatic Git-based deployment of this Worker while retaining the Worker, bindings, routes, databases, and secrets.
2. In GitHub repository Settings → Secrets and variables → Actions → Variables, create `TWE_GITHUB_DEPLOYS_PRODUCTION` with value `true`.
3. For a recently merged PR (where its squash-merge commit is still the current `main` HEAD), run **Deploy verified CI artifact** with its PR number and successful PR CI workflow run ID.
4. Verify the workflow publishes the retained Worker bundle and confirms the squash-merge SHA on `/twe-build-version.json`.

The workflow checks the PR was merged, the tested head SHA matches its successful PR CI run, and the merge is still the current `main` HEAD. It refuses missing/expired artifacts and stale releases. No second application build occurs; only npm dependencies are installed for the Wrangler CLI. The build identity marker is adjusted to the squash commit after download.

**Remaining automation:** When ownership is successfully switched, update the GitHub workflow to trigger the verified-artifact deployment automatically after each safe merge, and route migrations through their existing migration workflows. Do not turn that on until the Cloudflare handover succeeds. Rollback currently requires a deliberate, tested redeployment of an older release rather than an unverified automatic rollback.
