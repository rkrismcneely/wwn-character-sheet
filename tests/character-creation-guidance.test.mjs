import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wizardSource = await readFile(
  new URL("../app/character-creation-wizard.tsx", import.meta.url),
  "utf8",
);
const guidanceSource = await readFile(
  new URL("../app/character-creation-guidance.tsx", import.meta.url),
  "utf8",
);
const guidanceCss = await readFile(
  new URL("../app/character-creation-guidance.css", import.meta.url),
  "utf8",
);

const selectableClasses = [
  "Warrior",
  "Expert",
  "High Mage",
  "Elementalist",
  "Necromancer",
  "Invoker",
  "Healer",
  "Vowed",
  "Accursed",
  "Bard",
  "Beastmaster",
  "Blood Priest",
  "Duelist",
  "Mageslayer",
  "Skinshifter",
  "Thought Noble",
  "Wise",
];

test("every selectable class has a player-facing gameplay description", () => {
  for (const className of selectableClasses) {
    const quoted = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      guidanceSource,
      new RegExp(`(?:\\"${quoted}\\"|${quoted}):\\s*\\n?\\s*\\"`),
      `${className} should have a short class description`,
    );
  }
  assert.match(wizardSource, /classPlayDescriptions\[sheet\.classOne\]/);
  assert.match(wizardSource, /classPlayDescriptions\[sheet\.classTwo\]/);
  assert.ok(
    wizardSource.indexOf("classPlayDescriptions[sheet.classOne]") <
      wizardSource.indexOf('className="creation-rule-callout"'),
    "class guidance should appear before the mechanical class callout",
  );
});

test("selected Foci, Arts, and Spells show a concise summary plus full rules help", () => {
  assert.match(wizardSource, /ruleSummary\(selectedFocus\.intro\)/);
  assert.match(wizardSource, /fullText=\{focusFullRules\(selectedFocus\)\}/);
  assert.match(wizardSource, /ruleSummary\(selectedArt\.text\)/);
  assert.match(wizardSource, /fullText=\{selectedArt\.text\}/);
  assert.match(wizardSource, /ruleSummary\(selectedSpell\.text\)/);
  assert.match(wizardSource, /fullText=\{selectedSpell\.text\}/);
  assert.match(wizardSource, /className="creation-selection-summary"/);
});

test("rules help is usable by hover, keyboard focus, click, touch, and Escape", () => {
  assert.match(guidanceSource, /onMouseEnter=\{\(\) => setHovered\(true\)\}/);
  assert.match(guidanceSource, /onMouseLeave=\{\(\) => setHovered\(false\)\}/);
  assert.match(guidanceSource, /const open = hovered \|\| focused \|\| pinned/);
  assert.match(guidanceSource, /onClick=\{\(event\) => \{/);
  assert.match(guidanceSource, /setPinned\(true\)/);
  assert.match(guidanceSource, /onFocus=\{\(\) => setFocused\(true\)\}/);
  assert.match(guidanceSource, /onBlur=\{\(\) => \{/);
  assert.match(guidanceSource, /event\.key === "Escape"/);
  assert.match(guidanceSource, /aria-label=\{`Show full rules for \$\{label\}`\}/);
  assert.match(guidanceSource, /aria-expanded=\{open\}/);
  assert.match(guidanceSource, /role="tooltip"/);
  assert.match(guidanceCss, /@media \(max-width: 700px\)[\s\S]*?position: fixed/);
});
