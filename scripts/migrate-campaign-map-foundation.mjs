import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const migrationNames = [
  "0014_campaign_map_foundation.sql",
  "0015_campaign_map_interactions.sql",
  "0020_action_bundle_8_live_map_dice.sql",
  "0021_action_bundle_9_companion_map_tokens.sql",
  "0022_action_bundle_10_grid_types.sql",
  "0023_action_bundle_10_map_fog.sql",
];
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

function applyOnlyReviewedMigration(migrationName) {
  const root = mkdtempSync(join(process.cwd(), ".campaign-map-migration-"));
  try {
    const migrations = join(root, "migrations");
    mkdirSync(migrations, { recursive: true });
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrations, migrationName));
    const config = join(root, "wrangler.jsonc");
    writeFileSync(
      config,
      JSON.stringify(
        {
          name: "wwn-character-sheet",
          d1_databases: [
            {
              binding: "DB",
              database_name: DATABASE_NAME,
              database_id: DATABASE_ID,
              migrations_dir: "./migrations",
            },
          ],
        },
        null,
        2,
      ),
    );
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
  "0010_campaign_live_sessions.sql",
  "0011_campaign_npc_templates.sql",
  "0012_campaign_npc_threat_stats.sql",
  "0013_connected_accounts.sql",
  "0019_campaign_item_equipment.sql",
]) {
  if (!applied.has(baseline)) {
    throw new Error(`Production is missing baseline migration ${baseline}; campaign-map migration was not applied.`);
  }
}

for (const migrationName of migrationNames) {
  if (!applied.has(migrationName)) {
    applyOnlyReviewedMigration(migrationName);
    applied.add(migrationName);
  }
}

const finalApplied = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const migrationName of migrationNames) {
  if (!finalApplied.has(migrationName)) {
    throw new Error(`Campaign-map migration ${migrationName} is not recorded in production D1 migration history.`);
  }
}

const tables = new Set(query("SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name));
for (const table of [
  "campaign_maps",
  "campaign_map_tokens",
  "campaign_map_preferences",
  "campaign_map_token_sizes",
  "campaign_map_fog_cells",
]) {
  if (!tables.has(table)) throw new Error(`Production is missing table ${table}.`);
}

const mapColumns = new Set(query("PRAGMA table_info(campaign_maps)").map(row => row.name));
for (const column of [
  "id",
  "campaign_id",
  "name",
  "is_active",
  "background_key",
  "grid_enabled",
  "grid_type",
  "grid_size",
  "grid_offset_x",
  "grid_offset_y",
  "version",
]) {
  if (!mapColumns.has(column)) throw new Error(`campaign_maps is missing ${column}.`);
}

const tokenColumns = new Set(query("PRAGMA table_info(campaign_map_tokens)").map(row => row.name));
for (const column of ["id", "campaign_id", "map_id", "kind", "source_id", "x", "y", "version"]) {
  if (!tokenColumns.has(column)) throw new Error(`campaign_map_tokens is missing ${column}.`);
}
const tokenTableSql = String(query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'campaign_map_tokens'")[0]?.sql ?? "");
if (!tokenTableSql.includes("'companion'")) {
  throw new Error("campaign_map_tokens does not permit companion token rows.");
}
const invalidTokenKinds = query("SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE kind NOT IN ('pc', 'npc', 'companion')")[0]?.count ?? 0;
if (Number(invalidTokenKinds) !== 0) {
  throw new Error("campaign_map_tokens contains an unsupported token kind.");
}

const preferenceColumns = new Set(query("PRAGMA table_info(campaign_map_preferences)").map(row => row.name));
for (const column of ["map_id", "campaign_id", "snap_enabled", "shared_roll_dice_enabled", "updated_at"]) {
  if (!preferenceColumns.has(column)) throw new Error(`campaign_map_preferences is missing ${column}.`);
}
const invalidSharedDicePreferences = query(`SELECT COUNT(*) AS count FROM campaign_map_preferences
  WHERE shared_roll_dice_enabled IS NULL OR shared_roll_dice_enabled NOT IN (0, 1)`)[0]?.count ?? 0;
if (Number(invalidSharedDicePreferences) !== 0) {
  throw new Error("campaign_map_preferences contains an invalid shared_roll_dice_enabled value.");
}

const sizeColumns = new Set(query("PRAGMA table_info(campaign_map_token_sizes)").map(row => row.name));
for (const column of ["token_id", "map_id", "campaign_id", "size_cells", "updated_at"]) {
  if (!sizeColumns.has(column)) throw new Error(`campaign_map_token_sizes is missing ${column}.`);
}

const fogColumns = new Set(query("PRAGMA table_info(campaign_map_fog_cells)").map(row => row.name));
for (const column of ["map_id", "campaign_id", "cell_q", "cell_r", "created_at"]) {
  if (!fogColumns.has(column)) throw new Error(`campaign_map_fog_cells is missing ${column}.`);
}

const indexes = new Set(query("SELECT name FROM sqlite_master WHERE type = 'index'").map(row => row.name));
for (const index of [
  "campaign_maps_campaign_idx",
  "campaign_maps_one_active",
  "campaign_map_tokens_source_unique",
  "campaign_map_tokens_map_idx",
  "campaign_map_preferences_campaign_idx",
  "campaign_map_token_sizes_map_idx",
  "campaign_map_fog_cells_campaign_map_idx",
]) {
  if (!indexes.has(index)) throw new Error(`Production is missing index ${index}.`);
}

console.log("Campaign map migrations verified against the production database.");
