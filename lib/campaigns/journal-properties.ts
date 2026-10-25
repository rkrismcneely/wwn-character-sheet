/**
 * Present Obsidian frontmatter without changing the stored note.
 * Only simple top-level property records are formatted; unfamiliar YAML is
 * preserved in a code block instead of being guessed or discarded.
 */
export function journalPropertiesMarkdown(content: string): string {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
  const match = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/u.exec(normalized);
  if (!match) return content;
  const records: { label: string; values: string[] }[] = [];
  let unsupported = false;
  for (const line of match[1].split("\n")) {
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    const property = /^([^\s:#][^:]*):(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    if (property) {
      records.push({ label: property[1].trim(), values: [property[2] ?? ""] });
    } else if (/^\s+\S/u.test(line) && records.length) {
      records[records.length - 1].values.push(line.trim().replace(/^-\s+/u, ""));
    } else if (/^-\s+/u.test(line) && records.length) {
      records[records.length - 1].values.push(line.replace(/^-\s+/u, ""));
    } else unsupported = true;
  }
  const unquote = (value: string) => {
    if (/^"(?:[^"\\]|\\.)*"$/u.test(value)) {
      try { return JSON.parse(value) as string; } catch { return value; }
    }
    return /^'(?:[^']|'')*'$/u.test(value) ? value.slice(1, -1).replace(/''/gu, "'") : value;
  };
  const cell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
  const rows = records.map(({ label, values }) => {
    const scalar = values[0];
    const value = values.length > 1
      ? values.slice(/^[>|][-+]?$/u.test(scalar) || !scalar ? 1 : 0).map(unquote).join(", ")
      : unquote(scalar);
    return `| ${cell(unquote(label))} | ${cell(value || "—")} |`;
  });
  const front = unsupported || !rows.length
    ? "\`\`\`yaml\n" + match[1] + "\n\`\`\`"
    : "| Property | Value |\n| --- | --- |\n" + rows.join("\n");
  return front + "\n\n" + normalized.slice(match[0].length);
}
