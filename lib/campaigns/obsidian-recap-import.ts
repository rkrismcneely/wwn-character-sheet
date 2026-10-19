/**
 * Import one Obsidian Markdown note into a draft session recap.
 * This never saves to a campaign or reaches into an Obsidian vault.
 * The browser file picker supplies the selected .md/.markdown/.txt file.
 */
export type ImportedSessionRecap = {
  date: string;
  title: string;
  content: string;
  dateInferred: boolean;
};

const MAX_RECAP_MARKDOWN = 30000;
const MAX_RECAP_TITLE = 120;
export const MAX_OBSIDIAN_IMPORT_BYTES = 128 * 1024;

function validDay(value: string): string | null {
  const date = /^\d{4}-\d{2}-\d{2}(?=$|[Tt\s])/u.exec(value.trim())?.[0];
  if (!date) return null;
  const instant = new Date(date + "T00:00:00Z");
  return !Number.isNaN(instant.valueOf()) && instant.toISOString().slice(0, 10) === date ? date : null;
}

function yamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/gu, '"');
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

function splitFrontmatter(text: string): { content: string; properties: Map<string, string> } {
  const properties = new Map<string, string>();
  if (!text.startsWith("---\n")) return { content: text, properties };
  const closing = /^---\s*$/gmu;
  closing.lastIndex = 4;
  const match = closing.exec(text);
  if (!match || match.index > 10000) return { content: text, properties };
  const block = text.slice(4, match.index);
  for (const line of block.split("\n")) {
    const property = /^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/iu.exec(line);
    if (property) properties.set(property[1].toLowerCase().replaceAll("-", "_"), yamlScalar(property[2]));
  }
  return { content: text.slice(match.index + match[0].length).replace(/^\n/u, "").trim(), properties };
}

function filenameTitle(filename: string): string {
  return filename.replace(/\.(?:md|markdown|txt)$/iu, "")
    .replace(/^\d{4}[-_.]\d{2}[-_.]\d{2}\s*[-–—_ ]*/u, "")
    .replaceAll("_", " ").trim() || "Imported session";
}

function dateFromFilename(filename: string): string | null {
  const match = /(?:^|[^0-9])(\d{4})[-_.](\d{2})[-_.](\d{2})(?!\d)/u.exec(filename);
  return match ? validDay([match[1], match[2], match[3]].join("-")) : null;
}

export function parseObsidianSessionRecap(
  raw: string,
  filename: string,
  defaultDate: string,
): ImportedSessionRecap {
  if (!/\.(?:md|markdown|txt)$/iu.test(filename)) {
    throw new Error("Choose an Obsidian Markdown note (.md, .markdown or .txt).");
  }
  const original = raw.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").trim();
  if (!original) throw new Error("That note is empty.");
  const { content: body, properties } = splitFrontmatter(original);
  if (!body) throw new Error("That note contains metadata but no recap text.");
  if (body.length > MAX_RECAP_MARKDOWN) {
    throw new Error("This note exceeds the 30,000-character recap limit. Shorten it in Obsidian and try again.");
  }
  const heading = /^#\s+(.+)\s*$/mu.exec(body)?.[1]?.trim();
  const fromProperties = properties.get("title")?.trim();
  const title = (fromProperties || heading || filenameTitle(filename)).slice(0, MAX_RECAP_TITLE).trim();
  const content = heading && title.toLowerCase() === heading.toLowerCase()
    ? body.replace(/^#\s+.+(?:\n|$)/mu, "").trim() || body
    : body;
  const detected = validDay(properties.get("session_date") || "")
    ?? validDay(properties.get("date") || "")
    ?? dateFromFilename(filename);
  const fallback = validDay(defaultDate);
  if (!fallback) throw new Error("The default session date is invalid.");
  return { date: detected ?? fallback, title, content, dateInferred: !detected };
}
