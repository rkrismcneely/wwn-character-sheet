import assert from "node:assert/strict";
import test from "node:test";

import { foci } from "../app/wwn-data.ts";
import { parseCharacter } from "../lib/characters/sanitize.ts";

test("Cultured uses its canonical Focus name", () => {
  assert.ok(foci.some((focus) => focus.name === "Cultured"));
  assert.equal(foci.some((focus) => focus.name === "Cultured Through"), false);
});

test("legacy Cultured Through character saves migrate to Cultured", () => {
  const parsed = parseCharacter({
    focusPicks: [{ name: "Cultured Through", level: 1 }],
  });

  assert.deepEqual(parsed?.focusPicks, [{ name: "Cultured", level: 1 }]);
});
