import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canRecordSpellCast,
  spellCastCost,
  spellCastCount,
  spellCastingUse,
} from "../app/spell-casting.ts";

test("legacy cast checkboxes migrate to a single recorded casting", () => {
  assert.equal(spellCastCount({ cast: true }), 1);
  assert.equal(spellCastCount({ cast: false }), 0);
  assert.equal(spellCastCount({ cast: true, casts: 3 }), 3);
  assert.equal(spellCastCount({ casts: 2.9 }), 2);
});

test("ordinary casters can record repeated uses of the same prepared spell", () => {
  const picks = [
    { name: "The Excellent Transpicuous Transformation", casts: 2 },
    { name: "The Coruscating Coffin", casts: 1 },
  ];
  assert.equal(spellCastingUse(picks, false, () => 1), 3);
  assert.equal(spellCastCost(false, 5), 1);
});

test("Invoker repeated casts continue to spend points equal to spell level", () => {
  const levels = new Map([
    ["Low Magic", 1],
    ["High Magic", 3],
  ]);
  const picks = [
    { name: "Low Magic", casts: 2 },
    { name: "High Magic", casts: 2 },
  ];
  assert.equal(spellCastingUse(picks, true, name => levels.get(name) ?? 0), 8);
  assert.equal(spellCastCost(true, 3), 3);
});

test("recording another cast respects preparation, restrictions, and the daily limit", () => {
  assert.equal(canRecordSpellCast({ prepared: true, castingBlocked: false, used: 2, limit: 3, cost: 1 }), true);
  assert.equal(canRecordSpellCast({ prepared: true, castingBlocked: false, used: 3, limit: 3, cost: 1 }), false);
  assert.equal(canRecordSpellCast({ prepared: true, castingBlocked: false, used: 2, limit: 4, cost: 3 }), false);
  assert.equal(canRecordSpellCast({ prepared: false, castingBlocked: false, used: 0, limit: 3, cost: 1 }), false);
  assert.equal(canRecordSpellCast({ prepared: true, castingBlocked: true, used: 0, limit: 3, cost: 1 }), false);
});

test("spellbook UI uses Cast, count, and Undo controls backed by cast counts", async () => {
  const source = await readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8");
  assert.match(source, /spellCastingUse\(\s*sheet\.spellPicks/u);
  assert.match(source, /spellCastCount\(pick\)/u);
  assert.match(source, /<Tip title="\\?" ariaLabel=\\{`Spell level \\$\\{spell\.level\\}`\\}>/u);
  assert.match(source, /className="spell-cast-button"/u);
  assert.match(source, />Cast<\/button>/u);
  assert.match(source, /className="spell-cast-count"/u);
  assert.match(source, />Undo<\/button>/u);
  assert.match(source, /casts: castCount \+ 1/u);
  assert.match(source, /casts: Math\.max\(0, castCount - 1\)/u);
});
