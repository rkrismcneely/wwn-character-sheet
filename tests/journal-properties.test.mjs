import test from "node:test";
import assert from "node:assert/strict";
import { journalPropertiesMarkdown } from "../lib/campaigns/journal-properties.ts";

test("Obsidian properties retain labels, list values, empty values and body", () => {
 const source = '---\nIterum: "845"\nActive: No\nTitle or Role: Merchant\nReligion:\nSession:\n  - S17\nAbout: Contact of the Volthites. Assassin. Merchant.\n---\n\nLonger descriptions would go here.';
 const result = journalPropertiesMarkdown(source);
 assert.ok(result.includes("| Iterum | 845 |"));
 assert.ok(result.includes("| Active | No |"));
 assert.ok(result.includes("| Religion | — |"));
 assert.ok(result.includes("| Session | S17 |"));
 assert.ok(result.endsWith("\n\nLonger descriptions would go here."));
 assert.equal(source.includes('Iterum: "845"'), true);
});
test("frontmatter links and table pipes stay intact for later link resolution", () => {
 const result = journalPropertiesMarkdown('---\nLocation: "[[Bastien|City]]"\n---\nBody');
 assert.ok(result.includes('[[Bastien\\|City]]'));
 assert.ok(result.endsWith("\n\nBody"));
});
test("ordinary markdown and malformed frontmatter remain untouched", () => {
 for (const source of ["---\nOrdinary paragraph", "# Page\nBody", "Body\n---\nAfter"]) assert.equal(journalPropertiesMarkdown(source), source);
});
test("unrecognized frontmatter is preserved without flattening", () => {
 const result = journalPropertiesMarkdown("---\n? complex key\n: value\n---\nBody");
 assert.ok(result.startsWith("```yaml\n? complex key\n: value\n```"));
 assert.ok(result.endsWith("\n\nBody"));
});
