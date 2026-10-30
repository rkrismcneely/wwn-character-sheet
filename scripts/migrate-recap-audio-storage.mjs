import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME } from "./d1-admin.mjs";

// This additive migration must run before the Worker exposes the processing job API.
const migrationName = "0035_recap_user_audio_storage.sql";
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
for (const prerequisite of ["0006_campaign_foundation.sql", "0032_campaign_session_recaps.sql", "0033_recap_recording_foundation.sql", "0034_recap_processing_jobs.sql"]) {
  if (!applied.has(prerequisite)) throw new Error("Required migration missing: " + prerequisite);
}
if (!applied.has(migrationName)) {
  const root = mkdtempSync(join(process.cwd(), ".recap-audio-storage-migration-"));
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
if (!nowApplied.has(migrationName)) throw new Error("Audio storage migration not recorded.");
for (const [table, required] of [["user_recap_storage_connections", ["id", "user_id", "provider", "credential_ciphertext"]], ["campaign_recap_audio_assets", ["id", "campaign_id", "recap_id", "connection_id", "storage_owner_user_id", "remote_file_id"]]]) {
  const columns = new Set(query("PRAGMA table_info(" + table + ")").map(row => row.name));
  for (const name of required) if (!columns.has(name)) throw new Error("Audio storage table missing " + table + "." + name);
}
for (const index of ["user_recap_storage_connections_owner_idx", "campaign_recap_audio_assets_recap_idx", "campaign_recap_audio_assets_one_primary_idx"]) {
  const exists = query("SELECT name FROM sqlite_master WHERE type = 'index' AND name = '" + index + "'");
  if (exists.length !== 1) throw new Error("Audio storage index missing: " + index);
}
console.log("Recap user-owned audio storage D1 migration applied and verified.");
