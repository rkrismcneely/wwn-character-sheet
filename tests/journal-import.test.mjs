import test from "node:test";
import assert from "node:assert/strict";
import { inventoryObsidianVault, safeVaultPath } from "../lib/campaigns/journal-import.ts";

test("whole vault inventory preserves folders and resolves Obsidian wiki links", () => {
  const preview = inventoryObsidianVault([
    { path: "Locations/Blackwater.md", content: "Meet [[Captain Elira|Elira]] and [[Hidden Temple#Vault]]." },
    { path: "NPCs/Captain Elira.md", content: "Secret cultist." },
    { path: "Locations/Hidden Temple.md", content: "GM secrets." },
  ]);
  assert.deepEqual(preview.folders, ["Locations", "NPCs"]);
  assert.equal(preview.notes.length, 3);
  assert.deepEqual(preview.notes[0].links.map(link => link.resolvedPath), ["NPCs/Captain Elira.md", "Locations/Hidden Temple.md"]);
  assert.equal(preview.notes[0].links[1].heading, "Vault");
  assert.equal(preview.notes.every(note => note.visibility === "gm"), true);
  assert.deepEqual(preview.unresolvedLinks, []);
});

test("missing links are reported without creating placeholder pages", () => {
  const preview = inventoryObsidianVault([{ path: "A.md", content: "[[Missing]]" }]);
  assert.deepEqual(preview.unresolvedLinks, [{ source: "A.md", target: "Missing" }]);
});

test("rejects traversal, absolute paths, duplicate paths and excessive entries", () => {
  for (const path of ["../secret.md", "/etc/passwd", "C:/secret.md", "a/./b.md", "a/../b.md", "a\\b.md"]) {
    assert.throws(() => safeVaultPath(path));
  }
  assert.throws(() => inventoryObsidianVault([
    { path: "Notes/A.md", content: "" }, { path: "notes/a.md", content: "" },
  ]));
});

test("attachment wikilinks are handled by file importer, not missing-page warnings",()=>{
 const result=inventoryObsidianVault([
  {path:"Notes/Overview.md",content:"![[art/map.png]] and [[docs/guide.pdf|PDF]] and [[Missing Page]]"},
 ]);
 assert.deepEqual(result.unresolvedLinks,[{source:"Notes/Overview.md",target:"Missing Page"}]);
 assert.deepEqual(result.notes[0].links.map(link=>link.target),["Missing Page"]);
});

test("Markdown code examples are not unresolved Journal page links",()=>{
 const text=[
  "```md",
  "[[Fictional Example]]",
  "```",
  "Instructions: `[[Not A Page]]`",
  "Real link: [[Missing Actual Page]]"
 ].join("\n");
 const preview=inventoryObsidianVault([{path:"Notes.md",content:text}]);
 assert.deepEqual(preview.unresolvedLinks,[{source:"Notes.md",target:"Missing Actual Page"}]);
});
