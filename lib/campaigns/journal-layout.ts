import { outsideMarkdownCode } from "./journal-asset-links.ts";
export type JournalLayoutNode = { kind: "text"; content: string } | { kind: "section" | "column" | "secret"; width?: number; children: JournalLayoutNode[] };

/** Recognize only the fixed layout markers emitted by LegendKeeper exports. */
export function parseJournalLayout(content: string): JournalLayoutNode[] | null {
 const root: JournalLayoutNode[] = [], stack: { kind: "section" | "column" | "secret"; width?: number; children: JournalLayoutNode[] }[] = [];
 let fence = "", found = false;
 const children = () => stack.at(-1)?.children ?? root;
 const text = (line: string) => {
  const list = children(), previous = list.at(-1);
  if(previous?.kind === "text") previous.content += "\n" + line;
  else list.push({kind:"text",content:line});
 };
 for(const line of content.replace(/\r\n/gu,"\n").split("\n")) {
  const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
  if(marker) {
   if(!fence) fence=marker[1];
   else if(marker[1][0]===fence[0] && marker[1].length>=fence.length && !line.slice(marker[0].length).trim()) fence="";
   text(line); continue;
  }
  if(fence) {text(line);continue;}
  const secret = /^\s*<!--\s*gm-only:(start|end)\s*-->\s*$/iu.exec(line);
  if(secret){
   if(secret[1].toLowerCase()==="start"){
    if(stack.length>=8)return null;
    const node={kind:"secret" as const,children:[] as JournalLayoutNode[]};children().push(node);stack.push(node);found=true;
   }else{if(stack.at(-1)?.kind!=="secret")return null;stack.pop();}
   continue;
  }
  const section = /^\s*<div data-layout-section="true">\s*$/u.test(line);
  const column = /^\s*<div data-layout-column="true"(?: data-column-width="(\d+(?:\.\d+)?)")?>\s*$/u.exec(line);
  if(section || column) {
   if(stack.length>=8 || (column && stack.at(-1)?.kind!=="section") || (section && stack.at(-1)?.kind==="section")) return null;
   const node = {kind:section?"section" as const:"column" as const, ...(column?{width:Math.max(10,Math.min(90,Number(column[1])||50))}:{}),children:[] as JournalLayoutNode[]};
   children().push(node);stack.push(node);found=true;
  } else if(/^\s*<\/div>\s*$/u.test(line) && stack.length) {if(stack.at(-1)?.kind==="secret")return null;stack.pop();}
  else text(line);
 }
 if(stack.length || !found) return null;
 return root;
}

export function safeJournalImage(source: string): boolean {
 if(/^\/api\/campaigns\/cmp_[A-Za-z0-9_-]{22}\/journal\/files\/[0-9a-f-]{36}$/iu.test(source)) return true;
 try {
  const url=new URL(source);
  return url.protocol==="https:" && url.hostname==="assets.legendkeeper.com" && !url.username && !url.password && !url.port && /\.(?:png|jpe?g|webp|gif)$/iu.test(url.pathname);
 } catch {return false;}
}

/** Hide converter metadata in reading mode, while preserving code and stored text. */
export function journalDocumentContent(content: string): string {
 return outsideMarkdownCode(content, text => text.replace(/^<!-- Restricted LegendKeeper resource; review before sharing\. -->[ \t]*$/gmu, "").replace(/^<!-- twe-store:[A-Za-z0-9_-]+ -->[ \t]*$/gmu, ""));
}
