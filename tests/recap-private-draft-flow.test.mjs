import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("recording-first drafts are private by default and existing recaps stay published", async () => {
  const [sql, service, route] = await Promise.all([
    read("drizzle/0047_recap_private_drafts.sql"),
    read("lib/campaigns/session-recaps.ts"),
    read("app/api/campaigns/[id]/session-recaps/route.ts"),
  ]);
  assert.match(sql, /ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1/u);
  assert.match(sql, /CHECK\(is_published IN \(0,1\)\)/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM/u);
  assert.match(service, /PRIVATE_RECAP_DRAFT_CONTENT/u);
  assert.match(service, /draftOnly !== true/u);
  assert.match(service, /isPublished \? 1 : 0/u);
  assert.match(service, /is_published = 1/u);
  assert.match(route, /draftOnly\?: unknown/u);
});

test("draft content and recordings are not exposed to ordinary campaign players", async () => {
  const [service, audio, player] = await Promise.all([
    read("lib/campaigns/session-recaps.ts"),
    read("lib/campaigns/recap-drive-playback.ts"),
    read("app/campaigns/session-recap-panel.tsx"),
  ]);
  assert.match(service, /draftsVisible = canManageCampaignContent/u);
  assert.match(service, /draftsVisible \? "" : " AND is_published = 1"/u);
  assert.match(service, /row\.isPublished !== 1 && !canManageCampaignContent/u);
  assert.match(service, /WHERE campaign_id = \? AND is_published = 1/u);
  assert.match(audio, /getCampaignSessionRecap\(db,actor,campaignId,audio\.recapId\)/u);
  assert.match(player, /view=player/u);
});

test("GM can create and reopen a private recording draft with long Google Drive audio", async () => {
  const [ui, uploader, route] = await Promise.all([
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/campaigns/session-recap-audio-uploader.tsx"),
    read("app/api/campaigns/[id]/session-recaps/route.ts"),
  ]);
  assert.match(ui, /setCreateMethod\("recording"\)/u);
  assert.match(ui, /draftOnly:true/u);
  assert.match(ui, /createRecordingDraft/u);
  assert.match(ui, /content: recap\.content/u);
  assert.match(ui, /Publish approved recap/u);
  assert.match(ui, /Private GM draft · not visible to players/u);
  assert.match(ui, /<details className="session-recap-reading"[\s\S]*Advanced: Craig speaker tracks and full transcripts \(optional\)/u);
  assert.match(uploader, /uploadRecordingToDrive/u);
  assert.match(uploader, /Large 2–3-hour recordings upload in chunks/u);
  assert.match(route, /createCampaignSessionRecap/u);
});

test("new visibility migration is explicitly verified before production Worker deploy", async () => {
  const [script, workflow] = await Promise.all([
    read("scripts/migrate-recap-private-drafts.mjs"),
    read(".github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(script, /0047_recap_private_drafts\.sql/u);
  assert.match(script, /PRAGMA table_info\(campaign_session_recaps\)/u);
  assert.match(script, /campaign_session_recaps_published_date_idx/u);
  const migration = workflow.indexOf("node scripts/migrate-recap-private-drafts.mjs");
  const deploy = workflow.indexOf("npx wrangler deploy");
  assert.ok(migration >= 0 && deploy > migration, "migration must precede deploy");
});

test("Gemini account consent warns about free tier data use and no AI is started by recording drafts", async () => {
  const [ui, accounts] = await Promise.all([
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/account/recap-ai-connections.tsx"),
  ]);
  assert.match(ui, /Creating this draft alone does not start an AI request/u);
  assert.match(accounts, /content submitted under its free[\s\S]*Gemini API tier may be used to improve/u);
});
