// Cloudflare Workers Builds preview command for Campaign Journal PR #429.
// Run only after typecheck, lint and npm test succeed. Never deploy production.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const branch = process.env.WORKERS_CI_BRANCH;
assert.equal(branch, "auto/journal-phase-1", "This preview is restricted to PR #429's branch");
const database = {
  binding: "DB",
  database_name: "twe-journal-pr429-preview",
  database_id: "2b6fce4e-37ed-446e-a809-d9d90cb9e0e9",
  migrations_dir: resolve("drizzle"),
};
const bindings = {
  vars: { ENVIRONMENT: "preview" },
  d1_databases: [database],
  r2_buckets: [{ binding: "BUCKET", bucket_name: "twe-journal-pr429-preview" }],
  durable_objects: {
    bindings: [{ name: "CAMPAIGN_LIVE_SESSION", class_name: "CampaignLiveSession" }],
  },
  images: { binding: "IMAGES" },
};
const compiled = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
assert.equal(compiled.name, "wwn-character-sheet");
assert.ok(compiled.main, "Missing compiled Worker entry");
// Build a fresh allowlist configuration. No production resource IDs, routes,
// custom domains, services, or secrets may enter the preview artifact.
const preview = {
  name: compiled.name,
  main: compiled.main,
  compatibility_date: compiled.compatibility_date,
  compatibility_flags: compiled.compatibility_flags,
  assets: compiled.assets,
  migrations: compiled.migrations,
  // Top-level bindings also use test resources as defense in depth.
  ...bindings,
  previews: bindings,
};
const previewPath = "dist/server/wrangler.preview.json";
writeFileSync(previewPath, JSON.stringify(preview, null, 2) + "\n");
const serialized = readFileSync(previewPath, "utf8");
for (const forbidden of [
  "8e2bf197-e20f-4ea7-a86f-cab4e1a74699", "site-creator-r2", "taleswithoutend.com",
]) assert.ok(!serialized.includes(forbidden), "Production resource in preview configuration");
mkdirSync(".wrangler", { recursive: true });
const migrationPath = ".wrangler/journal-preview-migrations.json";
writeFileSync(migrationPath, JSON.stringify({
  name: "twe-journal-pr429-preview",
  compatibility_date: compiled.compatibility_date,
  d1_databases: [database],
}, null, 2) + "\n");
console.log("Applying migrations ONLY to twe-journal-pr429-preview; production is excluded.");
execFileSync("npx", [
  "wrangler", "d1", "migrations", "apply", database.database_name,
  "--remote", "--config", migrationPath,
], { stdio: "inherit" });
// The app's locked Wrangler remains unchanged. Use the official current CLI
// for the new Worker Previews API, which older locked versions may not expose.
execFileSync("npx", [
  "--yes", "wrangler@latest", "preview",
  "--config", previewPath, "--name", "journal-pr429",
], { stdio: "inherit" });
