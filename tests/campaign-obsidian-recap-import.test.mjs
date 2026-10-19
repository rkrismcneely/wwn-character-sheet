import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_OBSIDIAN_IMPORT_BYTES,
  parseObsidianSessionRecap,
} from "../lib/campaigns/obsidian-recap-import.ts";

test("Obsidian YAML frontmatter prefills session date and title without including metadata in recap", () => {
  const result = parseObsidianSessionRecap(
    "---\ntitle: \"The Sunken Temple\"\nsession_date: 2026-10-12\ntags: [campaign, recap]\n---\n# The Sunken Temple\n\nWe discovered **ancient ruins**.\n\n- One\n- Two",
    "notes.md", "2026-10-19",
  );
  assert.deepEqual(result, {
    date: "2026-10-12",
    title: "The Sunken Temple",
    content: "We discovered **ancient ruins**.\n\n- One\n- Two",
    dateInferred: false,
  });
});

test("imports Obsidian date properties and quoted titles as Markdown", () => {
  const r = parseObsidianSessionRecap(
    "---\ntitle: 'Three Teeth''s Revenge'\ndate: 2026-10-17T19:00:00Z\n---\nA recap with [[Dunwich]] references.",
    "campaign-note.md", "2026-10-19",
  );
  assert.equal(r.title, "Three Teeth's Revenge");
  assert.equal(r.date, "2026-10-17");
  assert.match(r.content, /\[\[Dunwich\]\]/u);
});

test("imports a note named after the session date when frontmatter is absent", () => {
  const r = parseObsidianSessionRecap("# The Forgotten Shrine\r\n\r\nEveryone arrived.", "journal_2026-10-09.md", "2026-10-19");
  assert.equal(r.title, "The Forgotten Shrine");
  assert.equal(r.date, "2026-10-09");
  assert.equal(r.content, "Everyone arrived.");
  assert.equal(r.dateInferred, false);
});

test("falls back to clean filename title and today's date, flagging that date for review", () => {
  const r = parseObsidianSessionRecap("An adventure in the forest.\n", "Session_10 - The Forest.markdown", "2026-10-19");
  assert.equal(r.title, "Session 10 - The Forest");
  assert.equal(r.date, "2026-10-19");
  assert.equal(r.dateInferred, true);
});

test("invalid or impossible dates never become invalid HTML date input values", () => {
  const r = parseObsidianSessionRecap("---\ndate: 2026-02-30\n---\nA story.", "note.txt", "2026-10-19");
  assert.equal(r.date, "2026-10-19");
  assert.equal(r.dateInferred, true);
  assert.throws(() => parseObsidianSessionRecap("Hi", "note.md", "not-a-date"), /default session date is invalid/u);
});

test("recap import rejects invalid types, empty bodies, and notes that exceed save limits", () => {
  assert.equal(MAX_OBSIDIAN_IMPORT_BYTES, 128 * 1024);
  assert.throws(() => parseObsidianSessionRecap("Hello", "session.pdf", "2026-10-19"), /Markdown note/u);
  assert.throws(() => parseObsidianSessionRecap("", "blank.md", "2026-10-19"), /empty/u);
  assert.throws(() => parseObsidianSessionRecap("---\ndate: 2026-10-17\n---", "metadata.md", "2026-10-19"), /no recap text/u);
  assert.throws(() => parseObsidianSessionRecap("x".repeat(30001), "long.md", "2026-10-19"), /30,000-character/u);
});

test("GM recap list imports local Obsidian notes as drafts, not direct database writes", async () => {
  const [manager, css] = await Promise.all([
    readFile(new URL("../app/campaigns/session-recap-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/campaign-ui.css", import.meta.url), "utf8"),
  ]);
  assert.match(manager, /Import from Obsidian/u);
  assert.match(manager, /ref=\{importFileRef\} type="file"/u);
  assert.match(manager, /accept="\.md,\.markdown,\.txt,text\/markdown,text\/plain"/u);
  assert.match(manager, /onChange=\{event => void importObsidianNote\(event\)\}/u);
  assert.match(manager, /await file\.text\(\)/u);
  assert.match(manager, /MAX_OBSIDIAN_IMPORT_BYTES/u);
  assert.match(manager, /parseObsidianSessionRecap\(await file\.text\(\), file\.name, localToday\(\)\)/u);
  const start = manager.indexOf("async function importObsidianNote");
  const end = manager.indexOf("function openRecap", start);
  assert.ok(start > 0 && end > start);
  const importHandler = manager.slice(start, end);
  assert.match(importHandler, /setEditing\("new"\)/u);
  assert.match(importHandler, /setDraft\(\{ date: imported\.date, title: imported\.title, content: imported\.content \}\)/u);
  assert.match(importHandler, /setPreview\(true\)/u);
  assert.doesNotMatch(importHandler, /fetch\(|method: "POST"|save\(/u);
  assert.match(manager, /Save Session Recap/u);
  assert.match(manager, /role="status">\{importNotice\}/u);
  assert.match(css, /\.session-recap-heading-actions/u);
});

test("the player recap page does not offer import; imported Markdown uses existing authenticated GM save", async () => {
  const [player, manager, service] = await Promise.all([
    readFile(new URL("../app/campaigns/session-recap-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/campaigns/session-recap-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/campaigns/session-recaps.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(player, /Import from Obsidian|importObsidianNote|fileInputRef/u);
  assert.match(manager, /method: editing === "new" \? "POST" : "PATCH"/u);
  assert.match(service, /Only campaign GMs can edit session recaps/u);
});
