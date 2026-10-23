import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const wrangler = resolve(projectRoot, "node_modules/.bin/wrangler");

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(persistTo, environment, args) {
  return execFileSync(wrangler, [
    "d1",
    "execute",
    "wwn-character-sheet-db",
    "--local",
    "--config",
    resolve(projectRoot, "wrangler.jsonc"),
    "--persist-to",
    persistTo,
    "--json",
    ...args,
  ], {
    cwd: projectRoot,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runMigrationBatch(persistTo, environment, migrationFiles) {
  const bundle = resolve(persistTo, "migration-batch.sql");
  writeFileSync(bundle, migrationFiles.map(name =>
    readFileSync(resolve(projectRoot, "drizzle", name), "utf8")
  ).join("\n"));
  runWrangler(persistTo, environment, ["--file", bundle]);
}

function results(output) {
  return JSON.parse(output).flatMap(entry => entry.results ?? []);
}

test("existing character data remains readable and unchanged after Phase 4B migrations", { timeout: 60_000 }, () => {
  const temporaryRoot = mkdtempSync(`${tmpdir()}/wwn-phase4b-migration-`);
  const persistTo = resolve(temporaryRoot, "state");
  const home = resolve(temporaryRoot, "home");
  const config = resolve(temporaryRoot, "config");
  const logs = resolve(temporaryRoot, "logs");
  mkdirSync(home, { recursive: true });
  mkdirSync(config, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const environment = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: config,
    CI: "true",
    WRANGLER_LOG_PATH: resolve(logs, "wrangler.log"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
  };
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ]) {
    delete environment[name];
  }

  runWrangler(persistTo, environment, ["--file", resolve(projectRoot, "drizzle/0000_brainy_killraven.sql")]);

  const legacyCharacter = JSON.stringify({
    name: "Legacy O'Brien",
    notes: "Keep every value exactly.",
    level: 4,
    companions: [{ id: "companion-1", name: "Ash" }],
  });
  runWrangler(persistTo, environment, [
    "--command",
    `INSERT INTO characters
      (id, name, player, class_label, level, data, version, created_at, updated_at)
     VALUES ('legacy-internal-id', 'Legacy O''Brien', 'Player', 'Expert', 4,
             ${sqlLiteral(legacyCharacter)}, 7, '2026-01-01', '2026-02-01');
     INSERT INTO character_revisions (character_id, version, data, saved_at)
     VALUES ('legacy-internal-id', 6, ${sqlLiteral(legacyCharacter)}, '2026-01-31');`,
  ]);

  runMigrationBatch(persistTo, environment, ["0001_better_auth_core.sql", "0002_character_ownership_and_claims.sql", "0003_better_auth_rate_limit_compatibility.sql", "0004_better_auth_verification_camel_case_compatibility.sql", "0005_user_role.sql"]);

  const characters = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT id, owner_user_id AS ownerUserId, public_id AS publicId, visibility, portrait_key AS portraitKey, data, version, created_at AS createdAt, updated_at AS updatedAt FROM characters WHERE id = 'legacy-internal-id'",
  ]));
  assert.deepEqual(characters, [{
    id: "legacy-internal-id",
    ownerUserId: null,
    publicId: null,
    visibility: "private",
    portraitKey: null,
    data: legacyCharacter,
    version: 7,
    createdAt: "2026-01-01",
    updatedAt: "2026-02-01",
  }]);

  const revisions = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT character_id AS characterId, version, data, saved_at AS savedAt FROM character_revisions WHERE character_id = 'legacy-internal-id'",
  ]));
  assert.deepEqual(revisions, [{
    characterId: "legacy-internal-id",
    version: 6,
    data: legacyCharacter,
    savedAt: "2026-01-31",
  }]);

  const tables = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ])).map(row => row.name);
  for (const table of [
    "account",
    "legacy_character_claim_items",
    "legacy_character_claims",
    "rate_limit",
    "rateLimit",
    "session",
    "user",
    "verification",
  ]) {
    assert.ok(tables.includes(table), `${table} should exist after migration`);
  }

  const compatibilityColumns = {
    user: ["emailVerified", "createdAt", "updatedAt"],
    session: ["expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId"],
    account: ["accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "createdAt", "updatedAt"],
    verification: ["expiresAt", "createdAt", "updatedAt"],
    rateLimit: ["lastRequest"],
  };
  for (const [table, expectedColumns] of Object.entries(compatibilityColumns)) {
    const columns = results(runWrangler(persistTo, environment, [
      "--command",
      `PRAGMA table_info('${table}')`,
    ])).map(row => row.name);
    for (const column of expectedColumns) {
      assert.ok(columns.includes(column), `${table}.${column} should exist after compatibility migrations`);
    }
  }

  const users = results(runWrangler(persistTo, environment, [
    "--command",
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
     VALUES ('ordinary-user', 'Ordinary', 'ordinary@example.invalid', 1, 1, 1);
     SELECT id, role FROM user WHERE id = 'ordinary-user'`,
  ]));
  assert.deepEqual(users, [{ id: "ordinary-user", role: "user" }]);
  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "UPDATE user SET role = 'superuser' WHERE id = 'ordinary-user'",
  ]));

  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "UPDATE characters SET visibility = 'friends-only' WHERE id = 'legacy-internal-id'",
  ]));
});
