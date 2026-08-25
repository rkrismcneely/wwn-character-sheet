import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationName = "0010_campaign_live_sessions.sql";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };

function run(args) { return execFileSync(wrangler, args, { cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }); }
function query(sql) {
  const output = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]));
  if (!Array.isArray(output) || output.some(result => result.success !== true)) throw new Error("D1 did not report a successful query.");
  return output.flatMap(result => result.results ?? []);
}
function applyOnlyReviewedMigration() {
  const root = mkdtempSync(join(process.cwd(), ".phase5a1-live-sessions-"));
  try {
    const migrations = join(root, "migrations");
    mkdirSync(migrations, { recursive: true });
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrations, migrationName));
    const config = join(root, "wrangler.jsonc");
    writeFileSync(config, JSON.stringify({ name: "wwn-character-sheet", d1_databases: [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "./migrations" }] }, null, 2));
    run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", config]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]));
if (!JSON.stringify(info).includes(DATABASE_ID)) throw new Error("The resolved remote D1 database ID does not match production.");
const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const baseline of ["0006_campaign_foundation.sql", "0008_campaign_resources.sql", "0009_character_campaign_lifecycle.sql"]) {
  if (!applied.has(baseline)) throw new Error(`Production is missing baseline migration ${baseline}; live-session migration was not applied.`);
}
if (!applied.has(migrationName)) applyOnlyReviewedMigration();
const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name));
for (const table of ["campaign_sessions", "campaign_session_participants"]) if (!tables.has(table)) throw new Error(`Production is missing table ${table}.`);
const indexes = new Set(query("SELECT name FROM sqlite_master WHERE type = 'index'").map(row => row.name));
for (const index of ["campaign_sessions_one_active_idx", "campaign_sessions_campaign_started_idx", "campaign_session_participants_user_idx"]) if (!indexes.has(index)) throw new Error(`Production is missing index ${index}.`);
console.log("Phase 5A.1 live-session migration verified against the production database.");
