import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
test("real-provider Gemini smoke is manually dispatched, never automatic, and uses synthetic audio",async()=>{
  const [workflow,script]=await Promise.all([
    read(".github/workflows/recap-gemini-real-smoke.yml"),
    read("scripts/smoke-gemini-recap.mjs"),
  ]);
  assert.match(workflow,/workflow_dispatch:/u);
  assert.doesNotMatch(workflow,/push:|schedule:|pull_request:|on: \[/u);
  assert.match(workflow,/secrets\.TWE_GEMINI_SMOKE_API_KEY/u);
  assert.match(script,/if\(!KEY\)throw Error/u);
  assert.match(script,/function tinyWav\(\)/u);
  assert.match(script,/x-goog-upload-command":"upload, finalize"/u);
  assert.match(script,/x-goog-upload-status"\),"final"/u);
  assert.match(script,/background:true,store:true/u);
  assert.match(script,/method:"DELETE"/u);
  assert.doesNotMatch(script,/campaign_recap_audio_assets|storage_owner_user_id|process\.env\.GEMINI_API_KEY/u);
});
