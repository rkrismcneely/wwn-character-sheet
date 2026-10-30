import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseCraigRecording, parseRecapSessionDate, parseRecapSpeaker,
} from "../lib/campaigns/recap-import-validation.ts";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Craig links require HTTPS, expected host, recording path and access key", () => {
  const parsed = parseCraigRecording("https://craig.horse/rec/abc123?key=temporary-test-key");
  assert.equal(parsed.label, "Craig recording abc123");
  assert.equal(parsed.reference, "https://craig.horse/rec/abc123?key=temporary-test-key");
  for (const input of [
    "http://craig.horse/rec/abc123?key=x",
    "https://craig.horse.evil.invalid/rec/abc123?key=x",
    "https://craig.horse/rec/abc123",
    "https://craig.horse@evil.invalid/rec/abc123?key=x",
    "https://craig.horse/private?key=x",
    "file:///tmp/recording",
  ]) assert.throws(() => parseCraigRecording(input));
});

test("guest, GM and player identities support permanent Discord IDs and custom names", () => {
  const guest = parseRecapSpeaker({
    discordName: "VisitingPlayer", displayName: "Alex", role: "guest",
    characterName: "Sir Aldric",
  });
  assert.equal(guest.speakerKey, "name:visitingplayer");
  assert.equal(guest.characterName, "Sir Aldric");
  const gm = parseRecapSpeaker({
    discordName: "DMAccount", displayName: "Game Master", role: "gm",
    discordUserId: "123456789012345678",
  });
  assert.equal(gm.speakerKey, "id:123456789012345678");
  assert.equal(gm.characterId, null);
  assert.throws(() => parseRecapSpeaker({
    discordName: "Someone", displayName: "Someone", role: "player",
    characterId: "abc", characterName: "Another",
  }));
  assert.throws(() => parseRecapSpeaker({ discordName: "Me", role: "player" }));
  assert.equal(parseRecapSessionDate("2026-10-29"), "2026-10-29");
  assert.throws(() => parseRecapSessionDate("2026-02-30"));
});

test("recording import schema is additive and retains session speaker snapshots", async () => {
  const [sql, service, migration, workflow, schema] = await Promise.all([
    read("../drizzle/0033_recap_recording_foundation.sql"),
    read("../lib/campaigns/recap-imports.ts"),
    read("../scripts/migrate-recap-imports.mjs"),
    read("../.github/workflows/migrate-session-recaps.yml"),
    read("../db/schema.ts"),
  ]);
  for (const table of ["campaign_recap_speakers", "campaign_recap_recording_imports", "campaign_recap_recording_speakers"]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
    assert.ok(schema.includes('"' + table + '"'));
  }
  assert.match(sql, /REFERENCES campaigns\(id\) ON DELETE CASCADE/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|ALTER TABLE/u);
  assert.match(service, /canManageCampaignContent\(actor, record\.campaign, record\.membership\)/u);
  assert.match(service, /requireActiveCampaign\(record\.campaign\)/u);
  assert.match(service, /source_reference contains the Craig access key/u);
  assert.match(service, /db\.batch\(\[/u);
  assert.match(service, /FROM campaign_recap_speakers WHERE campaign_id=\?/u);
  assert.match(migration, /0033_recap_recording_foundation\.sql/u);
  assert.match(migration, /DATABASE_ID/u);
  assert.match(workflow, /scripts\/migrate-recap-imports\.mjs/u);
  assert.ok(workflow.indexOf("Apply and verify recording import foundation D1 migration")
    < workflow.indexOf("Deploy production Worker"));
});

test("GM-only routes and new session creation mode coexist with manual recaps", async () => {
  const [imports, speakers, manager, setup] = await Promise.all([
    read("../app/api/campaigns/[id]/recap-imports/route.ts"),
    read("../app/api/campaigns/[id]/recap-speakers/route.ts"),
    read("../app/campaigns/session-recap-manager.tsx"),
    read("../app/campaigns/session-recap-recording-setup.tsx"),
  ]);
  for (const method of ["GET", "POST", "PATCH"]) {
    assert.match(imports, new RegExp("export async function " + method));
  }
  assert.match(speakers, /export async function DELETE/u);
  assert.match(speakers, /export const PATCH = save/u);
  assert.match(imports, /readBoundedJson\(request, 8 \* 1024\)/u);
  assert.match(manager, /<SessionRecapRecordingSetup campaignId=\{campaignId\}/u);
  assert.match(manager, /Write recap/u);
  assert.match(manager, /Import recording/u);
  assert.match(manager, /method: editing === "new" \? "POST" : "PATCH"/u);
  assert.match(setup, /Guest/u);
  assert.match(setup, /Game Master \(may play multiple NPCs\)/u);
  assert.match(setup, /Confirm Speakers/u);
  assert.match(setup, /Transcription, audio uploading and automatic summaries are coming in later phases/u);
});
