import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

// This additive migration must run before the Worker exposes the processing job API.
const migrationName = "0049_recap_explicit_confirmation.sql";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };

function run(args) {
  return execFileSync(wrangler, args, {
    cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
  });
}
function query(sql) {
  const result = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]));
  if (!Array.isArray(result) || result.some(row => row.success !== true)) throw new Error("Remote D1 verification failed.");
  return result.flatMap(row => row.results ?? []);
}
const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]));
if (!JSON.stringify(info).includes(DATABASE_ID)) throw new Error("Production D1 ID mismatch; no changes made.");

const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const prerequisite of ["0048_recap_only_automation.sql"]) {
  if (!applied.has(prerequisite)) throw new Error("Required migration missing: " + prerequisite);
}
if (!applied.has(migrationName)) {
  const root = mkdtempSync(join(process.cwd(), ".recap-manual-confirmation-migration-"));
  try {
    const migrations = join(root, "migrations");
    mkdirSync(migrations, { recursive: true });
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrations, migrationName));
    const config = join(root, "wrangler.jsonc");
    writeFileSync(config, JSON.stringify({
      name: "wwn-character-sheet",
      d1_databases: [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "./migrations" }],
    }, null, 2));
    run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", config]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const nowApplied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
if (!nowApplied.has(migrationName)) throw new Error("Explicit recap confirmation migration not recorded.");
const cols=new Set(query("PRAGMA table_info(campaign_recap_audio_summary_jobs)").map(row=>row.name));
if(!cols.has("confirmed_at"))throw new Error("Confirmed recap column is missing.");
if(!query("SELECT name FROM sqlite_master WHERE type='index' AND name='campaign_recap_audio_summary_confirmed_idx'").length)
  throw new Error("Confirmed recap scheduler index was not created.");
console.log("Manual Auto Summarize consent migration applied and verified.");
