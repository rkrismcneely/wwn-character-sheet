import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/character-creation-review.css", import.meta.url), "utf8");

test("guided creation review loads compact HP roll styling", () => {
  assert.match(layout, /import "\.\/character-creation-review\.css";/);
  assert.match(css, /grid-template-columns:\s*72px\s+max-content/);
  assert.match(css, /> p \+ label > input/);
  assert.match(css, /width:\s*72px/);
  assert.match(css, /> p \+ label \+ button/);
  assert.match(css, /white-space:\s*nowrap/);
});
