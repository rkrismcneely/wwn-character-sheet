import { markdownTextEntities } from "@/lib/markdown-entities";
import { safeJournalImage } from "@/lib/campaigns/journal-layout";
import { markdownTableCells } from "@/lib/markdown-table";
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

function inline(text: string, keyPrefix = "", onJournalNavigate?: (id:string)=>void, journal = false, previewImageUrls?: ReadonlySet<string>): ReactNode[] {
  const pattern = /(!\[[^\]\n]*\]\([^\s)]+(?:\s+"[^"\n]*")?\)|\[[^\]\n]+\]\([^\s)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/gu;
  const output: ReactNode[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > start) output.push(markdownTextEntities(text.slice(start, index)));
    const token = match[0];
    const key = keyPrefix + index;
    if (token.startsWith("![")) {
      const separator=token.indexOf("](");
      const label=markdownTextEntities(token.slice(2,separator));
      const source=token.slice(separator+2,-1).replace(/\s+"[^"\n]*"$/u,"");
      const image=/^\/api\/campaigns\/cmp_[A-Za-z0-9_-]{22}\/journal\/files\/[0-9a-f-]{36}$/iu.test(source);
      output.push((image || (journal && (safeJournalImage(source) || previewImageUrls?.has(source))))?<a key={key} className="journal-image-link" href={source} target="_blank" rel="noopener noreferrer" aria-label={label || "Open image"}><img src={source} alt={label} loading="lazy" referrerPolicy="no-referrer" style={{maxWidth:"100%"}}/></a>:label);
    } else if (token.startsWith("[")) {
      const separator = token.indexOf("](");
      const label = markdownTextEntities(token.slice(1, separator));
      const href = safeLink(token.slice(separator + 2, -1));
      const asset = /^\/api\/campaigns\/cmp_[A-Za-z0-9_-]{22}\/journal\/files\/[0-9a-f-]{36}$/iu.test(token.slice(separator + 2, -1));
      const local = /^\/journal-page\/([0-9a-f-]{36})(?:#.*)?$/iu.exec(token.slice(separator + 2, -1));
      output.push(local&&onJournalNavigate ? <button key={key} type="button" className="journal-inline-link" onClick={()=>onJournalNavigate(local[1])}>{label}</button> : asset ? <a key={key} href={token.slice(separator + 2, -1)} target="_blank" rel="noopener noreferrer">{label}</a> : href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label);
    } else if (token.startsWith("`")) {
      output.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      output.push(<strong key={key}>{inline(token.slice(2, -2), key + ":",onJournalNavigate,journal,previewImageUrls)}</strong>);
    } else if (token.startsWith("~~")) {
      output.push(<del key={key}>{inline(token.slice(2, -2), key + ":",onJournalNavigate,journal,previewImageUrls)}</del>);
    } else {
      output.push(<em key={key}>{inline(token.slice(1, -1), key + ":",onJournalNavigate,journal,previewImageUrls)}</em>);
    }
    start = index + token.length;
  }
  if (start < text.length) output.push(markdownTextEntities(text.slice(start)));
  return output;
}

function isSpecial(line: string) {
  return /^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|---+\s*$)/u.test(line);
}

export function SessionRecapMarkdown({ content,onJournalNavigate,journal = false, depth = 0, previewImageUrls }: { content: string;onJournalNavigate?: (id:string)=>void;journal?:boolean;depth?:number;previewImageUrls?:ReadonlySet<string> }) {
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
    if (i + 1 < lines.length && line.trim() && /^ {0,3}(?:=+|-+)\s*$/u.test(lines[i+1])) {
      blocks.push(<h3 key={key}>{inline(line,String(key),onJournalNavigate,journal,previewImageUrls)}</h3>);
      i += 2; continue;
    }
    if (/^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(line)) {
      blocks.push(<hr key={key} />); i++; continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      const text = inline(heading[2], String(key),onJournalNavigate,journal,previewImageUrls);
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
      const callout = journal && depth < 8 ? /^\[!(NOTE|INFO|TIP|WARNING|CAUTION|IMPORTANT)\]\s*(.*)$/iu.exec(quote[0] ?? "") : null;
      if(callout) {
        blocks.push(<aside key={key} className={"journal-callout journal-callout-"+callout[1].toLowerCase()}>{callout[2] && <strong className="journal-callout-title">{inline(callout[2],String(key),onJournalNavigate,journal,previewImageUrls)}</strong>}<SessionRecapMarkdown content={quote.slice(1).join("\n")} onJournalNavigate={onJournalNavigate} journal depth={depth+1} previewImageUrls={previewImageUrls}/></aside>);
        continue;
      }
      blocks.push(<blockquote key={key}>{quote.map((item, n) => <p key={n}>{inline(item, String(key) + ":" + n,onJournalNavigate,journal,previewImageUrls)}</p>)}</blockquote>);
      continue;
    }
    const isBullet = /^\s*[-*+]\s+/u.test(line);
    const isNumber = /^\s*\d+\.\s+/u.test(line);
    if (isBullet || isNumber) {
      const items: ReactNode[] = [];
      const matcher = isBullet ? /^\s*[-*+]\s+(.+)$/u : /^\s*\d+\.\s+(.+)$/u;
      while (i < lines.length && matcher.test(lines[i])) {
        const item = matcher.exec(lines[i])?.[1] ?? "";
        items.push(<li key={i}>{inline(item, String(i),onJournalNavigate,journal,previewImageUrls)}</li>);
        i++;
      }
      blocks.push(isBullet ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>);
      continue;
    }
    // Standard pipe table with a Markdown separator after the header.
    if (i + 1 < lines.length && line.includes("|") && /^\s*\|?[\s:|-]+\|?\s*$/u.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const parse = markdownTableCells;
      const columns = parse(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(parse(lines[i++]));
      const normalizedHeaders=columns.map(value=>value.trim().toLocaleLowerCase());
      const isProperties=journal&&normalizedHeaders.length===2&&normalizedHeaders[0]==="property"&&normalizedHeaders[1]==="value";
      const isStatTable=journal&&(
        normalizedHeaders.some(value=>["str","dex","con","int","wis","cha","strength","dexterity","constitution","intelligence","wisdom","charisma"].includes(value))||
        normalizedHeaders.some(value=>["armor class","hit points","hit dice","attack bonus","saving throw","ac","hp","hd"].includes(value))
      );
      const tableStyle=isProperties?" journal-table-properties":isStatTable?" journal-table-stats":"";
      blocks.push(<div key={key} className={"session-recap-table-wrap"+tableStyle}><table><thead><tr>{columns.map((cell, n) => <th key={n}>{inline(cell,"",onJournalNavigate,journal,previewImageUrls)}</th>)}</tr></thead><tbody>{rows.map((cells, n) => <tr key={n}>{columns.map((_, c) => <td key={c}>{inline(cells[c] ?? "","",onJournalNavigate,journal,previewImageUrls)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (i === key || !isSpecial(lines[i]))) {
      para.push(lines[i++]);
    }
    // Two trailing spaces create a deliberate Markdown hard break.
    blocks.push(<p key={key}>{para.map((part, n) => <Fragment key={n}>{n > 0 ? (para[n - 1].endsWith("  ") ? <br /> : " ") : null}{inline(part.trim(), String(key) + ":" + n,onJournalNavigate,journal,previewImageUrls)}</Fragment>)}</p>);
  }
  return <div className="session-recap-markdown">{blocks}</div>;
}
