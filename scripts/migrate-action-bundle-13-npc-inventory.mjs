import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationName = "0018_action_bundle_13_npc_inventory.sql";
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };

function run(args) {
  return execFileSync(wrangler, args, { cwd: process.cwd(), env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function query(sql) {
  const output = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]));
  if (!Array.isArray(output) || output.some(result => result.success !== true)) throw new Error("D1 did not report a successful query.");
  return output.flatMap(result => result.results ?? []);
}

function applyReviewedMigration() {
  const root = mkdtempSync(join(process.cwd(), ".bundle-13-npc-migration-"));
  try {
    const migrations = join(root, "migrations");
    mkdirSync(migrations, { recursive: true });
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrations, migrationName));
    const config = join(root, "wrangler.jsonc");
    writeFileSync(config, JSON.stringify({ name: "wwn-character-sheet", d1_databases: [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "./migrations" }] }, null, 2));
    run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", config]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]));
if (!JSON.stringify(info).includes(DATABASE_ID)) throw new Error("The resolved remote D1 database ID does not match production.");

const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const baseline of ["0016_campaign_items.sql", "0017_action_bundle_7_npc_usability.sql"]) {
  if (!applied.has(baseline)) throw new Error(`Production is missing baseline migration ${baseline}; Bundle 13 migration was not applied.`);
}
if (!applied.has(migrationName)) applyReviewedMigration();

const finalApplied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
if (!finalApplied.has(migrationName)) throw new Error(`${migrationName} is not recorded in production D1 migration history.`);
const columns = new Set(query("PRAGMA table_info(campaign_npc_templates)").map(row => row.name));
if (!columns.has("inventory_json")) throw new Error("campaign_npc_templates is missing inventory_json.");
const unsafeDefaults = query("SELECT COUNT(*) AS count FROM campaign_npc_templates WHERE inventory_json IS NULL");
if (Number(unsafeDefaults[0]?.count ?? 0) !== 0) throw new Error("Existing NPC rows did not receive safe Bundle 13 inventory defaults.");
console.log("Action Bundle 13 NPC inventory migration verified against the production database.");
