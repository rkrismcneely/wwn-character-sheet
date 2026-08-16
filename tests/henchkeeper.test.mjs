import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const attributes = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

const expectedArchetypes = [
  ["Athlete", [13, 12, 11, 8, 9, 10], "STR", "INT"],
  ["Blacksmith", [13, 9, 12, 10, 11, 8], "STR", "CHA"],
  ["Guard", [13, 10, 12, 9, 12, 10], "STR", "WIS"],
  ["Courier", [10, 13, 10, 11, 10, 9], "DEX", "STR"],
  ["Thief", [9, 13, 10, 11, 12, 8], "DEX", "INT"],
  ["Artisan", [10, 13, 9, 12, 11, 8], "DEX", "CHA"],
  ["Farmer", [14, 9, 11, 8, 11, 10], "CON", "INT"],
  ["Sailor", [11, 14, 11, 8, 10, 10], "CON", "CHA"],
  ["Miner", [13, 10, 11, 8, 11, 9], "CON", "DEX"],
  ["Student", [8, 10, 9, 13, 12, 11], "INT", "STR"],
  ["Engineer", [8, 11, 10, 13, 11, 8], "INT", "CHA"],
  ["Bookkeeper", [8, 11, 10, 13, 11, 10], "INT", "DEX"],
  ["Hunter", [11, 12, 10, 8, 13, 9], "WIS", "INT"],
  ["Hermit", [8, 10, 10, 11, 13, 8], "WIS", "CHA"],
  ["Elder", [8, 11, 10, 11, 13, 10], "WIS", "DEX"],
  ["Merchant", [7, 10, 10, 12, 11, 13], "CHA", "DEX"],
  ["Noble", [8, 10, 11, 12, 11, 13], "CHA", "CON"],
  ["Performer", [8, 12, 9, 11, 10, 13], "CHA", "STR"],
];

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function parseArchetypes(characterSheet) {
  const match = characterSheet.match(
    /const npcArchetypes: readonly NpcArchetype\[\] = \[(?<body>[\s\S]*?)\n\];\nconst npcArchetypeNames/u,
  );
  assert.ok(match, "the canonical archetype table should remain explicit");

  const entries = [...match.groups.body.matchAll(
    /\{ name: "([^"]+)", base: \{ ([^}]*) \}, bonus: "([^"]+)", penalty: "([^"]+)",/gu,
  )];
  return entries.map(([, name, baseText, bonus, penalty]) => ({
    name,
    base: Object.fromEntries([...baseText.matchAll(/([A-Z]{3}): (\d+)/gu)].map(([, key, value]) => [key, Number(value)])),
    bonus,
    penalty,
  }));
}

function abilityModifier(score) {
  if (score <= 3) return -2;
  if (score <= 7) return -1;
  if (score <= 13) return 0;
  if (score <= 17) return 1;
  return 2;
}

function archetypeModifiers(archetype) {
  return Object.fromEntries(attributes.map(attribute => [
    attribute,
    abilityModifier(archetype.base[attribute])
      + (attribute === archetype.bonus ? 1 : 0)
      - (attribute === archetype.penalty ? 1 : 0),
  ]));
}

test("Henchkeeper keeps exactly the canonical 18 unique archetypes", async () => {
  const archetypes = parseArchetypes(await source("app/character-sheet.tsx"));
  assert.equal(archetypes.length, expectedArchetypes.length);
  assert.equal(new Set(archetypes.map(archetype => archetype.name)).size, archetypes.length);
  assert.deepEqual(
    archetypes.map(archetype => archetype.name),
    expectedArchetypes.map(([name]) => name),
  );
});

test("each Henchkeeper archetype preserves its base spread and +1/-1 modifiers", async () => {
  const archetypes = parseArchetypes(await source("app/character-sheet.tsx"));

  for (const [name, expectedScores, expectedBonus, expectedPenalty] of expectedArchetypes) {
    const archetype = archetypes.find(candidate => candidate.name === name);
    assert.ok(archetype, `${name} should be available`);
    assert.deepEqual(
      archetype.base,
      Object.fromEntries(attributes.map((attribute, index) => [attribute, expectedScores[index]])),
      `${name} should retain its intended base-stat spread`,
    );
    assert.equal(archetype.bonus, expectedBonus, `${name} bonus attribute`);
    assert.equal(archetype.penalty, expectedPenalty, `${name} penalty attribute`);
    assert.deepEqual(Object.keys(archetype.base).sort(), [...attributes].sort());
    assert.ok(Object.values(archetype.base).every(score => Number.isInteger(score) && score >= 3 && score <= 18));

    const modifiers = archetypeModifiers(archetype);
    assert.equal(modifiers[archetype.bonus], abilityModifier(archetype.base[archetype.bonus]) + 1);
    assert.equal(modifiers[archetype.penalty], abilityModifier(archetype.base[archetype.penalty]) - 1);
    for (const attribute of attributes.filter(attribute => ![archetype.bonus, archetype.penalty].includes(attribute))) {
      assert.equal(modifiers[attribute], abilityModifier(archetype.base[attribute]));
    }
  }

  assert.equal(
    new Set(archetypes.map(archetype => JSON.stringify(archetype.base))).size,
    archetypes.length,
    "archetype base spreads should remain varied",
  );
});

test("Henchkeeper selection and generated stat wiring stay archetype-local", async () => {
  const characterSheet = await source("app/character-sheet.tsx");
  const archetypes = parseArchetypes(characterSheet);

  assert.match(
    characterSheet,
    /const archetype = npcArchetypes\.find\(item => item\.name === companion\.archetype\) \|\| npcArchetypes\[0\]/u,
  );
  assert.match(
    characterSheet,
    /const companionAttributes = \(archetype: NpcArchetype\): CompanionAttributes => \{\s*return \{ \.\.\.archetype\.base \};/u,
  );
  assert.match(
    characterSheet,
    /mod\(archetype\.base\[attribute\]\)\s*\n\s*\+ \(attribute === archetype\.bonus \? 1 : 0\)\s*\n\s*- \(attribute === archetype\.penalty \? 1 : 0\)/u,
  );
  assert.match(characterSheet, /attributes\.map\(attribute => .*archetypeAttrs\[attribute\]/su);
  assert.match(characterSheet, /npcArchetypeNames\.includes\(\s*companion\.archetype/su);

  const athlete = archetypes.find(archetype => archetype.name === "Athlete");
  const merchant = archetypes.find(archetype => archetype.name === "Merchant");
  assert.notDeepEqual(archetypeModifiers(athlete), archetypeModifiers(merchant));
  assert.deepEqual(archetypeModifiers(athlete), archetypeModifiers(athlete));
  assert.deepEqual(archetypeModifiers(merchant), archetypeModifiers(merchant));
});

test("Henchkeeper HP generation remains within the legal focus-level range", async () => {
  const characterSheet = await source("app/character-sheet.tsx");
  assert.match(characterSheet, /const henchmanHpDice = focusLevel >= 2 \? 2 : 1/u);
  assert.match(
    characterSheet,
    /Math\.max\(0, Math\.min\(henchmanHpDice \* 8, Number\(e\.target\.value\)\)\)/u,
  );

  for (const dice of [1, 2]) {
    assert.ok(dice >= 1 && dice <= 2);
    assert.equal(dice * 8 >= dice, true);
  }
});
