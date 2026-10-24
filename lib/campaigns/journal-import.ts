import { journalLinkPaths } from "./journal-paths.ts";
import { outsideMarkdownCode } from "./journal-asset-links.ts";
/**
 * Obsidian vault inventory and link resolver for the campaign journal.
 * This module does not read archives or publish pages. Callers must validate
 * ZIP entry limits and store attachments behind authenticated endpoints.
 */
export type VaultEntry = { path: string; content: string };
export type JournalImportNote = {
  path: string;
  title: string;
  folder: string;
  markdown: string;
  visibility: "gm";
  links: { target: string; heading?: string; label?: string; resolvedPath?: string }[];
};
export type JournalImportPreview = {
  notes: JournalImportNote[];
  folders: string[];
  unresolvedLinks: { source: string; target: string }[];
};

export function safeVaultPath(input: string): string {
  if (typeof input !== "string" || input.length > 1024 || input.includes("\\") || /[\u0000-\u001f\u007f]/u.test(input)) {
    throw new Error("Invalid vault path.");
  }
  const normalized = input.replace(/^\.\//u, "").replace(/\/+/gu, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some(segment => segment === ".." || segment === "." || !segment)) {
    throw new Error("Unsafe vault path.");
  }
  return normalized;
}

export function inventoryObsidianVault(entries: readonly VaultEntry[]): JournalImportPreview {
  if (entries.length > 10000) throw new Error("Vault has too many entries.");
  const paths = new Set<string>();
  const markdownEntries: { path: string; content: string }[] = [];
  let totalSize = 0;
  for (const entry of entries) {
    const path = safeVaultPath(entry.path);
    if (paths.has(path.toLowerCase())) throw new Error("Duplicate vault path.");
    paths.add(path.toLowerCase());
    totalSize += entry.content.length;
    if (totalSize > 40_000_000) throw new Error("Vault notes are too large.");
    if (/\.md$/iu.test(path) && !path.split("/").some(segment => segment === ".obsidian")) {
      markdownEntries.push({ path, content: entry.content });
    }
  }
  const byPath = new Map(markdownEntries.map(entry => [entry.path.toLowerCase(), entry.path]));
  const byTitle = new Map<string, string[]>();
  for (const entry of markdownEntries) {
    const title = entry.path.split("/").at(-1)!.replace(/\.md$/iu, "");
    const key = title.toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) || []), entry.path]);
  }
  const folders = new Set<string>();
  const unresolvedLinks: JournalImportPreview["unresolvedLinks"] = [];
  const notes = markdownEntries.map(entry => {
    const parts = entry.path.split("/");
    const title = parts.pop()!.replace(/\.md$/iu, "");
    const folder = parts.join("/");
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
    const links: JournalImportNote["links"] = [];
    outsideMarkdownCode(entry.content, text => {
    for (const match of text.matchAll(/!?\[\[([^\]\n]+)\]\]/gu)) {
      const [targetAndHeading, label] = match[1].replace(/\\\|/gu,"|").split("|", 2);
      const [target, heading] = targetAndHeading.split("#", 2);
      if (!target) continue;
      // Attachment links are handled separately by the authenticated file importer.
      // Do not report PDFs or images as unresolved journal page links.
      if (/\.(?:png|jpe?g|gif|webp|pdf)$/iu.test(target.split(/[?#]/u, 1)[0])) continue;
      const normalizedTarget = target.replace(/\\/gu, "/").replace(/\.md$/iu, "");
      const candidate = normalizedTarget + ".md";
      const relative = folder ? folder + "/" + candidate : candidate;
      const resolvedPath = byPath.get(relative.toLowerCase()) || byPath.get(candidate.toLowerCase())
        || (byTitle.get(normalizedTarget.toLowerCase())?.length === 1
          ? byTitle.get(normalizedTarget.toLowerCase())![0] : undefined);
      if (!resolvedPath) unresolvedLinks.push({ source: entry.path, target });
      links.push({ target, ...(heading ? { heading } : {}), ...(label ? { label } : {}), ...(resolvedPath ? { resolvedPath } : {}) });
    }
    for(const match of text.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/gu)){
      const [target,heading]=match[2].split("#",2);
      if(!/\.md$/iu.test(target))continue;
      const resolvedPath=journalLinkPaths(entry.path,target).map(path=>byPath.get(path.toLowerCase())).find(Boolean);
      if(!resolvedPath)unresolvedLinks.push({source:entry.path,target});
      links.push({target,label:match[1],...(heading?{heading}:{}),...(resolvedPath?{resolvedPath}:{})});
    }
    return text;
    });
    return { path: entry.path, title, folder, markdown: entry.content, visibility: "gm" as const, links };
  });
  return { notes, folders: [...folders].sort(), unresolvedLinks };
}
