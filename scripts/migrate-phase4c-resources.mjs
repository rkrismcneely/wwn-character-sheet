import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const env = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };
const config = "wrangler.jsonc";
const migrationName = "0008_campaign_resources.sql";

function run(args) {
  return execFileSync(wrangler, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function query(sql) {
  const parsed = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", config, "--json", "--command", sql]));
  if (!Array.isArray(parsed) || parsed.some((entry) => entry.success !== true)) {
    throw new Error("D1 did not report a successful query.");
  }
  return parsed.flatMap((entry) => entry.results ?? []);
}

function requireAppliedMigration(rows, name) {
  if (!rows.some((row) => row.name === name)) {
    throw new Error(`Production D1 is missing required baseline migration ${name}; no feature migration was applied.`);
  }
}

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", config]));
if (JSON.stringify(info).includes(DATABASE_ID) === false) {
  throw new Error("The resolved remote D1 database ID does not match the expected production database.");
}
const migrationRows = query("SELECT name FROM d1_migrations ORDER BY id");
requireAppliedMigration(migrationRows, "0006_campaign_foundation.sql");
requireAppliedMigration(migrationRows, "0007_user_display_name.sql");
const campaignColumns = query("PRAGMA table_info(campaigns)");
if (!campaignColumns.some((row) => row.name === "description")) {
  throw new Error("Production campaigns table is missing its existing description column; no feature migration was applied.");
}

const temporaryRoot = mkdtempSync(join(process.cwd(), ".phase4c-resources-"));
try {
  const migrationDir = join(temporaryRoot, "migrations");
  const temporaryConfig = join(temporaryRoot, "wrangler.jsonc");
  const source = join(process.cwd(), "drizzle", migrationName);
  const target = join(migrationDir, migrationName);
  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(join(temporaryRoot, "placeholder"), "");
  // Wrangler resolves the configured directory relative to this temporary config.
  copyFileSync(source, target);
  writeFileSync(temporaryConfig, JSON.stringify({
    name: "wwn-character-sheet",
    d1_databases: [{
      binding: "DB",
      database_name: DATABASE_NAME,
      database_id: DATABASE_ID,
      migrations_dir: "./migrations",
    }],
  }, null, 2));
  console.log("Applying only the reviewed campaign resources migration to the verified production D1 database.");
  run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", temporaryConfig]);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

const table = query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'campaign_resources'");
if (!table.some((row) => row.name === "campaign_resources")) {
  throw new Error("Campaign resources migration did not create its table.");
}
console.log("Campaign resources migration verified.");
