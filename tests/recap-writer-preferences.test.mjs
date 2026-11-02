import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");

test("Groq 120B is the preferred writer and Gemini remains selectable",()=>{
  const choices=read("lib/campaigns/recap-groq-writer.ts");
  assert.match(choices,/DEFAULT_RECAP_WRITER = `groq:\$\{GROQ_RECAP_MODEL\}`/);
  for(const model of ["groq:openai/gpt-oss-120b","groq:openai/gpt-oss-20b","gemini:gemini-3.8-flash"])
    assert.ok(choices.includes(model),model);
  assert.match(choices,/if\(!selected\)throw new Error/);
});

test("GM writer preference is stored, validated, and presented in Account",()=>{
  const api=read("app/api/account/recap-preferences/route.ts");
  const ui=read("app/account/recap-auto-settings.tsx");
  const migration=read("drizzle/0053_recap_writer_preferences.sql");
  assert.match(api,/writer_model AS writerModel/);
  assert.match(api,/selectRecapWriter\(body.writerModel/);
  assert.match(api,/writer_model=excluded.writer_model/);
  assert.match(ui,/id="recap-writer-model"/);
  assert.match(ui,/RECAP_WRITER_CHOICES.map/);
  assert.match(ui,/detail,writerModel/);
  assert.match(migration,/ALTER TABLE user_recap_auto_preferences ADD COLUMN writer_model/);
});

test("Auto Summarize persists the GM-selected model per job",()=>{
  const ui=read("app/campaigns/session-recap-auto-status.tsx");
  const route=read("app/api/campaigns/[id]/session-recaps/auto-recap/route.ts");
  const jobs=read("lib/campaigns/recap-only-jobs.ts");
  assert.match(ui,/writerModel:selectedWriter/);
  assert.match(ui,/setSelectedWriter\(defaultWriter\)/);
  assert.match(route,/writerModel:body.writerModel/);
  assert.match(jobs,/selectRecapWriter\(input.writerModel/);
  assert.match(jobs,/"pending_upload",detail,writerModel/);
});

test("Groq key storage is independent from Gemini and cannot trigger AI generation",()=>{
 const migration=read("drizzle/0054_recap_groq_connections.sql");
 const key=read("lib/account/recap-groq-key.ts");
 const route=read("app/api/account/recap-ai/groq/route.ts");
 const account=read("app/account/recap-auto-settings.tsx");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS user_recap_groq_connections/);
 assert.match(key,/twe:recap-ai:v1:groq:/);
 assert.match(route,/user_recap_groq_connections/);
 assert.match(route,/https:\/\/api.groq.com\/openai\/v1\/models/);
 assert.doesNotMatch(route,/chat\/completions|audio\/transcriptions/);
 assert.match(account,/RecapGroqConnection/);
});
