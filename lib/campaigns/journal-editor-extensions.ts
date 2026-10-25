import { Node, Extension, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import { safeJournalImage, parseJournalLayout } from "./journal-layout.ts";
import { journalPropertiesMarkdown } from "./journal-properties.ts";
import { markdownTableCells } from "../markdown-table.ts";
import { outsideMarkdownCode } from "./journal-asset-links.ts";
import { safeEditorLink, takeLayout, takeSecret, visualSecretIssue } from "./journal-editor-format.ts";
import { editableJournalProperties } from "./journal-editor-properties.ts";

const paragraph = (): JSONContent => ({ type: "paragraph" });

const PreservedInline = Node.create({
  name: "journalRawInline", inline: true, group: "inline", atom: true,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ["span", { class: "journal-preserved-inline", contenteditable: "false", title: "Preserved imported formatting" }, String(node.attrs.source)],
  renderMarkdown: node => String(node.attrs?.source ?? ""),
});

const Preserved = Node.create({
  name: "journalPreserved", group: "block", atom: true,
  addAttributes: () => ({ source: { default: "" }, label: { default: "Imported formatting" } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => {
    const source = String(node.attrs.source), formatted = journalPropertiesMarkdown(source);
    if (formatted.startsWith("| Property | Value |")) {
      const rows = formatted.split("\n").slice(2).filter(line => line.startsWith("|"));
      return ["div", { class: "journal-preserved", contenteditable: "false" }, ["strong", {}, "Properties"],
        ["table", {}, ["tbody", {}, ...rows.map(row => ["tr", {}, ...markdownTableCells(row).map(cell => ["td", {}, cell])])]]];
    }
    return ["details", { class: "journal-preserved", contenteditable: "false" }, ["summary", {}, String(node.attrs.label) + " (preserved)"], ["pre", {}, source]];
  },
  markdownTokenName: "html",
  parseMarkdown: token => ({ type: token.block === false ? "journalRawInline" : "journalPreserved", attrs: { source: token.raw ?? token.text ?? "" } }),
  renderMarkdown: node => String(node.attrs?.source ?? ""),
});

const Properties = Node.create({
  name: "journalProperties", group: "block", atom: true,
  addAttributes: () => ({ source: { default: "" } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ["div", { class: "journal-preserved", contenteditable: "false" }, ["strong", {}, "Imported properties (preserved)"], ["pre", {}, String(node.attrs.source)]],
  markdownTokenizer: {
    name: "journalProperties", level: "block", start: source => source.indexOf("---\n"),
    tokenize: source => {
      const match = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[^\S\n]*(?:\n|$)/u.exec(source);
      if (match && editableJournalProperties(match[0])) return { type: "journalProperties", raw: match[0], text: match[0] };
    },
  },
  parseMarkdown: token => ({ type: "journalPreserved", attrs: { source: token.raw, label: "Imported properties" } }),
  renderMarkdown: node => String(node.attrs?.source ?? ""),
});

const WikiLink = Node.create({
  name: "journalWikiLink", inline: true, group: "inline", atom: true,
  addAttributes: () => ({ source: { default: "" }, label: { default: "Page link" } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ["span", { class: "journal-editor-page-link", contenteditable: "false" }, String(node.attrs.label)],
  markdownTokenizer: {
    name: "journalWikiLink", level: "inline", start: source => source.indexOf("[["),
    tokenize: source => {
      const match = /^(!?\[\[([^\]\n]+)\]\])/u.exec(source);
      if (match) return { type: "journalWikiLink", raw: match[0], text: match[2].replace(/\\\|/gu, "|").split("|").at(-1) };
    },
  },
  parseMarkdown: token => ({ type: "journalWikiLink", attrs: { source: token.raw, label: token.text } }),
  renderMarkdown: node => String(node.attrs?.source ?? ""),
});

// Some exports include a trailing space inside a bold mark. Keep its visual meaning.
const ImportedStrong = Extension.create({
  name:"journalImportedStrong",
  markdownTokenizer:{name:"journalImportedStrong",level:"inline",start:source=>source.search(/\*\*|__/u),tokenize:(source,_tokens,lexer)=>{
    const match=/^(\*\*|__)([^\n]+?)([ \t]+)\1/u.exec(source);
    if(!match||match[2].includes(match[1]))return;
    return {type:"journalImportedStrong",raw:match[0],space:match[3],tokens:lexer.inlineTokens(match[2])};
  }},
  parseMarkdown:(token,helpers)=>[...helpers.parseInline(token.tokens??[]).map(node=>({...node,marks:[...(node.marks??[]).filter(mark=>mark.type!=="bold"),{type:"bold"}]})),{type:"text",text:String(token.space)}],
});

const Columns = Node.create({
  name: "journalColumns", group: "block", content: "journalColumn+", isolating: true,
  parseHTML: () => [{ tag: 'div[data-layout-section="true"]' }],
  renderHTML: () => ["div", { "data-layout-section": "true", class: "journal-visual-columns" }, 0],
  markdownTokenizer: {
    name: "journalColumns", level: "block", start: source => source.indexOf('<div data-layout-section="true">'),
    tokenize: (source, _tokens, lexer) => { const part = takeLayout(source, "section"); if (part) return { type: "journalColumns", raw: part.raw, tokens: lexer.blockTokens(part.body) }; },
  },
  parseMarkdown: (token, helpers) => {
    const children=helpers.parseChildren(token.tokens??[]), columns=children.filter(node=>node.type==="journalColumn");
    if(!columns.length||children.some(node=>node.type!=="journalColumn"&&(node.type!=="paragraph"||node.content?.length)))return {type:"journalPreserved",attrs:{source:token.raw,label:"Imported columns"}};
    return {type:"journalColumns",content:columns};
  },
  renderMarkdown: (node, helpers) => '<div data-layout-section="true">\n\n' + helpers.renderChildren(node.content ?? [], "\n\n") + '\n\n</div>',
});

const Column = Node.create({
  name: "journalColumn", content: "block+", isolating: true,
  addAttributes: () => ({ width: { default: 50 } }),
  parseHTML: () => [{ tag: 'div[data-layout-column="true"]', getAttrs: element => ({ width: Math.max(10, Math.min(90, Number(element.getAttribute("data-column-width")) || 50)) }) }],
  renderHTML: ({ node }) => ["div", { "data-layout-column": "true", "data-column-width": node.attrs.width, class: "journal-visual-column", style: "flex-grow:" + Math.max(10, Math.min(90, Number(node.attrs.width) || 50)) }, 0],
  markdownTokenizer: {
    name: "journalColumn", level: "block", start: source => source.indexOf('<div data-layout-column="true"'),
    tokenize: (source, _tokens, lexer) => { const part = takeLayout(source, "column"); if (part) return { type: "journalColumn", raw: part.raw, width: part.width, tokens: lexer.blockTokens(part.body) }; },
  },
  parseMarkdown: (token, helpers) => ({ type: "journalColumn", attrs: { width: Number(token.width) || 50 }, content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [paragraph()] }),
  renderMarkdown: (node, helpers) => '<div data-layout-column="true" data-column-width="' + Math.max(10, Math.min(90, Number(node.attrs?.width) || 50)) + '">\n\n' + helpers.renderChildren(node.content ?? [], "\n\n") + '\n\n</div>',
});

const Callout = Node.create({
  name: "journalCallout", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ kind: { default: "NOTE" }, title: { default: "" } }),
  parseHTML: () => [{ tag: "aside[data-journal-callout]" }],
  renderHTML: ({ node }) => ["aside", { "data-journal-callout": "true", class: "journal-visual-callout", "data-kind": node.attrs.kind, "data-title": node.attrs.title }, 0],
  markdownTokenizer: {
    name: "journalCallout", level: "block", start: source => source.search(/^>\s*\[!/mu),
    tokenize: (source, _tokens, lexer) => {
      const header = /^>\s*\[!(NOTE|INFO|TIP|WARNING|CAUTION|IMPORTANT)\][ \t]*(.*)(?:\n|$)/iu.exec(source);
      if (!header) return;
      const rest = /^(?:>[^\n]*(?:\n|$))*/u.exec(source.slice(header[0].length))?.[0] ?? "";
      return { type: "journalCallout", raw: header[0] + rest, kind: header[1].toUpperCase(), title: header[2], tokens: lexer.blockTokens(rest.replace(/^> ?/gmu, "")) };
    },
  },
  parseMarkdown: (token, helpers) => ({ type: "journalCallout", attrs: { kind: token.kind, title: token.title }, content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [paragraph()] }),
  renderMarkdown: (node, helpers) => '> [!' + String(node.attrs?.kind || "NOTE") + ']' + (node.attrs?.title ? ' ' + String(node.attrs.title) : '') + '\n' + helpers.renderChildren(node.content ?? [], "\n\n").split("\n").map(line => '> ' + line).join("\n"),
});

const Secret = Node.create({
  name: "journalSecret", group: "block", content: "block+", isolating: true, defining: true,
  parseHTML: () => [],
  renderHTML: () => ["section", { class: "journal-visual-secret", "data-journal-secret": "true" }, 0],
  markdownTokenizer: {
    name: "journalSecret", level: "block", start: source => source.search(/<!--\s*gm-only:start/iu),
    tokenize: (source, _tokens, lexer) => { const part = takeSecret(source); if (part) return { type: "journalSecret", raw: part.raw, tokens: lexer.blockTokens(part.body) }; },
  },
  parseMarkdown: (token, helpers) => ({ type: "journalSecret", content: helpers.parseChildren(token.tokens ?? []).length ? helpers.parseChildren(token.tokens ?? []) : [paragraph()] }),
  renderMarkdown: (node, helpers) => '<!-- gm-only:start -->\n' + helpers.renderChildren(node.content ?? [], "\n\n") + '\n<!-- gm-only:end -->',
});

const JournalImage = Image.extend({
  parseHTML: () => [{ tag: "img[src]", getAttrs: element => safeJournalImage(element.getAttribute("src") ?? "") ? { src: element.getAttribute("src"), alt: element.getAttribute("alt") } : false }],
  parseMarkdown: (token, helpers) => safeJournalImage(String(token.href)) || String(token.href).startsWith("blob:")
    ? helpers.createNode("image", { src: token.href, title: token.title, alt: token.text })
    : { type: "journalRawInline", attrs: { source: token.raw } },
}).configure({ allowBase64: false, HTMLAttributes: { referrerpolicy: "no-referrer" } });

export function journalEditorExtensions() {
  return [StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: false, isAllowedUri: safeEditorLink } }),
    TableKit.configure({ table: { resizable: false } }), JournalImage, WikiLink, ImportedStrong, Properties, Preserved, PreservedInline, Columns, Column, Callout, Secret, Markdown];
}

export function createJournalMarkdownManager() { return new MarkdownManager({ extensions: journalEditorExtensions() }); }

export function initialJournalDocument(manager: MarkdownManager, source: string): JSONContent {
  let hasLayout = false;
  outsideMarkdownCode(source, text => { if (/<div data-layout-/u.test(text)) hasLayout = true; return text; });
  if (visualSecretIssue(source) || (hasLayout && !parseJournalLayout(source))) return { type: "doc", content: [{ type: "journalPreserved", attrs: { source, label: "Page formatting" } }] };
  const frontmatter=/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[^\S\n]*(?:\r?\n|$)/u.exec(source);
  if(frontmatter&&/^(?:[\p{L}\p{N}_-][^:*#\r\n]*|"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'):/u.test(frontmatter[1].split(/\r?\n/u).find(line=>line.trim()&&!line.trim().startsWith("#"))??"")){
    const rest=manager.parse(source.slice(frontmatter[0].length));
    return {type:"doc",content:[{type:"journalPreserved",attrs:{source:frontmatter[0],label:"Imported properties"}},...(rest.content??[])]};
  }
  const parsed=manager.parse(source);
  return parsed.content?.length?parsed:{type:"doc",content:[paragraph()]};
}
