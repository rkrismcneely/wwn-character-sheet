import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("session recap storage is additive, campaign-scoped and correctly ordered", async () => {
  const [sql, service, migrator, workflow] = await Promise.all([
    read("../drizzle/0032_campaign_session_recaps.sql"),
    read("../lib/campaigns/session-recaps.ts"),
    read("../scripts/migrate-session-recaps.mjs"),
    read("../.github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS campaign_session_recaps/u);
  assert.match(sql, /REFERENCES campaigns\(id\) ON DELETE CASCADE/u);
  assert.match(sql, /campaign_session_recaps_date_idx/u);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|ALTER TABLE/u);
  assert.match(service, /SESSION_RECAP_PAGE_SIZE = 10/u);
  assert.match(service, /session_date DESC, created_at DESC, id DESC/u);
  assert.match(service, /LIMIT \? OFFSET \?/u);
  assert.match(service, /const totalPages = Math\.max\(1, Math\.ceil\(total \/ SESSION_RECAP_PAGE_SIZE\)\)/u);
  assert.match(service, /WHERE campaign_id = \? AND id = \?/u);
  assert.match(service, /canManageCampaignContent\(actor, record\.campaign, record\.membership\)/u);
  assert.match(service, /requireActiveCampaign\(record\.campaign\)/u);
  assert.match(service, /loadCampaignAccess\(db, actor, campaignId\)/u);
  assert.match(service, /AND updated_at = \?/u);
  assert.match(service, /existing \? 409 : 404/u);
  assert.match(migrator, /DATABASE_ID/u);
  assert.match(migrator, /0032_campaign_session_recaps\.sql/u);
  assert.match(migrator, /PRAGMA table_info\(campaign_session_recaps\)/u);
  assert.match(workflow, /scripts\/migrate-session-recaps\.mjs/u);
  assert.ok(workflow.indexOf("Apply and verify session recap D1 migration") < workflow.indexOf("Deploy production Worker"));
});

test("recap API authenticates every operation and reserves writes for GM service checks", async () => {
  const [route, service] = await Promise.all([
    read("../app/api/campaigns/[id]/session-recaps/route.ts"),
    read("../lib/campaigns/session-recaps.ts"),
  ]);
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    assert.match(route, new RegExp(`export async function ${method}\\(`));
  }
  assert.equal((route.match(/getSessionActor\(request\)/gu) ?? []).length, 4);
  assert.match(route, /if \(query\.get\("view"\) === "player"\)/u);
  assert.match(route, /if \(query\.has\("recapId"\)\)/u);
  assert.match(route, /readBoundedJson\(request, 40 \* 1024\)/u);
  assert.match(service, /Only campaign GMs can edit session recaps/u);
  assert.match(service, /Enter a valid session date/u);
  assert.match(service, /length > 30000/u);
});

test("GM Console has session recap tab with editor, preview, ten-card pagination and revisit", async () => {
  const [console, editor] = await Promise.all([
    read("../app/campaigns/gm-console.tsx"),
    read("../app/campaigns/session-recap-manager.tsx"),
  ]);
  assert.match(console, /"party" \| "recaps"/u);
  assert.match(console, /item === "recaps" \? "Session Recap"/u);
  assert.match(console, /tab === "recaps" && <SessionRecapManager campaignId=\{campaignId\}/u);
  assert.match(editor, />New Session<\/button>/u);
  assert.match(editor, /type="date" required/u);
  assert.match(editor, /maxLength=\{120\}/u);
  assert.match(editor, /maxLength=\{30000\}/u);
  assert.match(editor, /Preview Markdown/u);
  assert.match(editor, /<SessionRecapMarkdown content=\{draft\.content\}/u);
  assert.match(editor, /method: editing === "new" \? "POST" : "PATCH"/u);
  assert.match(editor, /updatedAt: editing\.updatedAt/u);
  assert.match(editor, /setEditing\(null\); setPreview\(false\); setImportNotice\(""\);\s*recapPageCache\.delete\(campaignId\);[\s\S]*?await loadPage\(1\)/u);
  assert.match(editor, /Page \{page\} \/ \{data\.totalPages\}/u);
  assert.match(editor, /onClick=\{\(\) => void loadPage\(page - 1\)\}/u);
  assert.match(editor, /onClick=\{\(\) => void loadPage\(page \+ 1\)\}/u);
});

test("campaign player page inserts latest recap between resources and characters, with older dates", async () => {
  const [detail, panel, service] = await Promise.all([
    read("../app/campaigns/campaign-detail.tsx"),
    read("../app/campaigns/session-recap-panel.tsx"),
    read("../lib/campaigns/session-recaps.ts"),
  ]);
  const r = detail.indexOf('aria-labelledby="campaign-resources-title"');
  const p = detail.indexOf('<SessionRecapPanel campaignId={campaignId} />');
  const c = detail.indexOf('aria-labelledby="campaign-characters-title"');
  assert.ok(r >= 0 && r < p && p < c);
  assert.match(panel, /aria-label="Choose session recap"/u);
  assert.match(panel, /session-recaps\?view=player/u);
  assert.match(panel, /recapId=\$\{encodeURIComponent\(id\)\}/u);
  assert.match(panel, /setSelected\(result\.latest \?\? null\)/u);
  assert.match(panel, /dates\.map\(recap => <option/u);
  assert.match(service, /const latest = dates\.results\[0\]/u);
});

test("recap Markdown is rendered as React elements and forbids unsafe URL schemes or raw HTML", async () => {
  const markdown = await read("../app/campaigns/session-recap-markdown.tsx");
  assert.match(markdown, /url\.protocol === "https:" \|\| url\.protocol === "http:"/u);
  assert.match(markdown, /rel="noopener noreferrer"/u);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML|innerHTML\s*=/u);
  assert.match(markdown, /<h2 key=\{key\}>/u);
  assert.match(markdown, /<ul key=\{key\}>/u);
  assert.match(markdown, /<blockquote key=\{key\}>/u);
  assert.match(markdown, /<pre key=\{key\}>/u);
});

test("recap deletion is GM-only, confirmed and preserves Drive audio",async()=>{
  const [service,route,editor,storage]=await Promise.all([
    read("../lib/campaigns/session-recaps.ts"),
    read("../app/api/campaigns/[id]/session-recaps/route.ts"),
    read("../app/campaigns/session-recap-manager.tsx"),
    read("../drizzle/0035_recap_user_audio_storage.sql"),
  ]);
  assert.match(service,/export async function deleteCampaignSessionRecap/);
  assert.match(service,/await writable\(db,actor,campaignId\)/);
  assert.match(service,/DELETE FROM campaign_session_recaps WHERE campaign_id=\? AND id=\?/);
  assert.match(service,/twe-session-recap:/);
  assert.match(storage,/recap_id TEXT REFERENCES campaign_session_recaps\(id\) ON DELETE SET NULL/);
  assert.match(route,/export async function DELETE/);
  assert.match(editor,/window\.confirm\("Permanently delete this recap/);
  assert.match(editor,/Delete Recap/);
  assert.match(editor,/method:"DELETE"/);
});
