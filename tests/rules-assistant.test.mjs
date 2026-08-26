import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Rules Assistant is one shared search, result, dismissal, and compact-popover implementation", async () => {
  const [assistant, characterSheet, gmConsole, campaignCss] = await Promise.all([
    readFile(new URL("../app/rules-assistant.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/character-sheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/gm-console.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8"),
  ]);
  assert.match(characterSheet, /import \{ RulesAssistant \} from "\.\/rules-assistant"/u);
  assert.match(characterSheet, /<RulesAssistant \/>/u);
  assert.match(gmConsole, /<RulesAssistant compact className="gm-console-rules-assistant" id="gm-rules-question" \/>/u);
  assert.match(assistant, /searchRules\(trimmedQuestion\)/u);
  assert.match(assistant, /preloadRulesSearch/u);
  assert.match(assistant, /document\.addEventListener\("pointerdown", dismiss\)/u);
  assert.match(assistant, /event\.key === "Escape"/u);
  assert.match(assistant, /aria-expanded=\{open\}/u);
  assert.match(assistant, /role="dialog"/u);
  assert.match(assistant, /rules-assistant-compact/u);
  assert.match(campaignCss, /gm-console-hero\{position:relative;z-index:80;isolation:isolate;overflow:visible\}/u);
  assert.match(campaignCss, /gm-console-rules-assistant\{position:relative;z-index:130/u);
  assert.match(campaignCss, /rules-assistant-panel\{position:absolute/u);
  assert.match(campaignCss, /rules-assistant-compact \.rules-results\{position:static/u);
  assert.match(campaignCss, /@media\(max-width:640px\).*rules-assistant-panel\{position:fixed/u);
  assert.match(campaignCss, /rules-assistant-panel\{position:fixed;inset:12px 12px auto/u);
  assert.match(campaignCss, /@media\(min-width:641px\) and \(max-width:900px\)\{\.gm-console-rules-assistant \.rules-assistant-panel\{right:auto;left:0\}\}/u);
});
