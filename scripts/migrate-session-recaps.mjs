import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationName = "0032_campaign_session_recaps.sql";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };

function run(args) {
  return execFileSync(wrangler, args, {
    cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
  });
}
function query(sql) {
  const output = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]));
  if (!Array.isArray(output) || output.some(result => result.success !== true)) throw new Error("D1 query was not successful.");
  return output.flatMap(result => result.results ?? []);
}
function applyReviewedMigration() {
  const root = mkdtempSync(join(process.cwd(), ".session-recap-migration-"));
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

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]));
if (!JSON.stringify(info).includes(DATABASE_ID)) throw new Error("The remote D1 database ID does not match production.");

const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const baseline of ["0006_campaign_foundation.sql", "0008_campaign_resources.sql"]) {
  if (!applied.has(baseline)) throw new Error(`Required baseline migration missing: ${baseline}; no changes applied.`);
}
if (!applied.has(migrationName)) applyReviewedMigration();

const finalMigrations = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
if (!finalMigrations.has(migrationName)) throw new Error("Recap migration was not recorded in D1.");
const columns = new Set(query("PRAGMA table_info(campaign_session_recaps)").map(row => row.name));
for (const name of ["id", "campaign_id", "session_date", "title", "content", "created_at", "updated_at"]) {
  if (!columns.has(name)) throw new Error(`campaign_session_recaps is missing column ${name}`);
}
const indexes = new Set(query("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'campaign_session_recaps'").map(row => row.name));
if (!indexes.has("campaign_session_recaps_date_idx")) throw new Error("Recap date index was not created.");
console.log("Session recap D1 migration applied and verified.");
