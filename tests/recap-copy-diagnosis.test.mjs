import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync("app/campaigns/session-recap-auto-status.tsx","utf8");
test("copy diagnostics includes safe provider diagnosis when available",()=>{
  assert.match(ui,/currentDiagnosis\.value\.title/);
  assert.match(ui,/currentDiagnosis\.value\.kind/);
  assert.match(ui,/currentDiagnosis\.value\.explanation/);
  assert.match(ui,/currentDiagnosis\.value\.inputTokens/);
  assert.match(ui,/currentDiagnosis\.sectionCount/);
  assert.match(ui,/Gemini diagnosis: not available/);
});
