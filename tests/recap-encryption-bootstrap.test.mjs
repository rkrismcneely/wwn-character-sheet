import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("production encryption bootstrap fails closed and never changes an existing credential key",async()=>{
  const [bootstrap,workflow]=await Promise.all([
    read("scripts/ensure-recap-encryption-secret.mjs"),
    read(".github/workflows/ensure-recap-encryption-secret.yml"),
  ]);
  assert.match(bootstrap,/randomBytes\(32\)\.toString\("base64url"\)/u);
  assert.match(bootstrap,/if \(names\(\)\.has\(NAME\)\) \{/u);
  assert.match(bootstrap,/preserving it unchanged/u);
  assert.match(bootstrap,/Unexpected Cloudflare secret listing/u);
  assert.match(bootstrap,/Cloudflare did not provide a valid secret listing/u);
  assert.match(bootstrap,/RECAP_STORAGE_ENCRYPTION_KEY/u);
  assert.doesNotMatch(bootstrap,/secret delete|secret bulk|console\.log\(secret\)|process\.env\[NAME\]/u);
  assert.match(workflow,/group: production-deployment/u);
  assert.match(workflow,/cancel-in-progress: false/u);
  assert.match(workflow,/node scripts\/ensure-recap-encryption-secret\.mjs/u);
  assert.match(workflow,/secrets\.CLOUDFLARE_API_TOKEN/u);
  assert.match(workflow,/secrets\.CLOUDFLARE_ACCOUNT_ID/u);
});

test("Gemini UI explains the per-recording process and missing operator encryption",async()=>{
  const ui=await read("app/account/recap-ai-connections.tsx");
  assert.match(ui,/Auto Summarize/u);
  assert.match(ui,/individual privacy and billing confirmation/u);
  assert.match(ui,/server-side encryption setup/u);
  assert.match(ui,/RECAP_STORAGE_ENCRYPTION_KEY/u);
  assert.doesNotMatch(ui,/enable automation in the preferences below/u);
});
