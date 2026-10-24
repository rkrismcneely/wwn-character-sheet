#!/usr/bin/env bash
# Upgrade Wrangler and regenerate package-lock.json together.
# Requires a network-enabled checkout with npm access. Never deploys.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f package-lock.json || ! -f package.json ]]; then
  echo "Run this script from the TWE repository checkout." >&2
  exit 1
fi
node -e 'const p=require("./package.json");if(!p.devDependencies?.wrangler)process.exit(1)'
npm install --save-dev --save-exact wrangler@4.152.0 --no-audit --no-fund
node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
const manifest=JSON.parse(fs.readFileSync("package.json","utf8"));
const lock=JSON.parse(fs.readFileSync("package-lock.json","utf8"));
assert.equal(manifest.devDependencies.wrangler,"4.152.0");
assert.equal(lock.packages[""].devDependencies.wrangler,"4.152.0");
assert.equal(lock.packages["node_modules/wrangler"].version,"4.152.0");
console.log("Wrangler manifest and lockfile agree at 4.152.0.");
NODE
npm ci --ignore-scripts --no-audit --no-fund
echo "Dependency lock verified. Review changes and commit package.json + package-lock.json."
