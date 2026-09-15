import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationNames = ["0024_campaign_stores.sql"];
const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const environment = {
  ...process.env,
  WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  WRANGLER_WRITE_LOGS: "false",
};

function run(args) {
  return execFileSync(wrangler, args, {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function query(sql) {
  const output = JSON.parse(
    run(["d1", "execute", DATABASE_NAME, "--remote", "--config", "wrangler.jsonc", "--json", "--command", sql]),
  );
  if (!Array.isArray(output) || output.some(result => result.success !== true)) {
    throw new Error("D1 did not report a successful query.");
  }
  return output.flatMap(result => result.results ?? []);
}

function applyReviewedMigration() {
  const root = mkdtempSync(join(process.cwd(), ".campaign-items-migration-"));
  try {
    const migrations = join(root, "migrations");
    mkdirSync(migrations, { recursive: true });
    for (const migrationName of migrationNames) {
      copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrations, migrationName));
    }
    const config = join(root, "wrangler.jsonc");
    writeFileSync(config, JSON.stringify({
      name: "wwn-character-sheet",
      d1_databases: [{
        binding: "DB",
        database_name: DATABASE_NAME,
        database_id: DATABASE_ID,
        migrations_dir: "./migrations",
      }],
    }, null, 2));
    run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", config]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", "wrangler.jsonc"]));
if (!JSON.stringify(info).includes(DATABASE_ID)) {
  throw new Error("The resolved remote D1 database ID does not match production.");
}

const applied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const baseline of [
  "0013_connected_accounts.sql",
  "0014_campaign_map_foundation.sql",
  "0015_campaign_map_interactions.sql",
]) {
  if (!applied.has(baseline)) {
    throw new Error(`Production is missing baseline migration ${baseline}; campaign-item migration was not applied.`);
  }
}

if (migrationNames.some(migrationName => !applied.has(migrationName))) applyReviewedMigration();

const finalApplied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const migrationName of migrationNames) {
  if (!finalApplied.has(migrationName)) {
    throw new Error(`${migrationName} is not recorded in production D1 migration history.`);
  }
}

const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name));
for (const table of ["campaign_items", "campaign_item_characters", "campaign_stores", "campaign_store_items"]) {
  if (!tables.has(table)) throw new Error(`Production is missing table ${table}.`);
}

const itemColumns = new Set(query("PRAGMA table_info(campaign_items)").map(row => row.name));
for (const column of ["id", "campaign_id", "name", "kind", "description", "properties_json", "visibility_mode", "created_at", "updated_at"]) {
  if (!itemColumns.has(column)) throw new Error(`campaign_items is missing ${column}.`);
}

const targetColumns = new Set(query("PRAGMA table_info(campaign_item_characters)").map(row => row.name));
for (const column of ["campaign_item_id", "character_id"]) {
  if (!targetColumns.has(column)) throw new Error(`campaign_item_characters is missing ${column}.`);
}

const indexes = new Set(query("SELECT name FROM sqlite_master WHERE type = 'index'").map(row => row.name));
for (const index of ["campaign_items_campaign_name_idx", "campaign_item_characters_character_idx", "campaign_stores_campaign_updated_idx", "campaign_stores_one_active_per_campaign_idx", "campaign_store_items_store_name_idx"]) {
  if (!indexes.has(index)) throw new Error(`Production is missing index ${index}.`);
}

const storeColumns = new Set(query("PRAGMA table_info(campaign_stores)").map(row => row.name));
for (const column of ["id", "campaign_id", "name", "description", "is_active", "created_at", "updated_at"]) {
  if (!storeColumns.has(column)) throw new Error(`campaign_stores is missing ${column}.`);
}

const storeItemColumns = new Set(query("PRAGMA table_info(campaign_store_items)").map(row => row.name));
for (const column of ["id", "store_id", "source_type", "source_item_id", "name", "kind", "description", "details", "properties_json", "cost", "quantity", "shop_note", "created_at", "updated_at"]) {
  if (!storeItemColumns.has(column)) throw new Error(`campaign_store_items is missing ${column}.`);
}

console.log("Campaign store migration verified against the production database.");
