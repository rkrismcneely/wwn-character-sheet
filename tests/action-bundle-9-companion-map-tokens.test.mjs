import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  campaignMapCompanionCharacterId,
  campaignMapCompanionSourceId,
  campaignMapCompanionsFromCharacterData,
} from "../lib/campaigns/map-companions.ts";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function applyMigration(database, source) {
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

test("active Beastmaster, Henchkeeper, and summoned Spirit Familiar companions become stable map options", () => {
  const data = {
    companions: [
      { id: "beastmaster-1", kind: "beastmaster", name: "Ashfang" },
      { id: "henchman-1", kind: "henchman", name: "Pella" },
      { id: "familiar-1", kind: "familiar", name: "Moth", summoned: true },
      { id: "familiar-2", kind: "familiar", name: "Sleeping Star", summoned: false },
      { id: "henchman-2", kind: "henchman", name: "" },
    ],
    archivedCompanions: [
      { id: "archived-1", kind: "henchman", name: "Old Retainer" },
    ],
  };

  const options = campaignMapCompanionsFromCharacterData("chr_123", "Cecil", JSON.stringify(data));
  assert.deepEqual(options.map(option => [option.name, option.label]), [
    ["Ashfang", "Beastmaster Companion"],
    ["Pella", "Henchkeeper"],
    ["Moth", "Spirit Familiar"],
  ]);
  assert.equal(options[0].id, campaignMapCompanionSourceId("chr_123", "beastmaster-1"));
  assert.equal(campaignMapCompanionCharacterId(options[2].id), "chr_123");
  assert.equal(campaignMapCompanionCharacterId("not-a-companion-source"), null);
});

test("companion token migration preserves existing placements and size rows", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON; CREATE TABLE campaigns (id TEXT PRIMARY KEY NOT NULL);");
  database.exec("INSERT INTO campaigns (id) VALUES ('campaign-1')");
  applyMigration(database, await read("drizzle/0014_campaign_map_foundation.sql"));
  applyMigration(database, await read("drizzle/0015_campaign_map_interactions.sql"));
  database.prepare(`INSERT INTO campaign_maps
    (id, campaign_id, name, is_active, background_width, background_height, version, created_at, updated_at)
    VALUES (?, ?, ?, 1, 1000, 800, 1, ?, ?)`)
    .run("map-1", "campaign-1", "Road", "now", "now");
  database.prepare(`INSERT INTO campaign_map_tokens
    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES (?, ?, ?, 'pc', ?, ?, 123, 456, 3, ?, ?)`)
    .run("token-pc", "campaign-1", "map-1", "chr_1", "Cecil", "now", "now");
  database.prepare(`INSERT INTO campaign_map_token_sizes
    (token_id, map_id, campaign_id, size_cells, updated_at) VALUES (?, ?, ?, 2, ?)`)
    .run("token-pc", "map-1", "campaign-1", "now");

  applyMigration(database, await read("drizzle/0021_action_bundle_9_companion_map_tokens.sql"));

  const preserved = database.prepare("SELECT kind, source_id AS sourceId, x, y, version FROM campaign_map_tokens WHERE id = 'token-pc'").get();
  assert.deepEqual({ ...preserved }, {
    kind: "pc", sourceId: "chr_1", x: 123, y: 456, version: 3,
  });
  assert.equal(database.prepare("SELECT size_cells AS sizeCells FROM campaign_map_token_sizes WHERE token_id = 'token-pc'").get().sizeCells, 2);
  database.prepare(`INSERT INTO campaign_map_tokens
    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES ('token-companion', 'campaign-1', 'map-1', 'companion', 'chr_1::beastmaster-1', 'Ashfang', 200, 200, 1, 'now', 'now')`).run();
  assert.equal(database.prepare("SELECT kind FROM campaign_map_tokens WHERE id = 'token-companion'").get().kind, "companion");
  assert.throws(() => database.prepare(`INSERT INTO campaign_map_tokens
    (id, campaign_id, map_id, kind, source_id, name, x, y, version, created_at, updated_at)
    VALUES ('bad', 'campaign-1', 'map-1', 'pet', 'bad', 'Bad', 0, 0, 1, 'now', 'now')`).run());
});

test("map services, API, UI, and release path explicitly support companion tokens", async () => {
  const [service, route, launcher, css, migrateScript, migrateWorkflow, deployWorkflow] = await Promise.all([
    read("lib/campaigns/map.ts"),
    read("app/api/campaigns/[id]/map/tokens/route.ts"),
    read("app/campaigns/campaign-map-launcher.tsx"),
    read("app/campaigns/campaign-map.css"),
    read("scripts/migrate-campaign-map-foundation.mjs"),
    read(".github/workflows/migrate-campaign-map-foundation.yml"),
    read(".github/workflows/deploy-production.yml"),
  ]);

  assert.match(service, /"pc" \| "npc" \| "companion"/u);
  assert.match(service, /placeCampaignMapCompanionToken/u);
  assert.match(service, /campaignMapCompanionCharacterId\(sourceId\)/u);
  assert.match(service, /actorOwnsActiveCompanionSource\(db, actor, access\.campaignInternalId, token\.sourceId\)/u);
  assert.match(route, /body\.action === "place_companion"/u);
  assert.match(launcher, /action: "place_companion"/u);
  assert.match(launcher, /companion\.characterName\} · \{companion\.label/u);
  assert.match(css, /campaign-map-token-companion/u);
  assert.match(migrateScript, /0021_action_bundle_9_companion_map_tokens\.sql/u);
  assert.match(migrateWorkflow, /0021_action_bundle_9_companion_map_tokens\.sql/u);
  assert.match(deployWorkflow, /0021_action_bundle_9_companion_map_tokens/u);
});
