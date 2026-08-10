#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

node --check "${worker}"

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));

// Cloudflare's production bundle imports runtime-only modules such as
// `cloudflare:workers`, which Node cannot resolve outside workerd. Validate the
// emitted ESM structure statically here; the production build and Wrangler
// runtime smoke test exercise the actual Worker environment.
const source = await readFile(workerPath, "utf8");
const hasDefaultExport = /export\s+default\b/u.test(source)
  || /export\s*\{[^}]*\bas\s+default\b[^}]*\}/su.test(source);
const hasFetchHandler = /\bfetch\s*\(/u.test(source);
if (!hasDefaultExport || !hasFetchHandler) {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
NODE

echo "Validated Worker artifact: ESM syntax, default fetch handler, and hosting manifest are present."
