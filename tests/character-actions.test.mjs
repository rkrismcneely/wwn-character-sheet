import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("character dashboard keeps Duplicate as the first More actions item and Archive second", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard, /<\/Link>\s*<button[^>]*onClick=\{\(\) => void duplicate\(character\)\}/u);
  assert.match(dashboard, /: <details className="dashboard-secondary-actions"><summary>More actions<\/summary><div><button type="button" className="dashboard-secondary" onClick=\{\(\) => void duplicate\(character\)\} disabled=\{working\}>Duplicate<\/button><button type="button" className="dashboard-secondary dashboard-archive" onClick=\{\(\) => void setArchived\(character, true\)\} disabled=\{working\}>\{working \? "Working…" : "Archive character"\}<\/button><\/div><\/details>/u);
  assert.match(dashboard, /window\.confirm\(`Archive \$\{character\.name \|\| "this character"\}\?/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}\/duplicate`, \{ method: "POST" \}\)/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}\/archive`,/u);
});

test("archived character actions are ordered in one menu and reuse permanent deletion", async () => {
  const dashboard = await readFile(new URL("../app/dashboard-page.tsx", import.meta.url), "utf8");

  assert.match(dashboard, /character\.archivedAt \? <details className="dashboard-secondary-actions"><summary>More actions<\/summary><div><button type="button" className="dashboard-secondary" onClick=\{\(\) => void setArchived\(character, false\)\} disabled=\{working\}>\{working \? "Working…" : "Restore"\}<\/button><button type="button" className="dashboard-secondary" onClick=\{\(\) => void duplicate\(character\)\} disabled=\{working\}>Duplicate<\/button><button type="button" className="dashboard-secondary dashboard-danger" onClick=\{\(\) => void deleteCharacter\(character\)\} disabled=\{working\}>\{working \? "Working…" : "Delete"\}<\/button><\/div><\/details>/u);
  assert.doesNotMatch(dashboard, /character\.archivedAt \? <><button[^>]*>\{working \? "Working…" : "Restore"\}<\/button>/u);
  assert.match(dashboard, /window\.confirm\(`Delete \$\{characterName\} from My Characters\?\\n\\nThis cannot be undone\.`\)/u);
  assert.match(dashboard, /fetch\(`\/api\/characters\/\$\{character\.id\}`, \{ method: "DELETE" \}\)/u);
});
