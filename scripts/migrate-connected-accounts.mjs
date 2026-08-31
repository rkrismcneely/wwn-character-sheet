import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_ID, DATABASE_NAME, operationMode, queryD1, runWrangler } from "./d1-admin.mjs";

const { remote, apply } = operationMode();
if (!remote || !apply) throw new Error("Connected-account migration requires the explicit production database confirmation and --remote --apply.");
const migrationName = "0013_connected_accounts.sql";
const secrets = new Set(JSON.parse(runWrangler(["secret", "list", "--config", "wrangler.jsonc"])).map(entry => entry.name));
for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"]) {
  if (!secrets.has(name)) throw new Error(`Production configuration is missing ${name}; nothing was migrated.`);
}
const applied = new Set(queryD1("SELECT name FROM d1_migrations", true).map(row => row.name));
for (const baseline of ["0001_better_auth_core.sql", "0005_user_role.sql", "0007_user_display_name.sql", "0012_campaign_npc_threat_stats.sql"]) {
  if (!applied.has(baseline)) throw new Error(`Missing baseline ${baseline}; nothing was migrated.`);
}
for (const columns of ["provider_id, account_id", "user_id, provider_id"]) {
  const [{ duplicates }] = queryD1(`SELECT COUNT(*) AS duplicates FROM (SELECT 1 FROM account GROUP BY ${columns} HAVING COUNT(*) > 1)`, true);
  if (duplicates !== 0) throw new Error("Existing duplicate authentication records need separate review. No records were changed.");
}
function counts() {
  return ["user", "account", "session", "characters", "campaigns", "campaign_members", "campaign_characters"]
    .map(table => queryD1(`SELECT COUNT(*) AS n FROM ${table}`, true)[0].n);
}
const before = counts();
if (!applied.has(migrationName)) {
  // Follow the established isolated, single-reviewed-migration release pattern.
  const root = mkdtempSync(join(process.cwd(), ".connected-accounts-migration-"));
  try {
    mkdirSync(join(root, "migrations"));
    copyFileSync(join(process.cwd(), "drizzle", migrationName), join(root, "migrations", migrationName));
    const config = join(root, "wrangler.jsonc");
    writeFileSync(config, JSON.stringify({ name: "wwn-character-sheet", d1_databases: [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "./migrations" }] }));
    execFileSync(join(process.cwd(), "node_modules/.bin/wrangler"), ["d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", config], {
      stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const constraints = new Set(queryD1("SELECT name FROM sqlite_master WHERE name IN ('account_provider_identity_unique', 'account_user_provider_unique', 'account_keep_login_method')", true).map(row => row.name));
if (constraints.size !== 3) throw new Error("Connected-account database safeguards were not all installed.");
// Live traffic can increase counts; any decrease requires investigation before deployment.
if (counts().some((count, index) => count < before[index])) throw new Error("A live table count decreased during verification; inspect before deployment.");
console.log("Connected-account migration verified. Canonical user IDs and ownership were not rewritten.");
