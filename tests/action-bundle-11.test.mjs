import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  attributeImprovementCostForCount,
  attributeImprovementCostForNext,
  nextFocusOpportunityAfter,
} from "../app/level-advancement.ts";
import {
  normalizeLanguages,
  officialLanguages,
  startingLanguageAllowance,
} from "../app/language-data.ts";
import { plainLanguageSummary } from "../app/plain-language.ts";
import {
  builtInBestiaryCreatures,
  builtInBestiaryCreatureDraft,
  builtInBestiaryEncounterSeed,
  searchBestiaryCreatures,
} from "../lib/campaigns/bestiary.ts";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Bundle 11 keeps the shared level-up progression messages canonical", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map(attributeImprovementCostForCount),
    [0, 1, 3, 6, 10, 15],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(attributeImprovementCostForNext),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    [1, 2, 4, 5, 6, 7, 9, 10].map(nextFocusOpportunityAfter),
    [2, 5, 5, 7, 7, 10, 10, null],
  );
});

test("Bundle 11 uses the same starting-language rules and catalog everywhere", () => {
  assert.equal(startingLanguageAllowance(-1, -1), 2);
  assert.equal(startingLanguageAllowance(0, -1), 3);
  assert.equal(startingLanguageAllowance(1, -1), 4);
  assert.deepEqual(normalizeLanguages(["Common", "Trade Cant", "Common"]), ["Common", "Trade Cant"]);
  assert.ok(officialLanguages.includes("Common"));
  assert.ok(officialLanguages.includes("Trade Cant"));
});

test("plain-language explanations remain player-facing and shared", () => {
  assert.equal(
    plainLanguageSummary("Sense Magic", "Full rules text"),
    "Lets you see magical energy, identify active magic, and see in darkness.",
  );
  assert.match(
    plainLanguageSummary("Example", "As a Main action, you can summon a helpful creature."),
    /You summon a helpful creature\./u,
  );
});

test("creation and level-up surfaces expose Bundle 11 guidance and workflow boundaries", async () => {
  const [base, creation, levelUp, sheet] = await Promise.all([
    source("app/character-creation-base.ts"),
    source("app/character-creation-wizard.tsx"),
    source("app/level-up-wizard.tsx"),
    source("app/character-sheet.tsx"),
  ]);
  assert.match(base, /id: "languages", label: "Languages"/u);
  assert.match(base, /startingLanguageAllowance/u);
  assert.match(creation, /title="Languages"/u);
  assert.match(creation, /Cancel Character Creation/u);
  assert.match(creation, /lastStepStorageKey\(persistenceKey\)/u);
  assert.match(creation, /item\.id !== "magic" \|\| creationStatus\.hasMagicStep/u);
  assert.match(creation, /plainLanguageSummary\(selectedFocus\.name/u);
  assert.match(levelUp, /attributeImprovementCostForNext/u);
  assert.match(levelUp, /plan\.nextFocusLevel/u);
  assert.match(levelUp, /plainLanguageSummary\(selectedArt\.name/u);
  assert.match(sheet, /<Section title="Background & Class Benefits" buildControlled>/u);
  assert.match(sheet, /guidedCreationModeFromUrl\(window\.location\.href\)/u);
  assert.match(sheet, /guidedCreationNewRecord\.current/u);
  assert.match(sheet, /sessionStorage\.setItem\(guidedNewRecordStorageKey\(payload\.id\), "1"\)/u);
  assert.match(sheet, /window\.location\.assign\("\/"\)/u);
  assert.match(sheet, /Cancel character creation\?/u);
});

test("the 35 SRD Bestiary entries retain clean copy, notes, search aliases, and mechanics", () => {
  const srdCreatures = builtInBestiaryCreatures.filter(
    (creature) => creature.source.name === "Worlds Without Number SRD",
  );
  assert.equal(srdCreatures.length, 35);
  for (const creature of srdCreatures) {
    assert.match(creature.description, /^[A-Z][^.]+\.$/u, creature.name);
    assert.doesNotMatch(creature.description, /\b(?:import|debug|statblock|source)\b/iu, creature.name);
    const draft = builtInBestiaryCreatureDraft(creature.id);
    const seed = builtInBestiaryEncounterSeed(creature.id);
    assert.ok(draft);
    assert.ok(seed);
    assert.deepEqual(
      {
        hpMax: draft.hpMax,
        armorClass: draft.armorClass,
        physicalSave: draft.physicalSave,
        evasionSave: draft.evasionSave,
        mentalSave: draft.mentalSave,
        attacks: draft.attacks,
        spells: draft.spells,
        arts: draft.arts,
        notes: draft.notes,
      },
      {
        hpMax: creature.hpMax,
        armorClass: creature.armorClass,
        physicalSave: creature.physicalSave,
        evasionSave: creature.evasionSave,
        mentalSave: creature.mentalSave,
        attacks: creature.attacks,
        spells: creature.spellcasting?.spells ?? [],
        arts: creature.spellcasting?.arts ?? [],
        notes: creature.notes,
      },
    );
    assert.equal(seed.hpMax, creature.hpMax);
    assert.equal(seed.armorClass, creature.armorClass);
    assert.deepEqual(seed.combatStats.saves, {
      physical: creature.physicalSave,
      evasion: creature.evasionSave,
      mental: creature.mentalSave,
    });
    assert.deepEqual(seed.combatStats.sourceStats, creature.sourceStats);
    assert.equal(seed.notes, creature.notes);
    if (creature.armorAnnotation) assert.equal(creature.notes, "", `${creature.name} should not duplicate structural armor`);
    if (creature.spellcasting) assert.match(creature.notes, /^TWE representative /u, creature.name);
  }

  const search = (query) => searchBestiaryCreatures(builtInBestiaryCreatures, query).map((creature) => creature.name);
  assert.ok(search("bandit").includes("Thug or Militia"));
  assert.ok(search("soldier").includes("Veteran Soldier"));
  assert.ok(search("wizard").includes("Petty Mage"));
  assert.ok(search("shaman").includes("Tribal Shaman"));
  assert.ok(search("Thug or Militia").includes("Thug or Militia"));
});
