import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationName = "0012_campaign_npc_threat_stats.sql";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };

function run(args) { return execFileSync(wrangler, args, { cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }); }
function query(sql) {
  const output = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]));
  if (!Array.isArray(output) || output.some(result => result.success !== true)) throw new Error("D1 did not report a successful query.");
  return output.flatMap(result => result.results ?? []);
}
function applyOnlyReviewedMigration() {
  const root = mkdtempSync(join(process.cwd(), ".phase5c7-structured-npc-combat-"));
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
for (const baseline of ["0006_campaign_foundation.sql", "0010_campaign_live_sessions.sql", "0011_campaign_npc_templates.sql"]) {
  if (!applied.has(baseline)) throw new Error(`Production is missing baseline migration ${baseline}; Phase 5C.7 migration was not applied.`);
}
if (!applied.has(migrationName)) applyOnlyReviewedMigration();
const columns = new Set(query("PRAGMA table_info(campaign_npc_templates)").map(row => row.name));
for (const column of ["hit_dice", "attacks_per_main_action"]) if (!columns.has(column)) throw new Error(`campaign_npc_templates is missing ${column}.`);
console.log("Phase 5C.7 NPC threat-stat migration verified against the production database.");
