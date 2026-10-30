import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("GM-owned audio references are additive, scoped and linked to an actual recap", async () => {
  const [sql, schema] = await Promise.all([
    read("../drizzle/0035_recap_user_audio_storage.sql"),
    read("../db/schema.ts"),
  ]);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS user_recap_storage_connections/u);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS campaign_recap_audio_assets/u);
  assert.match(sql,/FOREIGN KEY\(connection_id, storage_owner_user_id\)/u);
  assert.match(sql,/REFERENCES user_recap_storage_connections\(id, user_id\)/u);
  assert.match(sql,/REFERENCES campaign_session_recaps\(id\)/u);
  assert.match(sql,/Recap belongs to another campaign/u);
  assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS campaign_recap_audio_assets_one_primary_idx/u);
  assert.match(sql,/credential_ciphertext TEXT/u);
  assert.match(sql,/CHECK\(status != 'connected' OR/u);
  assert.match(sql,/CHECK\(status != 'ready' OR/u);
  assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE|DELETE FROM/u);
  assert.match(schema,/userRecapStorageConnections/u);
  assert.match(schema,/campaignRecapAudioAssets/u);
});

test("player audio discovery requires campaign and specific recap authorization without exposing cloud file IDs", async () => {
  const [service, route] = await Promise.all([
    read("../lib/campaigns/recap-audio-assets.ts"),
    read("../app/api/campaigns/[id]/session-recaps/audio/route.ts"),
  ]);
  assert.match(service,/loadCampaignAccess\(db, actor, campaignId\)/u);
  assert.match(service,/getCampaignSessionRecap\(db, actor, campaignId, recapId\)/u);
  assert.match(service,/WHERE a\.campaign_id = \? AND a\.recap_id = \?/u);
  assert.match(service,/s\.user_id = a\.storage_owner_user_id/u);
  assert.match(route,/getSessionActor\(request\)/u);
  assert.match(route,/listRecapAudioForPlayer/u);
  assert.match(route,/cache-control": "private, no-store"/u);
  const playerProjection = service.slice(service.indexOf("return result.results.map"));
  assert.doesNotMatch(playerProjection, /remoteFileId|remote_file_id|credentialCiphertext|connectionId|storageOwnerUserId/u);
  assert.doesNotMatch(route,/export async function POST|export async function PUT|export async function DELETE/u);
});

test("audio storage migration verifies D1 and runs before deploying the Worker", async () => {
  const [migration, workflow] = await Promise.all([
    read("../scripts/migrate-recap-audio-storage.mjs"),
    read("../.github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(migration,/DATABASE_ID/u);
  assert.match(migration,/0035_recap_user_audio_storage\.sql/u);
  assert.match(migration,/0034_recap_processing_jobs\.sql/u);
  assert.match(migration,/d1_migrations/u);
  assert.match(workflow,/node scripts\/migrate-recap-audio-storage\.mjs/u);
  assert.ok(workflow.indexOf("Apply and verify GM-owned audio storage D1 migration")
    < workflow.indexOf("Deploy production Worker"));
});
