const sourceUrl = "https://wwn.quadrifons.com/assets/js/search-data.json";
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Unable to download SRD search data: ${response.status}`);

const decodeEntities = value => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const source = Object.values(await response.json());
const entries = source
  .filter(entry => entry.content?.trim())
  .map(entry => ({
    title: decodeEntities(entry.title.replace(/^\d+(?:\.\d+)*\s+/, "").trim()),
    category: "SRD rule",
    source: `WWN SRD · ${decodeEntities(entry.doc)}`,
    text: decodeEntities(entry.content.replace(/\s*\|\s*/g, " · ").replace(/\s+/g, " ").trim()),
  }));

const output = [
  "// Generated from the CC0 Worlds Without Number SRD search corpus.",
  "// Run `node scripts/import-srd-search.mjs` to refresh it.",
  "import type { RuleEntry } from \"./rules-search.ts\";",
  "",
  `export const completeSrdRules: RuleEntry[] = ${JSON.stringify(entries, null, 2)};`,
  "",
].join("\n");

await writeFile(new URL("../app/srd-search-data.ts", import.meta.url), output);
console.log(`Imported ${entries.length} complete SRD sections.`);
import { writeFile } from "node:fs/promises";
