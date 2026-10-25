import type { CSSProperties, ReactNode } from "react";
import { journalDocumentContent, parseJournalLayout, type JournalLayoutNode } from "@/lib/campaigns/journal-layout";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { JournalLinkedNpc } from "./journal-linked-npc";

export function JournalDocument({content,onJournalNavigate,previewImageUrls,campaignId}:{content:string;onJournalNavigate:(id:string)=>void;previewImageUrls?:ReadonlySet<string>;campaignId?:string}) {
 const display=journalDocumentContent(content);
 const layout=parseJournalLayout(display);
 const renderText=(source:string):ReactNode=>source.split(/(\\{\\{twe-npc:[0-9a-f-]{36}\\}\\})/giu).map((part,index)=>{
  const reference=/^\\{\\{twe-npc:([0-9a-f-]{36})\\}\\}$/iu.exec(part);
  return reference&&campaignId?<JournalLinkedNpc key={index} campaignId={campaignId} npcId={reference[1]}/>:<SessionRecapMarkdown key={index} content={part} onJournalNavigate={onJournalNavigate} journal previewImageUrls={previewImageUrls}/>;
 });
 const render=(nodes:JournalLayoutNode[]):ReactNode=>nodes.map((node,index)=>node.kind==="text"
  ? <div key={index}>{renderText(node.content)}</div>
  : node.kind==="secret"?<section key={index} className="journal-document-secret" aria-label="GM-only content"><span className="journal-secret-label">GM only</span>{render(node.children)}</section>
  : <div key={index} className={node.kind==="section"?"journal-document-columns":"journal-document-column"} style={node.kind==="column"?{"--journal-column-width":node.width} as CSSProperties:undefined}>{render(node.children)}</div>);
 return <div className="journal-document">{layout?render(layout):renderText(display)}</div>;
}
