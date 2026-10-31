import type { CSSProperties, ReactNode } from "react";
import { journalDocumentContent, parseJournalLayout, type JournalLayoutNode } from "@/lib/campaigns/journal-layout";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { SessionRecapAudioPlayer } from "./session-recap-audio-player";
import { recapSeekEvent,recapReferenceMarker } from "@/lib/campaigns/recap-audio-navigation";
import { JournalLinkedNpc } from "./journal-linked-npc";
import { JournalLinkedStore } from "./journal-linked-store";

export function JournalDocument({content,onJournalNavigate,previewImageUrls,campaignId,gmView=false}:{content:string;onJournalNavigate:(id:string)=>void;previewImageUrls?:ReadonlySet<string>;campaignId?:string;gmView?:boolean}) {
 const storeId=/^<!-- twe-store:(cstore_[a-f0-9]{32}) -->/mu.exec(content)?.[1];
 if(storeId&&gmView&&campaignId)return <JournalLinkedStore campaignId={campaignId} storeId={storeId}/>;
 const recapId=recapReferenceMarker.exec(content)?.[1]??null;
 const display=journalDocumentContent(content);
 const onSeekAudio=recapId?((seconds:number)=>{
   window.dispatchEvent(new CustomEvent(recapSeekEvent,{detail:{recapId,seconds}}));
 }):undefined;
 const layout=parseJournalLayout(display);
 const renderText=(source:string):ReactNode=>source.split(/(\{\{twe-npc:(?:cnpc_[0-9a-f]{32}|[0-9a-f-]{36})\}\})/giu).map((part,index)=>{
  const reference=/^\{\{twe-npc:((?:cnpc_[0-9a-f]{32}|[0-9a-f-]{36}))\}\}$/iu.exec(part);
  return reference&&campaignId?<JournalLinkedNpc key={index} campaignId={campaignId} npcId={reference[1]}/>:<SessionRecapMarkdown key={index} content={part} onJournalNavigate={onJournalNavigate} journal previewImageUrls={previewImageUrls} onSeekAudio={onSeekAudio}/>;
 });
 const render=(nodes:JournalLayoutNode[]):ReactNode=>nodes.map((node,index)=>node.kind==="text"
  ? <div key={index}>{renderText(node.content)}</div>
  : node.kind==="secret"?<section key={index} className="journal-document-secret" aria-label="GM-only content"><span className="journal-secret-label">GM only</span>{render(node.children)}</section>
  : <div key={index} className={node.kind==="section"?"journal-document-columns":"journal-document-column"} style={node.kind==="column"?{"--journal-column-width":node.width} as CSSProperties:undefined}>{render(node.children)}</div>);
 return <div className="journal-document">{layout?render(layout):renderText(display)}</div>;
}
