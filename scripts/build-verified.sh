#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

# Include a public release marker in the same build Cloudflare deploys.
# CI, Cloudflare Git Integration and manual deployments all use this script.
release_sha="$(git -C "${SITES_PROJECT_ROOT}" rev-parse HEAD 2>/dev/null || true)"
if [[ "${release_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  printf '{"commit":"%s"}\n' "${release_sha}" > "${SITES_PROJECT_ROOT}/public/twe-build-version.json"
fi

build_started=$SECONDS
echo "[build] Checking source syntax before bundling..."
node "${script_dir}/preflight-source.mjs"
echo "[build] Source preflight: $((SECONDS - build_started))s"

rm -rf "${SITES_PROJECT_ROOT}/dist"

compile_started=$SECONDS
echo "[build] Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

echo "[build] Vinext compilation: $((SECONDS - compile_started))s"
artifact_started=$SECONDS
node "${script_dir}/strip-legacy-wrangler-env.mjs"

"${script_dir}/validate-artifact.sh"

echo "[build] Artifact validation: $((SECONDS - artifact_started))s"
echo "[build] Total npm run build: $((SECONDS - build_started))s"
