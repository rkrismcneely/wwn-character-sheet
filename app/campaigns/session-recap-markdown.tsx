import { Fragment, type ReactNode } from "react";

/** A deliberately safe, dependency-free Markdown display for campaign recaps.
 * No raw HTML is parsed or injected; text is escaped by React. Only HTTP(S)
 * links are clickable. Supports headings, lists, code, emphasis, links, quotes,
 * horizontal rules and basic Markdown tables. */
function safeLink(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function inline(text: string, keyPrefix = ""): ReactNode[] {
  const pattern = /(\[[^\]\n]+\]\([^\s)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gu;
  const output: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > start) output.push(text.slice(start, index));
    const token = match[0];
    const key = keyPrefix + index;
    if (token.startsWith("[")) {
      const separator = token.indexOf("](");
      const label = token.slice(1, separator);
      const href = safeLink(token.slice(separator + 2, -1));
      output.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label);
    } else if (token.startsWith("`")) {
      output.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      output.push(<strong key={key}>{inline(token.slice(2, -2), key + ":")}</strong>);
    } else if (token.startsWith("~~")) {
      output.push(<del key={key}>{inline(token.slice(2, -2), key + ":")}</del>);
    } else {
      output.push(<em key={key}>{inline(token.slice(1, -1), key + ":")}</em>);
    }
    start = index + token.length;
  }
  if (start < text.length) output.push(text.slice(start));
  return output;
}

function isSpecial(line: string) {
  return /^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|---+\s*$)/u.test(line);
}

export function SessionRecapMarkdown({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = i;
    if (/^\s*```/u.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/u.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={key}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      const text = inline(heading[2], String(key));
      const level = heading[1].length;
      blocks.push(level === 1 ? <h2 key={key}>{text}</h2> : level === 2 ? <h3 key={key}>{text}</h3> : <h4 key={key}>{text}</h4>);
      i++; continue;
    }
    if (/^\s*---+\s*$/u.test(line)) {
      blocks.push(<hr key={key} />); i++; continue;
    }
    if (/^\s*>/u.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/u.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/u, ""));
      blocks.push(<blockquote key={key}>{quote.map((item, n) => <p key={n}>{inline(item, String(key) + ":" + n)}</p>)}</blockquote>);
      continue;
    }
    const isBullet = /^\s*[-*+]\s+/u.test(line);
    const isNumber = /^\s*\d+\.\s+/u.test(line);
    if (isBullet || isNumber) {
      const items: ReactNode[] = [];
      const matcher = isBullet ? /^\s*[-*+]\s+(.+)$/u : /^\s*\d+\.\s+(.+)$/u;
      while (i < lines.length && matcher.test(lines[i])) {
        const item = matcher.exec(lines[i])?.[1] ?? "";
        items.push(<li key={i}>{inline(item, String(i))}</li>);
        i++;
      }
      blocks.push(isBullet ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>);
      continue;
    }
    // Standard pipe table with a Markdown separator after the header.
    if (i + 1 < lines.length && line.includes("|") && /^\s*\|?[\s:|-]+\|?\s*$/u.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const parse = (raw: string) => raw.replace(/^\s*\|/u, "").replace(/\|\s*$/u, "").split("|").map(cell => cell.trim());
      const columns = parse(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(parse(lines[i++]));
      blocks.push(<div key={key} className="session-recap-table-wrap"><table><thead><tr>{columns.map((cell, n) => <th key={n}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((cells, n) => <tr key={n}>{columns.map((_, c) => <td key={c}>{inline(cells[c] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (i === key || !isSpecial(lines[i]))) {
      para.push(lines[i++]);
    }
    // Two trailing spaces create a deliberate Markdown hard break.
    blocks.push(<p key={key}>{para.map((part, n) => <Fragment key={n}>{n > 0 ? (para[n - 1].endsWith("  ") ? <br /> : " ") : null}{inline(part.trim(), String(key) + ":" + n)}</Fragment>)}</p>);
  }
  return <div className="session-recap-markdown">{blocks}</div>;
}
