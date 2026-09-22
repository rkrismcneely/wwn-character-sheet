import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { additionalClassData } from "../app/additional-class-data.ts";
import {
  artSlots,
  classRules,
  forcedArtsForTraditions,
  fullClasses,
  partialClasses,
  traditionInfo,
} from "../app/class-data.ts";
import { creationSkillSources } from "../app/character-creation.ts";
import { advancementPlan } from "../app/level-advancement.ts";
import { plainLanguageSummary } from "../app/plain-language.ts";
import {
  armorRestrictsMagic,
  deriveSkillProfile,
  effortMaximum,
  missingArtPrerequisite,
} from "../app/phase2-rules.ts";

const thoughtNobleArts = [
  "Open Mind",
  "Block Memory",
  "Elicitation of Truth",
  "Facile Speech",
  "Far Speech",
  "Hypercognition",
  "Iconograph",
  "Impress Imperative",
  "Mind Light",
  "Mind Over Matter",
  "Mirror Mask",
  "Positive Association",
  "Read Intent",
  "Surface Apprehension",
  "Thoughts Like Razors",
  "Unthinkable Thought",
];

const advancementCharacter = (level, classOne = "Warrior") => ({
  level,
  classMode: "adventurer",
  classOne,
  classTwo: "Thought Noble",
  attrs: { STR: 14, DEX: 12, CON: 11, INT: 14, WIS: 12, CHA: 9 },
  attributeBoosts: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  focusPicks: [],
  artPicks: [],
  spellPicks: [],
  skillPurchases: {},
});

test("Thought Noble is partial-only, non-spellcasting, armor-compatible, and Notice-based", () => {
  assert.ok(partialClasses.includes("Thought Noble"));
  assert.ok(!fullClasses.includes("Thought Noble"));

  const info = traditionInfo["Thought Noble"];
  assert.equal(info.spells, false);
  assert.equal(info.effortSkill, "Notice");
  assert.deepEqual([...info.effortAttributes], ["INT", "WIS"]);
  assert.equal(info.usesEffort, true);
  assert.equal(armorRestrictsMagic(info.armor), false);
  assert.match(info.armor, /invisible to non-magical senses/u);
  assert.match(info.armor, /immune to that art for the rest of the scene/iu);
});

test("Thought Noble has the exact SRD Art catalog and Open Mind is mandatory", () => {
  assert.deepEqual(
    traditionInfo["Thought Noble"].arts.map((art) => art.name),
    thoughtNobleArts,
  );
  assert.deepEqual(forcedArtsForTraditions(["Thought Noble"]), ["Open Mind"]);
});

test("Thought Noble Art progression is 2 at level one and one more every level", () => {
  const expected = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  assert.deepEqual(additionalClassData["Thought Noble"].progression, expected);
  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) =>
      artSlots("Thought Noble", index + 1, true),
    ),
    expected,
  );
});

test("Thought Noble Effort is Notice plus the better of INT or WIS, minimum one", () => {
  assert.equal(
    effortMaximum({
      skillLevel: 0,
      attributeModifiers: [1, 0],
    }),
    1,
  );
  assert.equal(
    effortMaximum({
      skillLevel: 1,
      attributeModifiers: [0, 2],
    }),
    3,
  );
  assert.equal(
    effortMaximum({
      skillLevel: 0,
      attributeModifiers: [-1, -1],
    }),
    1,
  );
  assert.equal(
    effortMaximum({
      skillLevel: 2,
      attributeModifiers: [1, 2],
    }),
    4,
  );
});

test("Thought Noble Notice acquisition raises an existing Notice-0 to Notice-1", () => {
  const sources = creationSkillSources({
    background: "Courtesan",
    backgroundDevelopmentMethod: "quick",
    backgroundCombatSkill: "",
    backgroundQuickSkillReplacements: ["", ""],
    backgroundLearningPicks: [
      { result: "", choice: "", replacement: "" },
      { result: "", choice: "", replacement: "" },
    ],
    backgroundDevelopmentRolls: [],
    classMode: "adventurer",
    classOne: "Warrior",
    classTwo: "Thought Noble",
    focusPicks: [],
    vowedEffortSkill: "Exert",
    wiseConceptSkill: "",
  });

  assert.ok(
    sources.Notice.some((source) => /Courtesan/u.test(source)),
    "Courtesan quick skills should supply the first Notice acquisition",
  );
  assert.ok(
    sources.Notice.some((source) => /Thought Noble Class/u.test(source)),
    "Thought Noble should supply the second Notice acquisition",
  );
  assert.equal(sources.Notice.length, 2);
  assert.equal(
    deriveSkillProfile({
      purchased: -1,
      sourceCount: sources.Notice.length,
    }).effective,
    1,
  );
});

test("Elicitation of Truth requires Surface Apprehension everywhere the shared rule is used", () => {
  assert.equal(
    missingArtPrerequisite("Elicitation of Truth", ["Open Mind"]),
    "Surface Apprehension",
  );
  assert.equal(
    missingArtPrerequisite("Elicitation of Truth", [
      "Open Mind",
      "Surface Apprehension",
    ]),
    "",
  );

  assert.equal(
    missingArtPrerequisite("Deep Apprehension", []),
    "Surface Apprehension",
    "the shared helper must preserve the pre-existing prerequisite",
  );
});

