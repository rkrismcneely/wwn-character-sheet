import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
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

function results(output) {
  return JSON.parse(output).flatMap(entry => entry.results ?? []);
}

function migrationEnvironment(temporaryRoot) {
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
  return environment;
}

test("Phase 4C campaign foundation is additive and preserves existing data", { timeout: 60_000 }, () => {
  const temporaryRoot = mkdtempSync(`${tmpdir()}/wwn-phase4c-migration-`);
  const persistTo = resolve(temporaryRoot, "state");
  const environment = migrationEnvironment(temporaryRoot);

  for (const migration of [
    "0000_brainy_killraven.sql",
    "0001_better_auth_core.sql",
    "0002_character_ownership_and_claims.sql",
    "0003_better_auth_rate_limit_compatibility.sql",
    "0004_better_auth_verification_camel_case_compatibility.sql",
    "0005_user_role.sql",
  ]) {
    runWrangler(persistTo, environment, [
      "--file",
      resolve(projectRoot, `drizzle/${migration}`),
    ]);
  }

  const characterData = JSON.stringify({
    name: "Preserved Hero",
    notes: "Campaign migration must not rewrite this.",
    level: 5,
  });
  runWrangler(persistTo, environment, [
    "--command",
    `INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
     VALUES
       ('owner-user', 'Owner', 'owner@example.invalid', 1, 'user', 1, 1),
       ('player-user', 'Player', 'player@example.invalid', 1, 'user', 1, 1);
     INSERT INTO characters
       (id, owner_user_id, public_id, visibility, name, player, class_label,
        level, data, version, created_at, updated_at)
     VALUES
       ('character-1', 'player-user', 'chr_abcdefghijklmnopqrstuv', 'private',
        'Preserved Hero', 'Player', 'Expert', 5, ${sqlLiteral(characterData)},
        9, '2026-08-01', '2026-08-14');`,
  ]);

  const characterBefore = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT id, owner_user_id AS ownerUserId, public_id AS publicId, visibility, data, version FROM characters WHERE id = 'character-1'",
  ]));
  const usersBefore = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT id, email, role FROM user ORDER BY id",
  ]));

  runWrangler(persistTo, environment, [
    "--file",
    resolve(projectRoot, "drizzle/0006_campaign_foundation.sql"),
  ]);

  const characterAfter = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT id, owner_user_id AS ownerUserId, public_id AS publicId, visibility, data, version FROM characters WHERE id = 'character-1'",
  ]));
  const usersAfter = results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT id, email, role FROM user ORDER BY id",
  ]));
  assert.deepEqual(characterAfter, characterBefore);
  assert.deepEqual(usersAfter, usersBefore);

  const tables = new Set(results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ])).map(row => row.name));
  for (const table of [
    "campaigns",
    "campaign_members",
    "campaign_characters",
    "campaign_invites",
  ]) {
    assert.equal(tables.has(table), true, `${table} should exist`);
  }

  const indexes = new Set(results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'index'",
  ])).map(row => row.name));
  for (const index of [
    "campaigns_public_id_unique",
    "campaigns_owner_updated_idx",
    "campaign_members_user_joined_idx",
    "campaign_characters_character_idx",
    "campaign_invites_token_hash_unique",
    "campaign_invites_campaign_status_idx",
  ]) {
    assert.equal(indexes.has(index), true, `${index} should exist`);
  }

  const inviteColumns = results(runWrangler(persistTo, environment, [
    "--command",
    "PRAGMA table_info('campaign_invites')",
  ])).map(row => row.name);
  assert.equal(inviteColumns.includes("token_hash"), true);
  assert.equal(inviteColumns.includes("token"), false);

  runWrangler(persistTo, environment, [
    "--command",
    `INSERT INTO campaigns
       (id, public_id, owner_user_id, name, version, created_at, updated_at)
     VALUES
       ('campaign-1', 'cmp_abcdefghijklmnopqrstuv', 'owner-user', 'First Campaign', 1, '2026-08-15', '2026-08-15'),
       ('campaign-2', 'cmp_vutsrqponmlkjihgfedcba', 'owner-user', 'Second Campaign', 1, '2026-08-15', '2026-08-15');
     INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
     VALUES
       ('campaign-1', 'owner-user', 'gm', '2026-08-15'),
       ('campaign-1', 'player-user', 'player', '2026-08-15'),
       ('campaign-2', 'owner-user', 'gm', '2026-08-15'),
       ('campaign-2', 'player-user', 'player', '2026-08-15');
     INSERT INTO campaign_characters (campaign_id, character_id, added_at)
     VALUES
       ('campaign-1', 'character-1', '2026-08-15'),
       ('campaign-2', 'character-1', '2026-08-15');
     INSERT INTO campaign_invites
       (id, campaign_id, token_hash, role, created_by_user_id, created_at, expires_at)
     VALUES
       ('invite-1', 'campaign-1', 'stored-sha256-hash-only', 'player',
        'owner-user', '2026-08-15', '2026-08-22');`,
  ]);

  assert.deepEqual(results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT campaign_id AS campaignId, character_id AS characterId FROM campaign_characters WHERE character_id = 'character-1' ORDER BY campaign_id",
  ])), [
    { campaignId: "campaign-1", characterId: "character-1" },
    { campaignId: "campaign-2", characterId: "character-1" },
  ]);
  assert.deepEqual(results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT owner_user_id AS ownerUserId, visibility FROM characters WHERE id = 'character-1'",
  ])), [{ ownerUserId: "player-user", visibility: "private" }]);
  assert.deepEqual(results(runWrangler(persistTo, environment, [
    "--command",
    "SELECT token_hash AS tokenHash, accepted_at AS acceptedAt, revoked_at AS revokedAt FROM campaign_invites WHERE id = 'invite-1'",
  ])), [{
    tokenHash: "stored-sha256-hash-only",
    acceptedAt: null,
    revokedAt: null,
  }]);

  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES ('campaign-1', 'player-user', 'player', '2026-08-15')",
  ]));
  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "INSERT INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES ('campaign-1', 'owner-user', 'admin', '2026-08-15')",
  ]));
  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "INSERT INTO campaign_characters (campaign_id, character_id, added_at) VALUES ('campaign-1', 'character-1', '2026-08-15')",
  ]));
  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "INSERT INTO campaign_invites (id, campaign_id, token_hash, role, created_at, expires_at) VALUES ('invite-2', 'campaign-1', 'stored-sha256-hash-only', 'player', '2026-08-15', '2026-08-22')",
  ]));
  assert.throws(() => runWrangler(persistTo, environment, [
    "--command",
    "INSERT INTO campaign_invites (id, campaign_id, token_hash, role, created_at, expires_at) VALUES ('invite-3', 'campaign-1', 'different-hash', 'gm', '2026-08-15', '2026-08-22')",
  ]));
});
