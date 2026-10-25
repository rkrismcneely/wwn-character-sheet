import type { CSSProperties, ReactNode } from "react";
import { journalDocumentContent, parseJournalLayout, type JournalLayoutNode } from "@/lib/campaigns/journal-layout";
import { SessionRecapMarkdown } from "./session-recap-markdown";

export function JournalDocument({content,onJournalNavigate,previewImageUrls}:{content:string;onJournalNavigate:(id:string)=>void;previewImageUrls?:ReadonlySet<string>}) {
 const display=journalDocumentContent(content);
 const layout=parseJournalLayout(display);
 const render=(nodes:JournalLayoutNode[]):ReactNode=>nodes.map((node,index)=>node.kind==="text"
  ? <SessionRecapMarkdown key={index} content={node.content} onJournalNavigate={onJournalNavigate} journal previewImageUrls={previewImageUrls}/>
  : node.kind==="secret"?<section key={index} className="journal-document-secret" aria-label="GM-only content"><span className="journal-secret-label">GM only</span>{render(node.children)}</section>
  : <div key={index} className={node.kind==="section"?"journal-document-columns":"journal-document-column"} style={node.kind==="column"?{"--journal-column-width":node.width} as CSSProperties:undefined}>{render(node.children)}</div>);
 return <div className="journal-document">{layout?render(layout):<SessionRecapMarkdown content={display} onJournalNavigate={onJournalNavigate} journal previewImageUrls={previewImageUrls}/>}</div>;
}
