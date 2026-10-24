#!/usr/bin/env bash
# CI-agnostic validation. Run after npm ci using an isolated test machine or
# Cloudflare Workers Builds. Never invokes GitHub-hosted Actions.
set -euo pipefail
node --version
npm run typecheck
npm run lint
files=(tests/*.test.mjs)
source_tests=()
for file in "${files[@]}"; do
  if [[ "$file" != "tests/rendered-html.test.mjs" ]]; then
    source_tests+=("$file")
  fi
done
node --experimental-strip-types --test "${source_tests[@]}"
npm run build
node --experimental-strip-types --test tests/rendered-html.test.mjs
echo "Journal release validation passed for commit $(git rev-parse HEAD)"
