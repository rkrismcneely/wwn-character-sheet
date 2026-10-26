import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const editor = readFileSync(new URL("../app/campaigns/journal-visual-editor.tsx", import.meta.url), "utf8");
test("new-page template remains selectable and can be cleared", () => {
  assert.match(editor, /!current && <div className="journal-template-choice"/u);
  assert.match(editor, /value=\{template\}/u);
  assert.match(editor, /Clear template/u);
});
test("replacing edited template content asks before overwriting", () => {
  assert.match(editor, /value !== templateApplied\.current && !window\.confirm\(/u);
  assert.match(editor, /Replace the current page content with this template\?/u);
});
test("secondary editor controls live in an expandable Insert menu", () => {
  assert.match(editor, /<details className="journal-editor-insert-menu"/u);
  assert.match(editor, /<\/div><\/details>/u);
});

