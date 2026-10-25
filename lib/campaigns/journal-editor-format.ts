import { outsideMarkdownCode } from "./journal-asset-links.ts";

export function safeEditorLink(value: string): boolean {
  if (/^\/journal-page\/[0-9a-f-]{36}(?:#[^\s]*)?$/iu.test(value)) return true;
  if (/^\/api\/campaigns\/cmp_[A-Za-z0-9_-]{22}\/journal\/files\/[0-9a-f-]{36}$/iu.test(value)) return true;
  try { const url = new URL(value); return /^(?:https?:)$/u.test(url.protocol) && !url.username && !url.password; } catch { return false; }
}

/** Fail closed when a visual editor cannot safely model the secret boundaries. */
export function visualSecretIssue(source: string): boolean {
  if(!journalSecretMarkersBalanced(source))return true;
  let depth = 0, invalid = false;
  outsideMarkdownCode(source, text => {
    if (!/<!--\s*gm-only:/iu.test(text)) return text;
    const marker = /^<!--\s*gm-only:(start|end)\s*-->[ \t]*$/iu.exec(text);
    if (!marker) { invalid = true; return text; }
    if (marker[1].toLowerCase() === "start") depth++;
    else if (--depth < 0) invalid = true;
    if (depth > 8) invalid = true;
    return text;
  });
  return invalid || depth !== 0;
}

/** Match the server's literal marker semantics, including markers in code examples. */
export function journalSecretMarkersBalanced(source:string):boolean{
  let depth=0;
  for(const marker of source.matchAll(/<!--\s*gm-only:(start|end)\s*-->/giu)){
    if(marker[1].toLowerCase()==="start")depth++;
    else if(depth===0)return false;
    else depth--;
  }
  return depth===0;
}

export function takeSecret(source: string): { raw: string; body: string } | undefined {
  const start = /^<!--\s*gm-only:start\s*-->[^\S\n]*\n/iu.exec(source);
  if (!start) return;
  let depth = 0, end = -1, closeStart = -1, offset = 0;
  // Scan whole lines, ignoring fenced code; unlike a regex this handles nesting.
  let fence = "";
  for (const line of source.split(/(?<=\n)/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = "";
    } else if (!fence) {
      const secret = /^\s*<!--\s*gm-only:(start|end)\s*-->\s*$/iu.exec(line);
      if (secret?.[1].toLowerCase() === "start") depth++;
      else if (secret && --depth === 0) { closeStart = offset; end = offset + line.length; break; }
    }
    offset += line.length;
  }
  if (end < 0) return;
  return { raw: source.slice(0, end), body: source.slice(start[0].length, closeStart).trim() };
}

export function takeLayout(source: string, kind: "section" | "column") {
  const start = kind === "section"
    ? /^<div data-layout-section="true">[^\S\n]*\n/u.exec(source)
    : /^<div data-layout-column="true"(?: data-column-width="(\d+(?:\.\d+)?)")?>[^\S\n]*\n/u.exec(source);
  if (!start) return;
  let depth = 0, offset = 0, fence = "";
  for (const line of source.split(/(?<=\n)/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = "";
    } else if (!fence) {
      if (/^\s*<div(?:\s[^>]*)?>\s*$/u.test(line)) depth++;
      else if (/^\s*<\/div>\s*$/u.test(line) && --depth === 0) return {
        raw: source.slice(0, offset + line.length), body: source.slice(start[0].length, offset),
        width: Math.max(10, Math.min(90, Number(start[1]) || 50)),
      };
    }
    if (depth > 8) return;
    offset += line.length;
  }
}

export const journalTemplates: Record<string, string> = {
  blank: "",
  character: '<div data-layout-section="true">\n<div data-layout-column="true" data-column-width="66.66">\n\n## Name\n\n*Role or description*\n\n### Overview\n\nWrite about this character.\n\n### Abilities\n\n- First ability\n- Second ability\n\n### Notes\n\n</div>\n<div data-layout-column="true" data-column-width="33.33">\n\n> [!NOTE]\n> **Role:** Add a role\n\n> [!NOTE]\n> **Location:** Add a location\n\n> [!NOTE]\n> **Affiliation:** Add a group\n\n</div>\n</div>',
  location: "## Overview\n\nDescribe this place.\n\n### Notable places\n\n- First place\n\n### People\n\nAdd people and links to their pages.\n\n<!-- gm-only:start -->\n### GM notes\n\nGM-only details go here.\n<!-- gm-only:end -->",
  session: "## Summary\n\nWhat happened?\n\n### Key events\n\n- First event\n\n### Discoveries\n\nWhat did the party learn?\n\n### Next session\n\nWhat comes next?",
};
