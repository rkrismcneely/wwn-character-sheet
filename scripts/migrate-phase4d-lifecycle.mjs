import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

const wrangler = join(process.cwd(), "node_modules/.bin/wrangler");
const env = { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log", WRANGLER_WRITE_LOGS: "false" };
const config = "wrangler.jsonc";
const migrationName = "0009_character_campaign_lifecycle.sql";

function run(args) {
  return execFileSync(wrangler, args, { cwd: process.cwd(), env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}
function query(sql) {
  const parsed = JSON.parse(run(["d1", "execute", DATABASE_NAME, "--remote", "--config", config, "--json", "--command", sql]));
  if (!Array.isArray(parsed) || parsed.some(entry => entry.success !== true)) throw new Error("D1 did not report a successful query.");
  return parsed.flatMap(entry => entry.results ?? []);
}
function columns(table) {
  return new Set(query(`PRAGMA table_info(${table})`).map(row => row.name));
}
function counts() {
  return query(`SELECT
    (SELECT COUNT(*) FROM characters) AS characters,
    (SELECT COUNT(*) FROM campaigns) AS campaigns,
    (SELECT COUNT(*) FROM campaign_members) AS members,
    (SELECT COUNT(*) FROM campaign_characters) AS links,
    (SELECT COUNT(*) FROM campaign_invites) AS invites,
    (SELECT COUNT(*) FROM character_revisions) AS revisions`)[0];
}
function applyReviewedMigration() {
  const temporaryRoot = mkdtempSync(join(process.cwd(), ".phase4d-lifecycle-"));
  try {
    const migrationDir = join(temporaryRoot, "migrations");
    const temporaryConfig = join(temporaryRoot, "wrangler.jsonc");
    mkdirSync(migrationDir, { recursive: true });
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(migrationDir, migrationName));
    writeFileSync(temporaryConfig, JSON.stringify({
      name: "wwn-character-sheet",
      d1_databases: [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "./migrations" }],
    }, null, 2));
    run(["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", temporaryConfig]);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const info = JSON.parse(run(["d1", "info", DATABASE_NAME, "--json", "--config", config]));
if (!JSON.stringify(info).includes(DATABASE_ID)) throw new Error("The resolved remote D1 database ID does not match production.");
const migrations = new Set(query("SELECT name FROM d1_migrations").map(row => row.name));
for (const baseline of ["0006_campaign_foundation.sql", "0008_campaign_resources.sql"]) {
  if (!migrations.has(baseline)) throw new Error(`Production is missing baseline migration ${baseline}; lifecycle migration was not applied.`);
}
const before = counts();
const characterHasArchive = columns("characters").has("archived_at");
const campaignHasArchive = columns("campaigns").has("archived_at");
if (!characterHasArchive && !campaignHasArchive) {
  applyReviewedMigration();
} else if (characterHasArchive !== campaignHasArchive) {
  console.log("Partial lifecycle schema detected; applying only the missing additive column.");
  if (!characterHasArchive) query("ALTER TABLE characters ADD COLUMN archived_at TEXT");
  if (!campaignHasArchive) query("ALTER TABLE campaigns ADD COLUMN archived_at TEXT");
  query("CREATE INDEX IF NOT EXISTS characters_owner_archive_updated_idx ON characters (owner_user_id, archived_at, updated_at)");
  query("CREATE INDEX IF NOT EXISTS campaigns_owner_archive_updated_idx ON campaigns (owner_user_id, archived_at, updated_at)");
  query("INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0009_character_campaign_lifecycle.sql')");
} else {
  console.log("Lifecycle columns already exist; no ALTER TABLE statement was rerun.");
}
for (const [table, indexName] of [["characters", "characters_owner_archive_updated_idx"], ["campaigns", "campaigns_owner_archive_updated_idx"]]) {
  if (!columns(table).has("archived_at")) throw new Error(`${table}.archived_at is missing after migration.`);
  const indexes = query(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`);
  if (!indexes.some(row => row.name === indexName)) throw new Error(`Production is missing index ${indexName}.`);
}
const after = counts();
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Lifecycle migration changed existing row counts.");
const integrity = query("PRAGMA integrity_check");
if (!integrity.some(row => Object.values(row).includes("ok"))) throw new Error("Production D1 integrity check failed.");
console.log("Phase 4D lifecycle migration verified against the production database.");
