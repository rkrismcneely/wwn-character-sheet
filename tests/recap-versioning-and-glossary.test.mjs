import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("schema migration preserves every original job column and only removes old one-per-audio constraint",async()=>{
  const old=await read("drizzle/0048_recap_only_automation.sql");
  const migration=await read("drizzle/0051_recap_repeatable_summary_jobs.sql");
  assert.match(old,/UNIQUE\(audio_asset_id\)/u);
  assert.match(migration,/INSERT INTO campaign_recap_audio_summary_jobs_next/u);
  assert.match(migration,/generated_markdown/u);
  assert.match(migration,/interaction_id/u);
  assert.match(migration,/stage_url_ciphertext/u);
  assert.match(migration,/stage_error_code/u);
  assert.match(migration,/confirmed_at/u);
  assert.match(migration,/request_id TEXT/u);
  assert.match(migration,/CREATE UNIQUE INDEX campaign_recap_summary_one_active_audio_idx/u);
  assert.match(migration,/CREATE UNIQUE INDEX campaign_recap_summary_request_dedupe_idx/u);
  assert.doesNotMatch(migration,/UNIQUE\(audio_asset_id\)\s*\)/u);
  assert.match(migration,/DROP TABLE campaign_recap_audio_summary_jobs/u);
  assert.match(migration,/RENAME TO campaign_recap_audio_summary_jobs/u);
});
test("name spelling context includes all canonical Journal page titles and protects factual audio",async()=>{
  const runner=await read("lib/campaigns/recap-only-runner.ts");
  assert.match(runner,/SELECT title FROM campaign_journal_entries/u);
  assert.match(runner,/ORDER BY title ASC LIMIT 240/u);
  assert.match(runner,/GM JOURNAL PAGE TITLES — CANONICAL SPELLINGS/u);
  assert.match(runner,/Spell fantasy names exactly as these Journal titles/u);
  assert.match(runner,/audio clearly refers/u);
  assert.match(runner,/audio takes priority/u);
});
test("different detail levels are independent explicitly approved jobs, with request deduplication",async()=>{
  const [enqueue,route,ui,manager,prefs,workflow]=await Promise.all([
    read("lib/campaigns/recap-only-jobs.ts"),
    read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts"),
    read("app/campaigns/session-recap-auto-status.tsx"),
    read("app/campaigns/session-recap-manager.tsx"),
    read("app/account/recap-auto-settings.tsx"),
    read(".github/workflows/migrate-session-recaps.yml"),
  ]);
  assert.match(enqueue,/input\.detail\?\?preferences\?\.detail\?\?"detailed"/u);
  assert.match(enqueue,/request_id/u);
  assert.match(enqueue,/input\.requestId/u);
  assert.match(route,/detail:body\.detail,requestId:body\.requestId/u);
  assert.match(route,/ORDER BY created_at DESC LIMIT 16/u);
  assert.match(ui,/setRequestId\(crypto\.randomUUID\(\)\)/u);
  assert.match(ui,/detail:selectedDetail,requestId/u);
  assert.match(ui,/Summarize again/u);
  assert.match(ui,/Saved AI recap versions/u);
  assert.match(ui,/published&&<p/u);
  assert.match(ui,/if\(!published&&job\?\.generatedMarkdown/u);
  assert.match(manager,/<SessionRecapAutoStatus campaignId=\{campaignId\} recapId=\{editing\.id\} published/u);
  assert.match(prefs,/Default recap length/u);
  assert.match(workflow,/scripts\/migrate-recap-repeatable-jobs\.mjs/u);
  assert.ok(workflow.indexOf("node scripts/migrate-recap-repeatable-jobs.mjs")<
    workflow.indexOf("npx wrangler deploy"));
});
