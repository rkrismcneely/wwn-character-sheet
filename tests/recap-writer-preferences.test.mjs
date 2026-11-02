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
