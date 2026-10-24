// Runs after the full test suite. Only Workers Builds for PR #429 can migrate
// this disposable preview database; local tests and production never do so.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

if (process.env.WORKERS_CI !== "1" || process.env.WORKERS_CI_BRANCH !== "auto/journal-phase-1") {
  console.log("Preview migration skipped outside PR #429's Cloudflare build.");
} else {
  const compiled = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
  assert.equal(compiled.name, "wwn-character-sheet");
  const preview = compiled.previews;
  assert.ok(preview, "Missing isolated Preview settings in compiled Worker config");
  const database = preview.d1_databases?.find(item => item.binding === "DB");
  assert.equal(database?.database_name, "twe-journal-pr429-preview");
  assert.equal(database?.database_id, "2b6fce4e-37ed-446e-a809-d9d90cb9e0e9");
  assert.equal(preview.r2_buckets?.find(item => item.binding === "BUCKET")?.bucket_name,
    "twe-journal-pr429-preview");
  assert.equal(preview.durable_objects?.bindings?.find(item =>
    item.name === "CAMPAIGN_LIVE_SESSION")?.class_name, "CampaignLiveSession");
  assert.ok(!preview.durable_objects.bindings.some(item => item.script_name),
    "Preview Durable Objects must not call an external production Worker");
  for (const forbidden of [
    "8e2bf197-e20f-4ea7-a86f-cab4e1a74699", "site-creator-r2", "taleswithoutend.com",
  ]) assert.ok(!JSON.stringify(preview).includes(forbidden), "Production resource in Preview settings");
  assert.ok(!preview.services?.length && !preview.routes?.length && !preview.triggers,
    "Preview must not have production services, routes, or triggers");
  mkdirSync(".wrangler", { recursive: true });
  const migrationPath = ".wrangler/journal-preview-migrations.json";
  writeFileSync(migrationPath, JSON.stringify({
    name: "twe-journal-pr429-preview",
    compatibility_date: compiled.compatibility_date,
    d1_databases: [{ ...database, migrations_dir: resolve("drizzle") }],
  }, null, 2) + "\n");
  console.log("Tests passed. Migrating ONLY twe-journal-pr429-preview; production is excluded.");
  execFileSync("npx", [
    "wrangler", "d1", "migrations", "apply", "twe-journal-pr429-preview",
    "--remote", "--config", migrationPath,
  ], { stdio: "inherit" });
}
