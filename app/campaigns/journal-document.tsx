import type { CSSProperties, ReactNode } from "react";
import { parseJournalLayout, type JournalLayoutNode } from "@/lib/campaigns/journal-layout";
import { SessionRecapMarkdown } from "./session-recap-markdown";

export function JournalDocument({content,onJournalNavigate}:{content:string;onJournalNavigate:(id:string)=>void}) {
 const layout=parseJournalLayout(content);
 const render=(nodes:JournalLayoutNode[]):ReactNode=>nodes.map((node,index)=>node.kind==="text"
  ? <SessionRecapMarkdown key={index} content={node.content} onJournalNavigate={onJournalNavigate} journal />
  : <div key={index} className={node.kind==="section"?"journal-document-columns":"journal-document-column"} style={node.kind==="column"?{"--journal-column-width":node.width} as CSSProperties:undefined}>{render(node.children)}</div>);
 return <div className="journal-document">{layout?render(layout):<SessionRecapMarkdown content={content} onJournalNavigate={onJournalNavigate} journal />}</div>;
}
