import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSharedRollCategory, resolveRoll } from "../app/rolls.ts";
import {
  normalizeSharedRollRequest,
  toCampaignSharedRoll,
} from "../lib/campaigns/shared-roll.ts";

test("only semantic contextual roll categories are shareable", () => {
  assert.equal(isSharedRollCategory("generic"), false);
  for (const category of ["skill", "save", "initiative", "attack", "damage"]) {
    assert.equal(isSharedRollCategory(category), true);
  }
  assert.throws(() => normalizeSharedRollRequest({ category: "generic", label: "d20 Roll", dice: { count: 1, sides: 20 } }, { id: "chr_one", name: "Hero" }));
});

test("the server-issued shared result preserves one authoritative raw roll", async () => {
  let randomCalls = 0;
  const request = normalizeSharedRollRequest({
    category: "skill",
    character: { id: "forged", name: "Forged" },
    label: "Know (INT) Check",
    dice: { count: 2, sides: 6 },
    modifiers: [{ label: "Know skill", value: 1 }, { label: "INT", value: 2 }],
  }, { id: "chr_real", name: "Cecil the Amber" });
  const result = toCampaignSharedRoll(await resolveRoll(request, {
    roll: () => { randomCalls += 1; return { count: 2, sides: 6, results: [5, 4], total: 9 }; },
    now: () => new Date("2026-08-25T12:00:00.000Z"),
    createId: () => "roll-authoritative",
  }));
  assert.equal(randomCalls, 1);
  assert.deepEqual(result.dice.results, [5, 4]);
  assert.equal(result.total, 12);
  assert.deepEqual(result.character, { id: "chr_real", name: "Cecil the Amber" });
});

test("shared session transport keeps party status authoritative, realtime, and reconnect-safe", async () => {
  const [sheet, route, characterRoute, durable, sessionUi, sessionClient] = await Promise.all([
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/campaigns/[id]/session/rolls/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/characters/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/campaign-live-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-live-session.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/use-live-session.ts", import.meta.url), "utf8"),
  ]);
  assert.match(sheet, /isSharedRollCategory\(request\.category\)/u);
  assert.match(sheet, /preparedSharedRoll\?\.dice \|\| rollDice/u);
  assert.match(sheet, /action: "publish"/u);
  assert.match(route, /authorizeLiveSessionRoll/u);
  assert.match(route, /resolveRoll\(rollRequest\)/u);
  assert.match(characterRoute, /activeCharacterStatusTargets/u);
  assert.match(characterRoute, /announceCharacterStatus/u);
  assert.match(durable, /INSERT OR IGNORE INTO session_rolls/u);
  assert.match(durable, /published_at IS NULL/u);
  assert.match(durable, /LIMIT 50/u);
  assert.match(durable, /type: "session\.roll"/u);
  assert.match(durable, /announceCharacterStatus/u);
  assert.match(durable, /session\.character-status/u);
  assert.match(sessionClient, /recentRolls\.some\(roll => roll\.id === message\.roll\.id\)/u);
  assert.match(sessionClient, /message\.type === "session\.character-status"/u);
  assert.match(sessionUi, /Live Rolls/u);
  assert.match(sessionUi, />Party</u);
  assert.match(sessionClient, /ws\.onopen = \(\) => \{[\s\S]*?void load\(\)/u);
});
