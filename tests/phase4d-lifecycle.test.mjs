import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const source = path => readFileSync(resolve(root, path), "utf8");
const wrangler = resolve(root, "node_modules/.bin/wrangler");

function run(persistTo, args) {
  const config = resolve(persistTo, "config");
  mkdirSync(config, { recursive: true });
  const env = { ...process.env, XDG_CONFIG_HOME: config, CI: "true", WRANGLER_LOG_PATH: resolve(persistTo, "wrangler.log"), WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" };
  for (const name of ["HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy"]) delete env[name];
  return execFileSync(wrangler, ["d1","execute","wwn-character-sheet-db","--local","--config",resolve(root,"wrangler.jsonc"),"--persist-to",persistTo,"--json",...args], { cwd: root, env, encoding: "utf8", stdio: ["ignore","pipe","pipe"] });
}
function rows(output) { return JSON.parse(output).flatMap(entry => entry.results ?? []); }

test("Phase 4D migration is additive and existing records remain active", { timeout: 60_000 }, () => {
  const temporary = mkdtempSync(`${tmpdir()}/wwn-phase4d-`);
  for (const migration of ["0000_brainy_killraven.sql","0001_better_auth_core.sql","0002_character_ownership_and_claims.sql","0003_better_auth_rate_limit_compatibility.sql","0004_better_auth_verification_camel_case_compatibility.sql","0005_user_role.sql","0006_campaign_foundation.sql","0007_user_display_name.sql","0008_campaign_resources.sql"]) {
    run(temporary, ["--file", resolve(root, "drizzle", migration)]);
  }
  run(temporary, ["--command", `INSERT INTO user (id,name,email,email_verified,role,created_at,updated_at) VALUES ('u1','Owner','owner@example.invalid',1,'user',1,1);
    INSERT INTO characters (id,owner_user_id,public_id,visibility,name,player,class_label,level,data,version,created_at,updated_at) VALUES ('ch1','u1','chr_abcdefghijklmnopqrstuv','public','Hero','Owner','Expert',3,'{"name":"Hero"}',4,'before','before');
    INSERT INTO campaigns (id,public_id,owner_user_id,name,description,version,created_at,updated_at) VALUES ('ca1','cmp_abcdefghijklmnopqrstuv','u1','Campaign',NULL,2,'before','before');
    INSERT INTO campaign_members (campaign_id,user_id,role,joined_at) VALUES ('ca1','u1','gm','before');
    INSERT INTO campaign_characters (campaign_id,character_id,added_at) VALUES ('ca1','ch1','before');`]);
  run(temporary, ["--file", resolve(root, "drizzle/0009_character_campaign_lifecycle.sql")]);
  assert.deepEqual(rows(run(temporary, ["--command", "SELECT archived_at AS archivedAt FROM characters WHERE id='ch1'"])), [{ archivedAt: null }]);
  assert.deepEqual(rows(run(temporary, ["--command", "SELECT archived_at AS archivedAt FROM campaigns WHERE id='ca1'"])), [{ archivedAt: null }]);
  assert.equal(rows(run(temporary, ["--command", "SELECT COUNT(*) AS count FROM campaign_characters WHERE campaign_id='ca1' AND character_id='ch1'"]))[0].count, 1);
});

test("lifecycle routes and queries preserve security and exclusion semantics", () => {
  const character = source("app/api/characters/lifecycle.ts");
  const characterDb = source("app/api/characters/db.ts");
  const campaign = source("lib/campaigns/service.ts");
  const campaignCharacters = source("lib/campaigns/characters.ts");
  const invites = source("lib/campaigns/invite-service.ts");
  const resources = source("lib/campaigns/resources.ts");
  assert.match(character, /row\.ownerUserId !== actor\.userId/u);
  assert.match(character, /visibility, portrait_key, archived_at/u);
  assert.match(character, /VALUES \(\?, \?, \?, 'private'/u);
  assert.match(character, /BUCKET\.put/u);
  assert.match(character, /BUCKET\.delete/u);
  assert.match(character, /portraitURL\(duplicatePortraitKey\)/u);
  assert.doesNotMatch(character, /campaign_characters|character_revisions/u);
  assert.match(characterDb, /archived_at IS NULL/u);
  assert.match(campaign, /requireActiveCampaign/u);
  assert.match(campaign, /canRestore: !isActive && isOwner/u);
  assert.match(campaignCharacters, /ch\.archived_at IS NULL/u);
  assert.match(campaignCharacters, /replacement\.archivedAt/u);
  assert.match(invites, /campaignArchivedAt/u);
  assert.match(invites, /archived_at IS NULL/u);
  assert.match(resources, /requireActiveCampaign/u);
});

test("owner dashboards separate active and archived records and expose lifecycle actions", () => {
  const dashboard = source("app/dashboard-page.tsx");
  const campaigns = source("app/campaigns/campaign-dashboard.tsx");
  const detail = source("app/campaigns/campaign-detail.tsx");
  assert.match(dashboard, /Archived Characters/u);
  assert.match(dashboard, /Duplicate/u);
  assert.match(dashboard, /archive=all/u);
  assert.match(campaigns, /Archived Campaigns/u);
  assert.match(campaigns, /canRestore/u);
  assert.match(detail, /Archived campaign · Existing members retain read access/u);
  assert.match(detail, /Restore Campaign/u);
});
