import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/campaigns/recap-long-audio-runner.ts","utf8");
test("transient Gemini GET errors preserve submitted interaction for later polling",()=>{
  assert.match(source,/result\.status===429\|\|result\.status===500\|\|result\.status===502\|\|/);
  assert.match(source,/result\.status===503\|\|result\.status===504\)return/);
  assert.match(source,/await submitted\(env,job,part,key\)/);
  assert.match(source,/interaction_id=\?/);
});