test("Thought Noble grants exactly one new Art at every advancement and no spells", () => {
  for (let level = 1; level <= 9; level += 1) {
    const plan = advancementPlan(advancementCharacter(level));
    const grant = plan.artGrants.find(
      (entry) => entry.tradition === "Thought Noble",
    );
    const label = "level " + level + " -> " + (level + 1);
    assert.equal(grant?.count, 1, label);
    assert.equal(plan.spellPicks, 0, label);
    assert.deepEqual(plan.castingTraditions, []);
  }

  const pairedCaster = advancementPlan(advancementCharacter(1, "High Mage"));
  assert.deepEqual(pairedCaster.castingTraditions, ["High Mage"]);
  assert.ok(
    pairedCaster.artGrants.some(
      (grant) => grant.tradition === "Thought Noble" && grant.count === 1,
    ),
  );
});

test("Thought Noble class combinations use the correct partial-class combat tables", () => {
  assert.deepEqual(
    classRules("adventurer", "Warrior", "Thought Noble", 1),
    {
      attack: 1,
      hitDice: "1d6+2",
      focusPicks: 2,
      summary:
        "Partial Warrior: improved hit dice and attack; no Killing Blow or Veteran’s Luck. Each partial magical tradition uses its own arts, Effort, and restrictions.",
    },
  );

  const expert = classRules("adventurer", "Expert", "Thought Noble", 1);
  assert.equal(expert.attack, 0);
  assert.equal(expert.hitDice, "1d6");
  assert.equal(expert.focusPicks, 2);

  const mage = classRules("adventurer", "High Mage", "Thought Noble", 5);
  assert.equal(mage.attack, 1);
  assert.equal(mage.hitDice, "5d6-5");
  assert.equal(mage.focusPicks, 3);
});

test("Thought Noble rule enforcement is wired through creation, sheet, level-up, and importer", async () => {
  const [creation, wizard, sheet, levelUp, importer] = await Promise.all([
    readFile(new URL("../app/character-creation-base.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/character-creation-wizard-impl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/level-up-wizard-impl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/import-srd-classes.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(creation, /missingArtPrerequisite/u);
  assert.match(wizard, /missingArtPrerequisite/u);
  assert.match(sheet, /missingArtPrerequisite/u);
  assert.match(levelUp, /missingArtPrerequisite/u);

  assert.match(sheet, /effortMaximum\(/u);
  assert.match(sheet, /selectedClasses\.includes\("Thought Noble"\)/u);
  assert.match(sheet, /immune to that Art for the rest of the scene/u);

  assert.match(
    importer,
    /"Thought Noble": \{ kind: "mage", skill: "Notice", attribute: "INT\/WIS"/u,
  );
  assert.match(importer, /progression: \[2,3,4,5,6,7,8,9,10,11\]/u);
  assert.match(importer, /normalizeImportedArtText/u);
});


test("Thought Noble plain-language summaries are complete, useful sentences", () => {
  const expected = {
    "Open Mind": "While active, lets you read the current emotional state of a visible living creature.",
    "Block Memory": "Makes a visible living creature forget one scene-length event if it fails a Mental save.",
    "Elicitation of Truth": "Forces a helpless or willing target that fails a Mental save to answer one question fully and truthfully.",
    "Facile Speech": "Lets you use Far Speech on up to six chosen companions without spending Effort, at a range of one mile per level.",
    "Far Speech": "Creates a consensual telepathic link with a known creature, letting you share thoughts, speech, and images without a common language.",
    "Hypercognition": "Gives you eidetic memory and advanced mental calculation, and lets you reroll a failed INT-based skill check by spending Effort.",
    "Iconograph": "Lets you understand the intended meaning of visible writing or symbols, or create messages that chosen viewers automatically understand.",
    "Impress Imperative": "Compels a visible living creature that fails a Mental save to carry out one brief action on its next turn, so long as it is not completely against its nature.",
    "Mind Light": "Enhances Open Mind to sense nearby living minds, recognize known creatures and emotions, and prevents living creatures from surprising you.",
    "Mind Over Matter": "Lets you spend Effort for emergency stabilization, sleeplessness, healing, or temporary protection from ordinary heat and cold.",
    "Mirror Mask": "Warns you of mind-affecting powers, improves your resistance to them, and can feed false information back to the attacker.",
    "Positive Association": "Makes a visible sentient creature that fails a Mental save regard you as an admired friend until the effect is broken or expires.",
    "Read Intent": "Reveals what a visible living creature intends to do next, and can make Total Defense completely foil its avoidable attacks that round.",
    "Surface Apprehension": "Reads a visible living creature’s surface thoughts for one round if it fails a Mental save, including instinctive answers to questions you ask.",
    "Thoughts Like Razors": "Deals 1d8 nonlethal psychic damage per level to a visible living creature on a failed Mental save, with backlash on a successful save.",
    "Unthinkable Thought": "Makes a visible living creature that fails a Mental save unable to consciously notice a chosen person, object, or ongoing situation for up to a scene, then erases its memory of the subject.",
  };

  for (const art of traditionInfo["Thought Noble"].arts) {
    assert.equal(plainLanguageSummary(art.name, art.text), expected[art.name]);
  }
});

test("generic plain-language fallback does not truncate at ordinary words like the or target", () => {
  assert.equal(
    plainLanguageSummary(
      "Fallback regression",
      "You may identify the target and the object it is carrying.",
    ),
    "You identify the target and the object it is carrying.",
  );
});

test("audited Thought Noble text is free of known extraction artifacts", () => {
  const text = traditionInfo["Thought Noble"].arts
    .map((art) => art.text)
    .join("\n");
  assert.doesNotMatch(text, /tar get|over whelming|process es/u);
  assert.doesNotMatch(text, /Target a Visible Living Creature And Commit Effort/u);
});
